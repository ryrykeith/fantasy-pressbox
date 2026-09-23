import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeWeek } from '../src/analysis/week.mjs';
import { buildContext } from '../src/promptContext.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';

/**
 * Sleeper has no guillotine support, so it reports a guillotine league as an
 * ordinary head-to-head one: every fixture below feeds the real pairings
 * Sleeper would send, and the point of each test is that nothing downstream
 * repeats them.
 *
 * Each assertion is paired with the same fixture run as a dynasty league, so a
 * passing test means "stripped because the format says so", not "the fixture
 * never had one".
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

const TEAM_NAMES = ['Chopping Block', 'Late Bloomers', 'Faab Hoarders', 'Bye Week Blues'];

const PLAYERS = {
  qb1: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF', age: 27 },
  rb1: { full_name: 'Rex Carter', position: 'RB', team: 'DAL', age: 24 },
  wr1: { full_name: 'Wes Lane', position: 'WR', team: 'MIA', age: 26 },
  qb2: { full_name: 'Case Holt', position: 'QB', team: 'KC', age: 29 },
  rb2: { full_name: 'Roy Marsh', position: 'RB', team: 'GB', age: 23 },
  wr2: { full_name: 'Wade Pike', position: 'WR', team: 'SF', age: 25 },
  bench1: { full_name: 'Bo Tanner', position: 'RB', team: 'NYJ', age: 22 },
};

const GUILLOTINE_WEIGHTS = { weekly_floor: 0.6, starting_lineup: 0.4 };

const DYNASTY_WEIGHTS = {
  starting_lineup: 0.3,
  dynasty_value: 0.25,
  depth: 0.15,
  quarterback: 0.1,
  future_draft_capital: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.05,
};

/**
 * config/rankings.yml deliberately has no guillotine set yet, and
 * resolveRankingWeights throws without one, so the fixture supplies a
 * placeholder. The real set arrives with the guillotine rankings edition.
 */
function testConfig() {
  return {
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {
        team_of_week: true,
        biggest_blowout: true,
        closest_game: true,
        highest_losing_score: true,
        lowest_score: true,
      },
    },
    rankings: {
      weights: { dynasty: DYNASTY_WEIGHTS, guillotine: GUILLOTINE_WEIGHTS },
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
      // Sleeper cannot see a guillotine league, so detection says redraft even
      // when the operator has declared otherwise. That is the real shape.
      detectedType: 'redraft',
      scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: STARTING_SLOTS }),
    },
  };
}

function testTeams() {
  return TEAM_NAMES.map((name, index) => ({
    rosterId: index + 1,
    name,
    manager: `manager${index + 1}`,
    record: { wins: 2, losses: 1, ties: 0 },
    seasonPointsFor: 300 + index,
    seasonPointsAgainst: 290,
    seasonPotentialPoints: 350,
    playerIds: ['qb1', 'rb1', 'wr1', 'bench1'],
    starterIds: ['qb1', 'rb1', 'wr1'],
    taxiIds: [],
    reserveIds: [],
  }));
}

/** One roster's week, in the shape Sleeper's /matchups endpoint returns. */
function matchupEntry({ rosterId, matchupId, starters, starterPoints }) {
  const playersPoints = {};
  starters.forEach((id, index) => {
    playersPoints[id] = starterPoints[index];
  });
  playersPoints.bench1 = 21.5;

  return {
    roster_id: rosterId,
    matchup_id: matchupId,
    points: Number(starterPoints.reduce((total, value) => total + value, 0).toFixed(2)),
    starters,
    starters_points: starterPoints,
    players: [...starters, 'bench1'],
    players_points: playersPoints,
  };
}

/** Sleeper's pairings for a league that plays no games: rosters 1v2 and 3v4. */
function testMatchups() {
  return [
    matchupEntry({ rosterId: 1, matchupId: 1, starters: ['qb1', 'rb1', 'wr1'], starterPoints: [25.1, 14.2, 9.4] }),
    matchupEntry({ rosterId: 2, matchupId: 1, starters: ['qb2', 'rb2', 'wr2'], starterPoints: [18.6, 11.3, 20.2] }),
    matchupEntry({ rosterId: 3, matchupId: 2, starters: ['qb1', 'rb2', 'wr1'], starterPoints: [12.0, 8.8, 30.6] }),
    matchupEntry({ rosterId: 4, matchupId: 2, starters: ['qb2', 'rb1', 'wr2'], starterPoints: [7.2, 6.1, 5.0] }),
  ];
}

function analyze(formatType, week = 3) {
  return analyzeWeek({
    league: testLeague(formatType),
    teams: testTeams(),
    matchups: testMatchups(),
    players: PLAYERS,
    week,
  });
}

function contextFor(formatType, { task = 'recap' } = {}) {
  return buildContext({
    task,
    config: testConfig(),
    league: testLeague(formatType),
    teams: testTeams(),
    players: PLAYERS,
    week: 3,
    weekAnalysis: analyze(formatType, 3),
    upcomingAnalysis: analyze(formatType, 4),
    priorWeekAnalysis: analyze(formatType, 2),
  });
}

/**
 * Every matchup-shaped field, searched for as text.
 *
 * A structural check would only cover the keys someone thought to look at; the
 * string search catches one reintroduced three levels down in a shape that does
 * not exist yet.
 */
