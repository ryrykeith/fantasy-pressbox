import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  refuseOrdinaryEditionInGuillotineLeague,
  refuseSurvivalEditionWithoutEliminations,
} from '../src/cli.mjs';
import { TASKS, ELIMINATION_ONLY_TASKS, buildContext, buildPrompt } from '../src/promptContext.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { buildDangerBoard } from '../src/analysis/danger.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { ROOT } from '../src/config.mjs';

/**
 * The chop recap: the backward-looking edition a guillotine league gets
 * instead of the matchup recap it cannot have. Mirrors
 * tests/survival-preview.test.mjs, which pins down the same contract for the
 * forward-looking sibling this task replaces `recap` alongside.
 *
 * Three things matter here, matching the task's acceptance:
 *
 * - the edition exists as a registered task with a prompt file of its own,
 *   and is guarded in both directions the same way survival-preview is;
 * - the danger board it reads describes the week that just happened, not the
 *   week before it — the opposite end of the same `dangerBoardView` a
 *   survival preview reads, which is the one behavioural fork this task
 *   introduces into shared code;
 * - the survivor count it states is an exact fact, not something a model has
 *   to count off a list.
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
      awards: { lowest_score: true, lineup_malpractice: true },
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

/** Five teams, so the field the recap describes still has two left after three chops. */
const TEAMS = [
  { rosterId: 1, name: 'Alpha', manager: 'ann', seasonPointsFor: 250 },
  { rosterId: 2, name: 'Bravo', manager: 'ben', seasonPointsFor: 215 },
  { rosterId: 3, name: 'Charlie', manager: 'cal', seasonPointsFor: 195 },
  { rosterId: 4, name: 'Delta', manager: 'dee', seasonPointsFor: 90 },
  { rosterId: 5, name: 'Echo', manager: 'eli', seasonPointsFor: 60 },
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

/** Echo goes in week 1, Delta in week 2, Charlie in week 3 — the week this recap is about. */
const WEEKS = [
  {
    week: 1,
    played: true,
    scores: [
      { rosterId: 1, points: 120 },
      { rosterId: 2, points: 110 },
      { rosterId: 3, points: 105 },
      { rosterId: 4, points: 100 },
      { rosterId: 5, points: 90 },
    ],
  },
  {
    week: 2,
    played: true,
    scores: [
      { rosterId: 1, points: 130 },
      { rosterId: 2, points: 108 },
      { rosterId: 3, points: 102 },
      { rosterId: 4, points: 95 },
    ],
  },
  {
    week: 3,
    played: true,
    scores: [
      { rosterId: 1, points: 125 },
      { rosterId: 2, points: 99 },
      { rosterId: 3, points: 92 },
    ],
  },
];

const DECLARED = [
  { week: 1, team: 'Echo' },
  { week: 2, team: 'Delta' },
  { week: 3, team: 'Charlie' },
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

/** One team's week, just detailed enough for teamWeekView to read. */
function teamWeek(team, points, potentialPoints, lineupEfficiency) {
  return {
    team,
    manager: `manager-${team}`,
    points,
    potentialPoints,
    lineupEfficiency,
    starters: [{ slot: 'QB', name: 'Some Guy', position: 'QB', nflTeam: 'BUF', injuryStatus: null, points }],
    benchHighlights: [],
    optimalLineup: [{ slot: 'QB', name: 'Some Guy', points }],
  };
}

/**
 * Week 3's own analysis. Charlie (92, the chop) left the most on the bench of
 * anyone — the lineup-malpractice fact the task explicitly asks to keep.
 */
function weekAnalysisFixture() {
  return {
    week: 3,
    teamWeeks: [
      teamWeek('Alpha', 125, 130, 96.2),
      teamWeek('Bravo', 99, 105, 94.3),
      teamWeek('Charlie', 92, 140, 65.7),
    ],
    awards: {
      lowestScore: { team: 'Charlie', points: 92 },
      lineupMalpractice: { team: 'Charlie', lineupEfficiency: 65.7, pointsLeftOnBench: 48 },
    },
    scoringOrder: [
      { rank: 1, team: 'Alpha', points: 125 },
      { rank: 2, team: 'Bravo', points: 99 },
      { rank: 3, team: 'Charlie', points: 92 },
    ],
  };
}

const PLAYERS = { p1: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' } };

function chopRecapContext({
  week = 3,
  formatType = 'guillotine',
  weekAnalysis = weekAnalysisFixture(),
  dangerBoard = dangerThrough(3),
  faabMarket = null,
  gradedPredictions = null,
  task = 'chop-recap',
} = {}) {
  return buildContext({
    task,
    config: testConfig(),
    league: testLeague(formatType),
    teams: TEAMS,
    players: PLAYERS,
    week,
    weekAnalysis,
    eliminationLedger: ledgerThrough(week),
    dangerBoard,
    faabMarket,
    gradedPredictions,
  });
}

function unavailableFields(context) {
  return context.unavailable.map((entry) => entry.field);
}

/* ------------------------------------------------------- the task is registered */

test('chop-recap is a registered task with a prompt file of its own', () => {
  assert.ok(TASKS.includes('chop-recap'), 'chop-recap is in TASKS');
  const text = readFileSync(join(ROOT, 'prompts', 'chop-recap.md'), 'utf8');
  assert.ok(text.trim().length > 0, 'the prompt file is not empty');
});

test('buildPrompt embeds the chop-recap prompt file and the context', () => {
  const prompt = buildPrompt({ task: 'chop-recap', context: chopRecapContext() });
  assert.match(prompt, /CHOP RECAP/i);
  assert.match(prompt, /# LEAGUE CONTEXT/);
  assert.match(prompt, /"task": "chop-recap"/);
});

/**
 * The acceptance criterion is that the edition cites no winner or loser of
 * any matchup. There are no games in this format for it to win or lose, so
 * the prompt file's job is to never introduce the concepts, the same
 * convention tests/survival-preview.test.mjs already enforces for its sibling.
 */
test('the chop-recap prompt never mentions a matchup, an opponent, a game, a winner or a loser', () => {
  const text = readFileSync(join(ROOT, 'prompts', 'chop-recap.md'), 'utf8');
  for (const word of ['matchup', 'opponent', 'game', 'winner', 'loser']) {
    assert.doesNotMatch(
      text,
      new RegExp(`\\b${word}s?\\b`, 'i'),
      `prompts/chop-recap.md must not use the word "${word}"`,
    );
  }
});

/* ----------------------------------------------- neither edition crosses formats */

test('the CLI refuses a chop recap in a league where nobody is eliminated', () => {
  for (const format of ['dynasty', 'redraft', null]) {
    assert.throws(
      () => refuseSurvivalEditionWithoutEliminations(testConfig(format), 'chop-recap'),
      (error) => {
        assert.match(error.message, /nobody is eliminated/i);
        assert.match(error.message, /`recap`/, 'names the edition to run instead');
        assert.doesNotMatch(error.message, /`preview`/, 'must not send a recap-shaped task to preview');
        return true;
      },
      `expected a refusal for a ${format ?? 'undeclared'} league`,
    );
  }
});

test('the CLI allows a chop recap in a declared guillotine league', () => {
  assert.doesNotThrow(() => refuseSurvivalEditionWithoutEliminations(testConfig('guillotine'), 'chop-recap'));
});

test('the CLI refuses recap on a declared guillotine league, and names chop-recap as the replacement', () => {
  assert.throws(
    () => refuseOrdinaryEditionInGuillotineLeague(testConfig('guillotine'), 'recap'),
    (error) => {
      assert.match(error.message, /`chop-recap`/);
      assert.doesNotMatch(error.message, /not shipped/i, 'chop-recap has shipped');
      return true;
    },
  );
});

test('buildPrompt refuses a chop recap built from a head-to-head context', () => {
  for (const formatType of ['dynasty', 'redraft']) {
    const context = chopRecapContext({ formatType, dangerBoard: null, weekAnalysis: null });
    assert.throws(
      () => buildPrompt({ task: 'chop-recap', context }),
      /nobody is eliminated/i,
      `expected a refusal for a ${formatType} league`,
    );
  }
});

test('chop-recap is one of the elimination-only tasks', () => {
  assert.ok(ELIMINATION_ONLY_TASKS.includes('chop-recap'));
  assert.ok(ELIMINATION_ONLY_TASKS.includes('survival-preview'));
  // The full list is pinned in tests/guillotine-rankings.test.mjs, which is
  // where the third member was added.
});

/* ------------------------------------------------------------------ the chop line */

/**
 * This is the one behavioural fork the task introduces into shared code:
 * dangerBoardView's `beforeWeek` must land on the week this recap is *about*,
 * not the week before it — the opposite of what a forward-looking survival
 * preview needs from the identical danger board.
 */
test('the danger board for a chop recap describes the week the recap is about, not the week before it', () => {
  const { dangerBoard } = chopRecapContext({ week: 3 });

  assert.equal(dangerBoard.lastCompletedWeek.week, 3, 'week 3 is the week this recap is about');
  assert.equal(dangerBoard.lastCompletedWeek.chopLine, 92);
  assert.equal(dangerBoard.lastCompletedWeek.survivalMargin, 7);
});

test('the chopped team sits on the chop line in the scoring order, at a margin of exactly zero', () => {
  const { dangerBoard } = chopRecapContext({ week: 3 });
  const bottom = dangerBoard.lastCompletedWeek.scoringOrder.at(-1);

  assert.equal(bottom.team, 'Charlie');
  assert.equal(bottom.points, 92);
  assert.equal(bottom.marginAboveChopLine, 0);
});

test('the team that nearly went is identifiable as the smallest nonzero margin above the chop line', () => {
  const { dangerBoard } = chopRecapContext({ week: 3 });
  const nonzero = dangerBoard.lastCompletedWeek.scoringOrder.filter((entry) => entry.marginAboveChopLine > 0);
  const nearlyWent = nonzero.reduce((min, entry) =>
    entry.marginAboveChopLine < min.marginAboveChopLine ? entry : min,
  );

  assert.equal(nearlyWent.team, 'Bravo');
  assert.equal(nearlyWent.marginAboveChopLine, 7);
});

test('a survival preview built from the same danger board still excludes the week it is about', () => {
  const context = buildContext({
    task: 'survival-preview',
    config: testConfig(),
    league: testLeague('guillotine'),
    teams: TEAMS,
    players: PLAYERS,
    week: 3,
    eliminationLedger: ledgerThrough(2, WEEKS.slice(0, 2)),
    dangerBoard: buildDangerBoard({ teams: TEAMS, weeks: WEEKS.slice(0, 2), ledger: ledgerThrough(2, WEEKS.slice(0, 2)) }),
  });

  assert.equal(context.dangerBoard.lastCompletedWeek.week, 2, 'week 3 must never set its own chop line here');
});

/* ---------------------------------------------------------------- survivor count */

test('survivorCount is an exact fact, matching the ledger after this week\'s chop', () => {
  const context = chopRecapContext({ week: 3 });
  assert.equal(context.survivorCount, 2, 'Alpha and Bravo are the only two left after week 3');
  assert.equal(context.standings.length, 2);
});

test('survivorCount falls back to the full roster when no ledger is supplied', () => {
  const context = buildContext({
    task: 'chop-recap',
    config: testConfig(),
    league: testLeague('guillotine'),
    teams: TEAMS,
    players: PLAYERS,
    week: 3,
    weekAnalysis: weekAnalysisFixture(),
  });
  assert.equal(context.survivorCount, TEAMS.length);
});

/* ---------------------------------------------------------------- the eliminated team's own week */

test('the eliminated team still carries its own week in thisWeek.teams, for the autopsy', () => {
  const context = chopRecapContext();
  const charlie = context.thisWeek.teams.find((entry) => entry.team === 'Charlie');

  assert.ok(charlie, 'the chopped team is not dropped from thisWeek');
  assert.equal(charlie.points, 92);
  assert.equal(charlie.potentialPoints, 140);
  assert.equal(charlie.lineupEfficiency, 65.7);
});

test('lineup malpractice still fires for the week, and can name the chopped team', () => {
  const context = chopRecapContext();
  assert.equal(context.thisWeek.awardFacts.lineupMalpractice.team, 'Charlie');
});

/* --------------------------------------------------------------------- the wire */

test('the FAAB market carries this week\'s released pool alongside the balances', () => {
  const faabMarket = {
    budget: 100,
    balances: [{ rosterId: 1, team: 'Alpha', spent: 20, remaining: 80 }],
    releasedPools: [
      { week: 3, team: 'Charlie', rosterId: 3, playerIds: ['p1'], playerPoints: { p1: 18 } },
    ],
  };
  const context = chopRecapContext({ faabMarket });

  assert.equal(context.faabMarket.releasedPools[0].week, 3);
  assert.equal(context.faabMarket.releasedPools[0].releasedBy, 'Charlie');
});

/* ------------------------------------------------------------------------ grading */

test('a graded chop prediction is passed straight through as previousPredictions', () => {
  const gradedPredictions = {
    results: [{ week: 3, predicted_chop: 'Charlie', actual_chop: 'Charlie', chop_source: 'declared', correct: true }],
    correct: 1,
    total: 1,
    accuracy: 100,
  };
  const context = chopRecapContext({ gradedPredictions });
  assert.deepEqual(context.previousPredictions, gradedPredictions);
  assert.ok(!unavailableFields(context).includes('previousPredictions'));
});

test('no recorded prediction is stated as unavailable, with an instruction not to invent one', () => {
  const context = chopRecapContext({ gradedPredictions: null });
  const entry = context.unavailable.find((item) => item.field === 'previousPredictions');
  assert.ok(entry, 'chop-recap must get the same previousPredictions guard recap does');
  assert.match(entry.instruction, /do not.*(predict|invent)/i);
});

/* -------------------------------------------------------------- nothing matchup-shaped */

const MATCHUP_FIELDS = /opponent|winner|loser|matchupId/i;

function factsJson(context) {
  const { unavailable, ...facts } = context;
  return JSON.stringify(facts);
}

test('a chop-recap context carries no matchup-shaped fact anywhere', () => {
  assert.doesNotMatch(factsJson(chopRecapContext()), MATCHUP_FIELDS);
});

test('a chop-recap standings entry carries no win-loss record', () => {
  const context = chopRecapContext();
  for (const entry of context.standings) {
    assert.equal(Object.hasOwn(entry, 'record'), false, `${entry.team} should carry no record`);
  }
});

/* ------------------------------------------------------------------- missing chop line */

test('a chop recap with no danger board states that the chop line is unavailable, without banning real scores', () => {
  const context = chopRecapContext({ dangerBoard: null });
  const entry = context.unavailable.find((item) => item.field === 'chopLine');
  assert.ok(entry);
  assert.doesNotMatch(entry.instruction, /do not cite any score/i, 'thisWeek scores are still real for a recap');
});
