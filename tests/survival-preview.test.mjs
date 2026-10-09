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
  ELIMINATION_ONLY_TASKS,
  buildContext,
  buildPrompt,
} from '../src/promptContext.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { buildDangerBoard } from '../src/analysis/danger.mjs';
import { gradePredictions } from '../src/store.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { ROOT } from '../src/config.mjs';

/**
 * The survival preview: the forward-looking edition a guillotine league gets
 * instead of the matchup preview it cannot have.
 *
 * Three things are being pinned down here, matching the task's acceptance:
 *
 * - the edition exists as a registered task with a prompt file of its own;
 * - nothing matchup-shaped can reach it, in either direction — a guillotine
 *   league cannot build a `preview`, and a league that plays matchups cannot
 *   build a `survival-preview`;
 * - the called shot it makes (who gets chopped) survives a round trip through
 *   the store and comes back out gradeable.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

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
  record: { wins: 0, losses: 0, ties: 0 },
  seasonPointsAgainst: 0,
  seasonPotentialPoints: team.seasonPointsFor,
}));

/**
 * Weeks 1 and 2 played, week 3 (the week a preview is about) not yet.
 * An eliminated roster carries no score in the weeks after it went, the same
 * way the ledger stops crediting one.
 */
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
  { week: 3, played: false, scores: [] },
];

/** Delta went in week 1, Charlie in week 2 — declared, so nothing is derived. */
const DECLARED = [
  { week: 1, team: 'Delta' },
  { week: 2, team: 'Charlie' },
];

function ledgerThrough(throughWeek, weeks = WEEKS) {
  return buildEliminationLedger({
    teams: TEAMS,
    startingSlots: STARTING_SLOTS,
    declared: DECLARED,
    weeks,
    throughWeek,
  });
}

function dangerThrough(throughWeek, weeks = WEEKS) {
  return buildDangerBoard({ teams: TEAMS, weeks, ledger: ledgerThrough(throughWeek, weeks) });
}

/** Hand-built, because this is a test of the view rather than of the analysis. */
const BYE_EXPOSURE = [
  {
    rosterId: 1,
    team: 'Alpha',
    weeks: [
      { week: 3, startersOnBye: 0, playerIds: [] },
      { week: 4, startersOnBye: 1, playerIds: ['p1'] },
    ],
  },
  {
    rosterId: 2,
    team: 'Bravo',
    weeks: [
      { week: 3, startersOnBye: 2, playerIds: ['p2', 'p3'] },
      { week: 4, startersOnBye: 0, playerIds: [] },
    ],
  },
];

const PLAYERS = {
  p1: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  p2: { full_name: 'Rhys Back', position: 'RB', team: 'KC' },
  p3: { full_name: 'Wes Reed', position: 'WR', team: 'KC' },
};

function survivalContext({
  week = 3,
  formatType = 'guillotine',
  dangerBoard = dangerThrough(3),
  byeExposure = BYE_EXPOSURE,
  faabMarket = null,
  task = 'survival-preview',
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
    faabMarket,
  });
}

function unavailableFields(context) {
  return context.unavailable.map((entry) => entry.field);
}

/* ------------------------------------------------------- the task is registered */

test('survival-preview is a registered task with a prompt file of its own', () => {
  assert.ok(TASKS.includes('survival-preview'), 'survival-preview is in TASKS');
  const text = readFileSync(join(ROOT, 'prompts', 'survival-preview.md'), 'utf8');
  assert.ok(text.trim().length > 0, 'the prompt file is not empty');
});

