import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  refuseOrdinaryEditionInGuillotineLeague,
  refuseSurvivalEditionWithoutEliminations,
  recordBlock,
} from '../src/cli.mjs';
import {
  TASKS,
  RANKING_TASKS,
  ELIMINATION_ONLY_TASKS,
  buildContext,
  buildPrompt,
} from '../src/promptContext.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { buildDangerBoard } from '../src/analysis/danger.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { loadConfig, rankEmoji, resolveRankingWeights, ROOT } from '../src/config.mjs';

/**
 * The survival rankings: the guillotine league's power ranking.
 *
 * What is being pinned down here is the task's acceptance:
 *
 * - the edition exists as a registered task with a prompt file of its own,
 *   steered by a guillotine weight set that weighs floor rather than assets;
 * - only the field still alive is ranked — a chopped team appears in
 *   `eliminationHistory` and nowhere a rank could be read off it;
 * - neither edition crosses formats, guarded in both directions and in both
 *   places, the same way the survival preview and chop recap already are;
 * - the shipped rank-emoji table covers an 18-team league, the size a
 *   guillotine league normally starts at.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

// Point config at a file that does not exist so the developer's own .env plays
// no part in these tests, same as tests/rankings-weights.test.mjs.
const NO_ENV_FILE = join(ROOT, 'tests', '.env.does-not-exist');

const GUILLOTINE_WEIGHTS = { weekly_floor: 0.6, starting_lineup: 0.4 };
const DYNASTY_WEIGHTS = { starting_lineup: 0.6, dynasty_value: 0.4 };

function testConfig(leagueFormat = null) {
  return {
    leagueFormat,
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {},
    },
    rankings: {
      weights: { dynasty: DYNASTY_WEIGHTS, redraft: DYNASTY_WEIGHTS, guillotine: GUILLOTINE_WEIGHTS },
      weekly: {},
    },
  };
}

function testLeague(formatType) {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: STARTING_SLOTS,
    benchSlots: 2,
    taxiSlots: 0,
    playoffTeams: 0,
    playoffWeekStart: null,
    format: {
      type: formatType,
      source: 'declared',
      declaredType: formatType,
      detectedType: 'redraft',
      scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: STARTING_SLOTS }),
    },
  };
}

/** Four teams, so there is still a field after two chops. */
const TEAMS = [
  { rosterId: 1, name: 'Alpha', manager: 'ann', seasonPointsFor: 250 },
  { rosterId: 2, name: 'Bravo', manager: 'ben', seasonPointsFor: 215 },
  { rosterId: 3, name: 'Charlie', manager: 'cal', seasonPointsFor: 195 },
  { rosterId: 4, name: 'Delta', manager: 'dee', seasonPointsFor: 90 },
].map((team) => ({
  ...team,
  ownerId: `owner-${team.rosterId}`,
  playerIds: ['p1', 'p2', 'p3'],
  starterIds: ['p1', 'p2', 'p3'],
  taxiIds: [],
  reserveIds: [],
  record: { wins: 1, losses: 1, ties: 0 },
  seasonPointsAgainst: 400,
  seasonPotentialPoints: team.seasonPointsFor + 10,
}));

/** Weeks 1 and 2 played. A survival ranking is written about week 2. */
const WEEKS = [
  {
    week: 1,
    played: true,
    scores: [
      { rosterId: 1, points: 120 },
      { rosterId: 2, points: 110 },
      { rosterId: 3, points: 100 },
      { rosterId: 4, points: 90 },
    ],
  },
  {
    week: 2,
    played: true,
    scores: [
      { rosterId: 1, points: 130 },
      { rosterId: 2, points: 105 },
      { rosterId: 3, points: 95 },
    ],
  },
];

/** Delta went in week 1, Charlie in week 2 — declared, so nothing is derived. */
const DECLARED = [
  { week: 1, team: 'Delta' },
  { week: 2, team: 'Charlie' },
];

function ledgerThrough(throughWeek) {
  return buildEliminationLedger({
    teams: TEAMS,
    startingSlots: STARTING_SLOTS,
    declared: DECLARED,
    weeks: WEEKS,
    throughWeek,
  });
}

function dangerThrough(throughWeek) {
  return buildDangerBoard({ teams: TEAMS, weeks: WEEKS, ledger: ledgerThrough(throughWeek) });
}

const PLAYERS = {
  p1: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  p2: { full_name: 'Rhys Back', position: 'RB', team: 'KC' },
  p3: { full_name: 'Wes Reed', position: 'WR', team: 'KC' },
};