const MATCHUP_FIELDS = /opponent|winner|loser|margin|matchupId/i;

/**
 * The `unavailable` list is excluded on purpose: its whole job is to name the
 * forbidden concepts so the model is told not to write them. Everything else is
 * fact the model is invited to cite, and that is what must be clean.
 */
function factsJson(context) {
  const { unavailable, ...facts } = context;
  return JSON.stringify(facts);
}

/* ------------------------------------------------------------- analyzeWeek */

test('a guillotine week produces per-team scoring facts with no matchup fields', () => {
  const analysis = analyze('guillotine');

  assert.equal(analysis.teamWeeks.length, 4, 'every roster still gets its week scored');

  for (const entry of analysis.teamWeeks) {
    for (const field of ['opponent', 'opponentPoints', 'result', 'margin']) {
      assert.equal(
        Object.hasOwn(entry, field),
        false,
        `${entry.team} should carry no "${field}" — the field must be absent, not null`,
      );
    }
  }
});

test('a guillotine week discards Sleeper\'s pairings entirely', () => {
  const analysis = analyze('guillotine');

  assert.deepEqual(analysis.games, []);
  assert.deepEqual(analysis.unpairedRosterIds, []);
});

test('a guillotine week still scores, ranks and awards on its own numbers', () => {
  const analysis = analyze('guillotine');

  assert.deepEqual(
    analysis.scoringOrder.map((entry) => entry.team),
    ['Faab Hoarders', 'Late Bloomers', 'Chopping Block', 'Bye Week Blues'],
  );
  // The lowest score is the chop, so it is the most important fact of the week.
  assert.equal(analysis.awards.lowestScore.team, 'Bye Week Blues');
  assert.ok(analysis.awards.teamOfTheWeek, 'the highest scorer is still an award');
  assert.ok(analysis.teamWeeks[0].lineupEfficiency > 0, 'lineup efficiency survives');
});

test('awards that only exist because two teams played are omitted', () => {
  const analysis = analyze('guillotine');

  for (const award of ['biggestBlowout', 'closestGame', 'highestLosingScore']) {
    assert.equal(Object.hasOwn(analysis.awards, award), false, `${award} should not be offered`);
  }
});

test('the same fixture as a dynasty league keeps every matchup fact', () => {
  const analysis = analyze('dynasty');

  assert.equal(analysis.games.length, 2);
  assert.equal(analysis.teamWeeks[0].opponent, 'Late Bloomers');
  assert.equal(analysis.teamWeeks[0].result, 'L');
  assert.ok(analysis.awards.biggestBlowout);
});

/* ------------------------------------------------------------ buildContext */

test('a guillotine context carries no matchup-shaped fact anywhere', () => {
  assert.doesNotMatch(factsJson(contextFor('guillotine')), MATCHUP_FIELDS);
});

test('a guillotine context has no games, no upcoming matchups and no unpaired teams', () => {
  const context = contextFor('guillotine');

  assert.equal(context.thisWeek.games, undefined);
  assert.equal(context.previousWeek.games, undefined);
  assert.equal(context.upcomingMatchups, undefined);
  assert.equal(context.unpairedTeams, undefined);

  // The facts are not lost, only re-shaped: one entry per team, not per game.
  assert.equal(context.thisWeek.teams.length, 4);
  assert.ok(context.thisWeek.teams[0].starters.length, 'starters still reach the model');
  assert.equal(context.previousWeek.teams.length, 4);
});

test('a guillotine context advertises no award that needs an opposing team', () => {
  const context = contextFor('guillotine');

  for (const award of ['biggest_blowout', 'closest_game', 'highest_losing_score']) {
    assert.equal(Object.hasOwn(context.editorial.awards, award), false, `${award} should be filtered out`);
  }
  assert.equal(context.editorial.awards.lowest_score, true, 'the chop award stays');
});

test('the unavailable list names matchups as a non-concept for this league', () => {
  const context = contextFor('guillotine');
  const entry = context.unavailable.find((item) => item.field === 'matchups');

  assert.ok(entry, 'expected an unavailable entry for matchups');
  assert.match(entry.why, /guillotine/i);
  assert.match(entry.instruction, /not a concept|no opponent/i);
  assert.match(entry.instruction, /never describe/i);
});

test('every guillotine edition is stripped, not just the recap', () => {
  for (const task of ['preview', 'recap', 'rankings', 'preseason-rankings', 'postseason']) {
    const context = contextFor('guillotine', { task });
    assert.doesNotMatch(factsJson(context), MATCHUP_FIELDS, `${task} leaked a matchup fact`);
    assert.ok(
      context.unavailable.some((item) => item.field === 'matchups'),
      `${task} should be told this league has no matchups`,
    );
  }
});

test('the same fixture as a dynasty league still gets its matchups', () => {
  const context = contextFor('dynasty');

  assert.match(factsJson(context), MATCHUP_FIELDS);
  assert.equal(context.thisWeek.games.length, 2);
  assert.equal(context.upcomingMatchups.length, 2);
  assert.equal(
    context.unavailable.find((item) => item.field === 'matchups'),
    undefined,
    'a dynasty league plays games, so nothing is missing',
  );
  assert.equal(context.editorial.awards.biggest_blowout, true);
});