test('buildPrompt embeds the survival-preview prompt file and the context', () => {
  const prompt = buildPrompt({ task: 'survival-preview', context: survivalContext() });
  assert.match(prompt, /SURVIVAL PREVIEW/i);
  assert.match(prompt, /# LEAGUE CONTEXT/);
  assert.match(prompt, /"task": "survival-preview"/);
});

/**
 * The acceptance criterion is that the edition never refers to a matchup, an
 * opponent or a game. The prohibition itself already exists once, in
 * describeMissingContext's `matchups` entry, and buildPrompt tells the model to
 * read `unavailable` first — so the prompt file's job is to not reintroduce the
 * concepts, not to restate the ban. Keeping the words out of it entirely is
 * what makes that checkable.
 */
test('the survival-preview prompt never mentions a matchup, an opponent or a game', () => {
  const text = readFileSync(join(ROOT, 'prompts', 'survival-preview.md'), 'utf8');
  for (const word of ['matchup', 'opponent', 'game']) {
    assert.doesNotMatch(
      text,
      new RegExp(`\\b${word}s?\\b`, 'i'),
      `prompts/survival-preview.md must not use the word "${word}"`,
    );
  }
});

/* ----------------------------------------------- neither edition crosses formats */

test('the CLI refuses a survival preview in a league where nobody is eliminated', () => {
  for (const format of ['dynasty', 'redraft', null]) {
    assert.throws(
      () => refuseSurvivalEditionWithoutEliminations(testConfig(format), 'survival-preview'),
      (error) => {
        assert.match(error.message, /nobody is eliminated/i);
        assert.match(error.message, /`preview`/, 'names the edition to run instead');
        return true;
      },
      `expected a refusal for a ${format ?? 'undeclared'} league`,
    );
  }
});

test('the CLI allows a survival preview in a declared guillotine league', () => {
  assert.doesNotThrow(() =>
    refuseSurvivalEditionWithoutEliminations(testConfig('guillotine'), 'survival-preview'),
  );
});

test('the CLI leaves every other task alone', () => {
  for (const task of ['preview', 'recap', 'rankings', 'preseason-rankings']) {
    assert.doesNotThrow(() => refuseSurvivalEditionWithoutEliminations(testConfig(null), task));
  }
});

test('buildPrompt refuses a survival preview built from a head-to-head context', () => {
  for (const formatType of ['dynasty', 'redraft']) {
    const context = survivalContext({ formatType, dangerBoard: null, byeExposure: null });
    assert.throws(
      () => buildPrompt({ task: 'survival-preview', context }),
      /nobody is eliminated/i,
      `expected a refusal for a ${formatType} league`,
    );
  }
});

test('survival-preview is an elimination-only task, and preview/recap are still refused for guillotine', () => {
  assert.ok(ELIMINATION_ONLY_TASKS.includes('survival-preview'));
  assert.ok(ELIMINATION_ONLY_TASKS.includes('chop-recap'));
  assert.throws(
    () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), 'preview'),
    /`survival-preview`/,
  );
  assert.throws(
    () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), 'recap'),
    /`chop-recap`/,
  );
});

/**
 * Both replacement editions have shipped, so neither refusal should still be
 * calling one of them unbuilt — that wording is only correct while a
 * replacement is genuinely missing (see tests/chop-recap.test.mjs for the
 * chop-recap side of this pairing, and docs/architecture.md for why the
 * message asks TASKS instead of carrying its own claim).
 */
test('both the preview and recap refusals point at commands that now exist', () => {
  for (const [task, replacement] of [['preview', 'survival-preview'], ['recap', 'chop-recap']]) {
    assert.throws(
      () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), task),
      (error) => {
        assert.doesNotMatch(error.message, /not shipped|has not shipped yet/i);
        assert.match(error.message, new RegExp(`\`${replacement}\``));
        return true;
      },
    );
  }
});

/* ----------------------------------------------------------- nothing matchup-shaped */

test('a survival-preview context carries no matchup, opponent or record field', () => {
  const context = survivalContext();
  assert.equal(context.upcomingMatchups, undefined);
  assert.equal(context.thisWeek, undefined);
  assert.equal(context.previousWeek, undefined);
  for (const entry of context.standings) {
    assert.equal(entry.record, undefined, 'a survivor standing carries no win-loss record');
    assert.equal(entry.pointsAgainst, undefined, 'a survivor standing carries no opponent score');
  }
});

test('a survival-preview context states that matchups do not exist here', () => {
  const context = survivalContext();
  const entry = context.unavailable.find((item) => item.field === 'matchups');
  assert.ok(entry, 'the matchups entry is present');
  assert.match(entry.instruction, /never describe a game/i);
});