const BYE_EXPOSURE = [
  {
    rosterId: 1,
    team: 'Alpha',
    weeks: [{ week: 3, startersOnBye: 0, playerIds: [] }],
  },
  {
    rosterId: 2,
    team: 'Bravo',
    weeks: [{ week: 3, startersOnBye: 2, playerIds: ['p2', 'p3'] }],
  },
];

const FUTURE_DRAFT_CAPITAL = [{ team: 'Alpha', baseline: 3, picksHeld: 5, acquired: [], tradedAway: [] }];

function rankingContext({
  week = 2,
  formatType = 'guillotine',
  task = 'survival-rankings',
  dangerBoard = dangerThrough(2),
  byeExposure = BYE_EXPOSURE,
  futureDraftCapital = FUTURE_DRAFT_CAPITAL,
} = {}) {
  return buildContext({
    task,
    config: testConfig(),
    league: testLeague(formatType),
    teams: TEAMS,
    players: PLAYERS,
    week,
    eliminationLedger: ledgerThrough(week),
    dangerBoard,
    byeExposure,
    futureDraftCapital,
  });
}

function unavailableFields(context) {
  return context.unavailable.map((entry) => entry.field);
}

/* ------------------------------------------------------- the task is registered */

test('survival-rankings is a registered task with a prompt file of its own', () => {
  assert.ok(TASKS.includes('survival-rankings'), 'survival-rankings is in TASKS');
  const text = readFileSync(join(ROOT, 'prompts', 'survival-rankings.md'), 'utf8');
  assert.ok(text.trim().length > 0, 'the prompt file is not empty');
});

test('survival-rankings is an edition that ranks, and an elimination-only one', () => {
  assert.ok(RANKING_TASKS.includes('survival-rankings'));
  assert.deepEqual(ELIMINATION_ONLY_TASKS, ['survival-preview', 'chop-recap', 'survival-rankings']);
});

test('buildPrompt embeds the survival-rankings prompt file and the context', () => {
  const prompt = buildPrompt({ task: 'survival-rankings', context: rankingContext() });
  assert.match(prompt, /SURVIVAL RANKINGS/i);
  assert.match(prompt, /# LEAGUE CONTEXT/);
  assert.match(prompt, /"task": "survival-rankings"/);
});

/**
 * The same rule tests/survival-preview.test.mjs applies: the ban on matchup
 * language already exists once, in describeMissingContext's `matchups` entry,
 * so the prompt file's job is to not reintroduce the concepts.
 */
test('the survival-rankings prompt never mentions a matchup, an opponent or a game', () => {
  const text = readFileSync(join(ROOT, 'prompts', 'survival-rankings.md'), 'utf8');
  for (const word of ['matchup', 'opponent', 'game']) {
    assert.doesNotMatch(
      text,
      new RegExp(`\\b${word}s?\\b`, 'i'),
      `prompts/survival-rankings.md must not use the word "${word}"`,
    );
  }
});

test('the survival-rankings prompt teaches floor over ceiling, the format\'s inversion', () => {
  const text = readFileSync(join(ROOT, 'prompts', 'survival-rankings.md'), 'utf8');
  assert.match(text, /\bfloor\b/i, 'the prompt talks about the floor');
  assert.match(text, /\bceiling\b/i, 'the prompt names the ceiling it is ranking against');
  assert.match(text, /survival/i);
});

test('the survival-rankings prompt never asks for draft capital or dynasty value', () => {
  const text = readFileSync(join(ROOT, 'prompts', 'survival-rankings.md'), 'utf8');
  assert.doesNotMatch(text, /draft capital/i);
  assert.doesNotMatch(text, /dynasty/i);
});

/* --------------------------------------------------------- the weight set ships */

test('the shipped config defines a guillotine weight set that weighs floor hardest', () => {
  const config = loadConfig({ envPath: NO_ENV_FILE });
  const weights = resolveRankingWeights(config.rankings, 'guillotine');

  const heaviest = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
  assert.equal(heaviest[0], 'weekly_floor', 'weekly floor is the heaviest factor');

  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `guillotine weights should sum to 1.0, got ${sum}`);
});

test('the guillotine weight set zeroes the two factors the format does not have', () => {
  const config = loadConfig({ envPath: NO_ENV_FILE });
  const weights = resolveRankingWeights(config.rankings, 'guillotine');
  assert.ok(!('dynasty_value' in weights), 'a chopped team has no long term');
  assert.ok(!('future_draft_capital' in weights), 'a chopped team never makes the pick');
  for (const key of ['bye_exposure', 'faab_remaining', 'depth', 'starting_lineup']) {
    assert.ok(key in weights, `guillotine weights should include ${key}`);
  }
});