test('a survival-preview context ranks the field still alive and keeps the chopped apart', () => {
  const context = survivalContext();
  assert.deepEqual(
    context.standings.map((entry) => entry.team),
    ['Alpha', 'Bravo'],
    'only survivors, ranked on points',
  );
  assert.deepEqual(context.eliminationHistory, [
    { team: 'Delta', week: 1 },
    { team: 'Charlie', week: 2 },
  ]);
});

/* ------------------------------------------------------------------ the chop line */

test('the danger board reports the last completed week and every rolling floor', () => {
  const { dangerBoard } = survivalContext();
  assert.equal(dangerBoard.lastCompletedWeek.week, 2);
  assert.equal(dangerBoard.lastCompletedWeek.chopLine, 95);
  assert.equal(dangerBoard.lastCompletedWeek.survivalMargin, 10);
  assert.deepEqual(
    dangerBoard.lastCompletedWeek.scoringOrder.map((entry) => [entry.team, entry.marginAboveChopLine]),
    [
      ['Alpha', 35],
      ['Bravo', 10],
      ['Charlie', 0],
    ],
  );
  const floors = Object.fromEntries(dangerBoard.floors.map((entry) => [entry.team, entry.lowest]));
  assert.equal(floors.Alpha, 120);
  assert.equal(floors.Bravo, 105);
});

/**
 * The danger list a survival preview writes is the floors list, worst first.
 * A chopped team's floor is the worst in the league almost by definition — it
 * is why they went — so leaving one in puts an eliminated team at the top of
 * the list of teams to watch this week. Same reasoning as survivalStandingsView:
 * a team no longer in the league must never appear among those still competing.
 */
test('the rolling floors cover only the teams still alive', () => {
  const { dangerBoard } = survivalContext();
  assert.deepEqual(
    dangerBoard.floors.map((entry) => entry.team),
    ['Bravo', 'Alpha'],
    'Delta and Charlie were chopped and have no floor left to worry about',
  );
});

/**
 * A week in progress has partial scores, and a chop line drawn under partial
 * scores is a wrong fact with the tool's authority behind it. The preview's
 * own week is never allowed to set one, however much of it Sleeper has scored.
 */
test('the week being previewed never sets the chop line, even once it has partial scores', () => {
  const inProgress = [
    WEEKS[0],
    WEEKS[1],
    { week: 3, played: true, scores: [{ rosterId: 1, points: 12 }, { rosterId: 2, points: 3 }] },
  ];
  const { dangerBoard } = survivalContext({ dangerBoard: dangerThrough(3, inProgress) });
  assert.equal(dangerBoard.lastCompletedWeek.week, 2);
  assert.equal(dangerBoard.lastCompletedWeek.chopLine, 95);
});

test('a first-week survival preview reports no chop line rather than inventing one', () => {
  const context = survivalContext({
    week: 1,
    dangerBoard: buildDangerBoard({ teams: TEAMS, weeks: [], ledger: null }),
  });
  assert.equal(context.dangerBoard.lastCompletedWeek, undefined);
  assert.ok(unavailableFields(context).includes('chopLine'));
  const entry = context.unavailable.find((item) => item.field === 'chopLine');
  assert.match(entry.instruction, /do not state a chop line/i);
});

/* ---------------------------------------------------------------- bye exposure */

test('bye exposure names the players each survivor loses, week by week', () => {
  const { byeExposure } = survivalContext();
  assert.deepEqual(
    byeExposure.map((entry) => entry.team),
    ['Alpha', 'Bravo'],
  );
  const bravo = byeExposure.find((entry) => entry.team === 'Bravo');
  assert.equal(bravo.weeks[0].week, 3);
  assert.equal(bravo.weeks[0].startersOnBye, 2);
  assert.deepEqual(bravo.weeks[0].players, ['Rhys Back (RB, KC)', 'Wes Reed (WR, KC)']);
  assert.equal(bravo.weeks[0].rosterId, undefined, 'roster ids are not model-facing');
});

/* ------------------------------------------------------------------------ FAAB */

test('an absent FAAB market is stated rather than left to be guessed at', () => {
  const context = survivalContext({ faabMarket: null });
  const entry = context.unavailable.find((item) => item.field === 'faabMarket');
  assert.ok(entry, 'the faabMarket entry is present');
  assert.match(entry.instruction, /do not (discuss|mention)/i);
});

test('a FAAB market that exists is reported and not listed as unavailable', () => {
  const context = survivalContext({
    faabMarket: {
      budget: 100,
      balances: [{ rosterId: 1, team: 'Alpha', spent: 30, remaining: 70 }],
      releasedPools: [],
    },
  });
  assert.equal(context.faabMarket.leagueBudget, 100);
  assert.ok(!unavailableFields(context).includes('faabMarket'));
});

/* ------------------------------------------------------------- ranking weights */

/**
 * A guillotine league has no ranking weight set yet — that is specified with
 * the guillotine rankings edition, and src/config.mjs refuses rather than
 * borrowing the dynasty set. A survival preview does not rank anybody, so it
 * must not be held up waiting for a set it never reads: only the editions that
 * actually weigh the factors ask for them.
 */
function configWithoutGuillotineWeights() {
  const config = testConfig();
  config.rankings = { weights: { dynasty: DYNASTY_WEIGHTS, redraft: DYNASTY_WEIGHTS }, weekly: {} };
  return config;
}

test('a survival preview builds in a league that has no ranking weight set', () => {
  const context = buildContext({
    task: 'survival-preview',
    config: configWithoutGuillotineWeights(),
    league: testLeague('guillotine'),
    teams: TEAMS,
    players: PLAYERS,
    week: 3,
    eliminationLedger: ledgerThrough(3),
    dangerBoard: dangerThrough(3),
    byeExposure: BYE_EXPOSURE,
  });
  assert.equal(context.editorial.rankingWeights, undefined, 'an edition that ranks nobody gets no weights');
  assert.doesNotThrow(() => buildPrompt({ task: 'survival-preview', context }));
});

test('a ranking edition still refuses a format with no weight set of its own', () => {
  assert.throws(
    () =>
      buildContext({
        task: 'rankings',
        config: configWithoutGuillotineWeights(),
        league: testLeague('guillotine'),
        teams: TEAMS,
        players: PLAYERS,
        week: 3,
        eliminationLedger: ledgerThrough(3),
      }),
    /guillotine/i,
  );
});

test('a ranking edition in a format that has a set still receives it', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('guillotine'),
    teams: TEAMS,
    players: PLAYERS,
    week: 3,
    eliminationLedger: ledgerThrough(3),
  });
  assert.deepEqual(context.editorial.rankingWeights, GUILLOTINE_WEIGHTS);
});

/* --------------------------------------------------- the called shot, round trip */

/** Just enough store to watch what recordBlock writes. */
function fakeStore() {
  const saved = [];
  return {
    saved,
    savePredictions(season, week, predictions) {
      saved.push({ season, week, predictions });
      return `data/predictions/${season}/week-${week}.json`;
    },
    loadPredictions(season, week) {
      const hit = saved.find((entry) => String(entry.season) === String(season) && entry.week === week);
      return hit ? { season: String(season), week, predictions: hit.predictions } : null;
    },
    loadPreviousRankings: () => null,
    saveRankings: () => '',
  };
}