test('a survival-rankings context carries the guillotine weight set, not the dynasty one', () => {
  const context = rankingContext();
  assert.deepEqual(context.editorial.rankingWeights, GUILLOTINE_WEIGHTS);
});

/* --------------------------------------------- only the field still alive is ranked */

test('a survival-rankings context ranks survivors only, with the chopped kept as history', () => {
  const context = rankingContext();
  assert.deepEqual(
    context.teams.map((entry) => entry.team),
    ['Alpha', 'Bravo'],
    'Charlie and Delta have been chopped and cannot hold a rank',
  );
  assert.deepEqual(context.eliminationHistory, [
    { team: 'Delta', week: 1 },
    { team: 'Charlie', week: 2 },
  ]);
  assert.equal(context.survivorCount, 2);
});

test('a ranked survivor carries no win-loss record and no opponent score', () => {
  for (const entry of rankingContext().teams) {
    assert.equal(entry.record, undefined, 'wins are won against somebody, and nobody plays here');
    assert.equal(entry.pointsAgainst, undefined, 'there is no opponent to have scored them');
    assert.ok(typeof entry.pointsFor === 'number', 'the team\'s own points are still a fact');
  }
});

test('an ordinary rankings context still carries record and pointsAgainst', () => {
  const context = rankingContext({ formatType: 'dynasty', task: 'rankings' });
  assert.equal(context.teams.length, TEAMS.length, 'nobody is eliminated in a dynasty league');
  for (const entry of context.teams) {
    assert.ok(entry.record, 'a dynasty team has a record');
    assert.ok(typeof entry.pointsAgainst === 'number');
  }
});

/* ------------------------------------------------- the facts the format turns on */

test('a survival-rankings context carries the chop line for the week it ranks, not the week before', () => {
  const context = rankingContext({ week: 2 });
  assert.equal(
    context.dangerBoard.lastCompletedWeek.week,
    2,
    'a ranking is written about the week that just settled, so that week sets the line',
  );
  assert.deepEqual(
    context.dangerBoard.floors.map((entry) => entry.team).sort(),
    ['Alpha', 'Bravo'],
    'floors cover the survivors only — a chopped team has the worst floor by definition',
  );
});

test('a survival-rankings context carries bye exposure and no matchup fields', () => {
  const context = rankingContext();
  assert.ok(context.byeExposure, 'bye exposure is a weighted factor in this format');
  assert.equal(context.upcomingMatchups, undefined);
  assert.equal(context.standings, undefined, 'the ranking is the order; teams already carries points');
});

test('a survival-rankings context refuses future draft capital and says why', () => {
  const context = rankingContext();
  assert.equal(context.futureDraftCapital, undefined);
  const entry = context.unavailable.find((item) => item.field === 'futureDraftCapital');
  assert.ok(entry, 'the absence is stated rather than left to be inferred');
  assert.match(entry.why, /chopped|eliminat/i);
  assert.match(entry.instruction, /do not/i);
});

test('a survival-rankings context states that matchups do not exist here', () => {
  const entry = rankingContext().unavailable.find((item) => item.field === 'matchups');
  assert.ok(entry);
  assert.match(entry.instruction, /never describe a game/i);
});

test('a survival-rankings edition with no completed week is told not to state a chop line', () => {
  const context = rankingContext({ week: 1, dangerBoard: null });
  assert.ok(unavailableFields(context).includes('chopLine'));
  const entry = context.unavailable.find((item) => item.field === 'chopLine');
  assert.match(
    entry.instruction,
    /thisWeek/,
    'a backward-looking edition still has real scores to write from',
  );
});

/* ----------------------------------------------- neither edition crosses formats */

test('the CLI refuses an ordinary rankings edition in a guillotine league', () => {
  assert.throws(
    () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), 'rankings'),
    (error) => {
      assert.match(error.message, /guillotine league/i);
      assert.match(error.message, /`survival-rankings`/, 'names the replacement command');
      assert.doesNotMatch(error.message, /not shipped/i, 'the replacement exists');
      return true;
    },
  );
});

test('the CLI refuses a survival ranking in a league where nobody is eliminated', () => {
  for (const format of ['dynasty', 'redraft', null]) {
    assert.throws(
      () => refuseSurvivalEditionWithoutEliminations(testConfig(format), 'survival-rankings'),
      (error) => {
        assert.match(error.message, /nobody is eliminated/i);
        assert.match(error.message, /`rankings`/, 'names the edition to run instead');
        return true;
      },
      `expected a refusal for a ${format ?? 'undeclared'} league`,
    );
  }
});

test('the CLI allows a survival ranking in a declared guillotine league', () => {
  assert.doesNotThrow(() =>
    refuseSurvivalEditionWithoutEliminations(testConfig('guillotine'), 'survival-rankings'),
  );
  assert.doesNotThrow(() =>
    refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), 'survival-rankings'),
  );
});

/**
 * Adding weights.guillotine removed the error that used to stop every ranking
 * edition in this format — resolveRankingWeights refused because no set
 * existed. The preseason and postseason editions still have no guillotine
 * version, so they must now be refused on their own terms rather than falling
 * through and being ranked on a floor nobody has yet.
 */
test('the CLI refuses the ranking editions a guillotine league has no version of', () => {
  for (const task of ['preseason-rankings', 'postseason']) {
    assert.throws(
      () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), task),
      (error) => {
        assert.match(error.message, /guillotine/i);
        assert.match(error.message, /`survival-rankings`/, 'points at the ranking that does exist');
        return true;
      },
      `expected a refusal for ${task}`,
    );
  }
});

test('the ordinary rankings editions are untouched in every other format', () => {
  for (const format of ['dynasty', 'redraft', null]) {
    for (const task of ['rankings', 'preseason-rankings', 'postseason']) {
      assert.doesNotThrow(() => refuseOrdinaryEditionInGuillotineLeague(testConfig(format), task));
    }
  }
});

test('buildPrompt refuses an ordinary ranking built from a guillotine context', () => {
  for (const task of ['rankings', 'preseason-rankings', 'postseason']) {
    const context = rankingContext({ task });
    assert.throws(
      () => buildPrompt({ task, context }),
      /guillotine league/i,
      `expected buildPrompt to refuse ${task}`,
    );
  }
});

test('buildPrompt refuses a survival ranking built from a head-to-head context', () => {
  for (const formatType of ['dynasty', 'redraft']) {
    const context = rankingContext({ formatType, dangerBoard: null, byeExposure: null });
    assert.throws(
      () => buildPrompt({ task: 'survival-rankings', context }),
      /nobody is eliminated/i,
      `expected a refusal for a ${formatType} league`,
    );
  }
});

/* ------------------------------------------------------------- recording the order */

test('a survival ranking is filed as a ranking, so next week can print movement', () => {
  const saved = [];
  const store = {
    loadPreviousRankings: () => null,
    saveRankings(season, label, payload) {
      saved.push({ season, label, payload });
      return `data/rankings/${season}/${label}.json`;
    },
  };

  const recorded = recordBlock({
    store,
    league: { season: '2026' },
    week: 2,
    task: 'survival-rankings',
    block: [
      { rank: 1, team: 'Alpha' },
      { rank: 2, team: 'Bravo' },
    ],
    previousRankings: null,
    say: () => {},
  });

  assert.equal(recorded, true);
  assert.equal(saved[0].label, 'week-2', 'filed under the same label an ordinary ranking uses');
  assert.equal(saved[0].payload.week, 2);
  assert.deepEqual(
    saved[0].payload.rankings.map((entry) => entry.team),
    ['Alpha', 'Bravo'],
  );
});

/* ------------------------------------------------------------------ rank emoji */

/**
 * A guillotine league normally starts with 18 teams, one per NFL regular
 * season week. The shipped table used to stop at 12, and rankEmoji repeats the
 * last entry past the end — so ranks 13 to 18 all printed the same emoji, and
 * the bottom of the table stopped meaning anything.
 */
test('the shipped rank emoji table covers an 18-team guillotine league outright', () => {
  const config = loadConfig({ envPath: NO_ENV_FILE });
  const table = config.editorial.ranking_emoji;

  for (let rank = 1; rank <= 18; rank++) {
    assert.ok(
      table[rank] ?? table[String(rank)],
      `rank ${rank} needs an emoji of its own, not a repeat of the last one`,
    );
  }
});

test('the first twelve ranks still print exactly what they always did', () => {
  const config = loadConfig({ envPath: NO_ENV_FILE });
  const withEmoji = { ...config, editorial: { ...config.editorial, output: { ...config.editorial.output, include_emoji: true } } };
  const twelve = Array.from({ length: 12 }, (_, index) => rankEmoji(withEmoji, index + 1));
  assert.deepEqual(twelve, ['🥇', '🥈', '🥉', '🔥', '😤', '👀', '🤨', '🎲', '🫠', '💩', '💩', '💩']);
});