test('a survival preview records its chop prediction, and grading scores it next week', () => {
  const store = fakeStore();
  const league = { season: '2026' };
  const block = [{ week: 3, predicted_chop: 'Bravo', reasoning: 'thinnest floor, two starters out' }];

  const recorded = recordBlock({
    store,
    league,
    week: 3,
    task: 'survival-preview',
    block,
    previousRankings: null,
    say: () => {},
  });
  assert.equal(recorded, true);
  assert.deepEqual(store.saved[0], { season: '2026', week: 3, predictions: block });

  // Week 3 is now played, and Bravo was the one that went.
  const playedWeeks = [
    WEEKS[0],
    WEEKS[1],
    { week: 3, played: true, scores: [{ rosterId: 1, points: 140 }, { rosterId: 2, points: 88 }] },
  ];
  const ledger = buildEliminationLedger({
    teams: TEAMS,
    startingSlots: STARTING_SLOTS,
    declared: [...DECLARED, { week: 3, team: 'Bravo' }],
    weeks: playedWeeks,
    throughWeek: 3,
  });

  const graded = gradePredictions(
    store.loadPredictions('2026', 3).predictions,
    { week: 3, teamWeeks: [{ team: 'Alpha', points: 140 }, { team: 'Bravo', points: 88 }] },
    { eliminationLedger: ledger },
  );

  assert.equal(graded.total, 1);
  assert.equal(graded.correct, 1);
  assert.equal(graded.accuracy, 100);
  assert.equal(graded.results[0].actual_chop, 'Bravo');
  assert.equal(graded.results[0].chop_source, 'declared');
  assert.equal(graded.results[0].correct, true);
});

test('a chop prediction that named the wrong team is graded wrong, not skipped', () => {
  const ledger = ledgerThrough(2);
  const graded = gradePredictions(
    [{ week: 2, predicted_chop: 'Bravo' }],
    { week: 2, teamWeeks: [{ team: 'Alpha', points: 130 }, { team: 'Bravo', points: 105 }, { team: 'Charlie', points: 95 }] },
    { eliminationLedger: ledger },
  );
  assert.equal(graded.total, 1);
  assert.equal(graded.correct, 0);
  assert.equal(graded.results[0].actual_chop, 'Charlie');
  assert.equal(graded.results[0].correct, false);
});

/**
 * An unresolved week is the state of every guillotine league every Monday. It
 * is not a wrong prediction and must never be scored as one.
 */
test('a chop prediction for a week nothing has settled is left ungraded, with the reason', () => {
  const unsettled = [
    WEEKS[0],
    WEEKS[1],
    { week: 3, played: true, scores: [{ rosterId: 1, points: 140 }, { rosterId: 2, points: 88 }] },
  ];
  const ledger = buildEliminationLedger({
    teams: TEAMS,
    startingSlots: STARTING_SLOTS,
    declared: DECLARED,
    weeks: unsettled,
    throughWeek: 3,
  });

  const graded = gradePredictions(
    [{ week: 3, predicted_chop: 'Bravo' }],
    { week: 3, teamWeeks: [{ team: 'Alpha', points: 140 }, { team: 'Bravo', points: 88 }] },
    { eliminationLedger: ledger },
  );

  assert.equal(graded.total, 0, 'nothing was scored');
  assert.equal(graded.accuracy, null);
  assert.equal(graded.results[0].graded, false);
  assert.equal(graded.results[0].correct, undefined, 'an unresolved week is not a wrong call');
  assert.match(graded.results[0].reason, /week 3/);
});

test('a chop prediction with no ledger to check is left ungraded rather than guessed at', () => {
  const graded = gradePredictions(
    [{ week: 2, predicted_chop: 'Charlie' }],
    { week: 2, teamWeeks: [{ team: 'Charlie', points: 95 }] },
  );
  assert.equal(graded.total, 0);
  assert.equal(graded.results[0].graded, false);
  assert.match(graded.results[0].reason, /ledger/i);
});

test('matchup predictions still grade exactly as they did', () => {
  const graded = gradePredictions(
    [
      {
        week: 2,
        team_a: 'Alpha',
        team_b: 'Bravo',
        predicted_winner: 'Alpha',
        predicted_score_a: 125,
        predicted_score_b: 110,
      },
    ],
    { week: 2, teamWeeks: [{ team: 'Alpha', points: 130 }, { team: 'Bravo', points: 105 }] },
  );
  assert.equal(graded.correct, 1);
  assert.equal(graded.total, 1);
  assert.equal(graded.results[0].actual_winner, 'Alpha');
  assert.equal(graded.results[0].total_score_error, 10);
});
