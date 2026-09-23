import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext } from '../src/promptContext.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';

/**
 * Guillotine has no head-to-head record — Sleeper's is a fiction from
 * matchups nobody played. The only standing that means anything is
 * cumulative points among teams still alive, and a chopped team belongs to
 * elimination history, not the live list. This is the WHERE named in the
 * task: context.standings (and, since "no win-loss record anywhere" is
 * broader than just standings, context.teams too).
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

const DYNASTY_WEIGHTS = {
  starting_lineup: 0.3,
  dynasty_value: 0.25,
  depth: 0.15,
  quarterback: 0.1,
  future_draft_capital: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.05,
};
const GUILLOTINE_WEIGHTS = { weekly_floor: 0.6, starting_lineup: 0.4 };
const REDRAFT_WEIGHTS = {
  starting_lineup: 0.45,
  depth: 0.25,
  quarterback: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.15,
};

function testConfig() {
  return {
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
      weights: { dynasty: DYNASTY_WEIGHTS, guillotine: GUILLOTINE_WEIGHTS, redraft: REDRAFT_WEIGHTS },
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
      // Sleeper cannot see a guillotine league, so detection would say
      // redraft even when the operator has declared otherwise.
      detectedType: 'redraft',
      scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: STARTING_SLOTS }),
    },
  };
}

/** Four teams with distinct season points, deliberately out of sorted order. */
function testTeams() {
  return [
    team(1, 'Chopping Block', 210.5),
    team(2, 'Late Bloomers', 340.25),
    team(3, 'Faab Hoarders', 275.0),
    team(4, 'Bye Week Blues', 190.75),
  ];
}

function team(rosterId, name, seasonPointsFor) {
  return {
    rosterId,
    name,
    manager: `manager${rosterId}`,
    // A guillotine league's own Sleeper-reported record is fiction — a
    // context built for one must never read it. Filled in anyway, to prove
    // the assertion is about the format, not an accident of an empty fixture.
    record: { wins: 6, losses: 2, ties: 0 },
    seasonPointsFor,
    seasonPointsAgainst: 250,
    seasonPotentialPoints: 300,
    playerIds: ['qb1'],
    starterIds: ['qb1'],
    taxiIds: [],
    reserveIds: [],
  };
}

function contextFor(formatType, { task = 'recap', eliminationLedger = null, faabMarket = null, players = {} } = {}) {
  return buildContext({
    task,
    config: testConfig(),
    league: testLeague(formatType),
    teams: testTeams(),
    players,
    week: 3,
    eliminationLedger,
    faabMarket,
  });
}

/* ------------------------------------------------------------ standings */

test('a guillotine standings list is sorted by cumulative points, not wins', () => {
  const context = contextFor('guillotine');

  assert.deepEqual(
    context.standings.map((entry) => entry.team),
    ['Late Bloomers', 'Faab Hoarders', 'Chopping Block', 'Bye Week Blues'],
  );
});

test('a guillotine standings entry carries no win-loss record', () => {
  const context = contextFor('guillotine');

  for (const entry of context.standings) {
    assert.equal(Object.hasOwn(entry, 'record'), false, `${entry.team} should carry no record`);
  }
});

test('a guillotine standings entry carries no pointsAgainst — this format has no opponents', () => {
  const context = contextFor('guillotine');

  for (const entry of context.standings) {
    assert.equal(Object.hasOwn(entry, 'pointsAgainst'), false);
  }
});

test('a dynasty standings list is unaffected: still sorted by wins then points, with a record', () => {
  const context = contextFor('dynasty');

  for (const entry of context.standings) {
    assert.match(entry.record, /^\d+-\d+$/);
    assert.ok(Object.hasOwn(entry, 'pointsAgainst'));
  }
  assert.equal(context.eliminationHistory, undefined, 'a non-eliminating format gets no elimination key');
});

/* ------------------------------------------------------- elimination history */

test('an eliminated team is removed from standings and appears in elimination history with its week', () => {
  const eliminationLedger = {
    history: [{ week: 2, rosterId: 4, team: 'Bye Week Blues', source: 'declared' }],
  };
  const context = contextFor('guillotine', { eliminationLedger });

  assert.deepEqual(
    context.standings.map((entry) => entry.team),
    ['Late Bloomers', 'Faab Hoarders', 'Chopping Block'],
    'the chopped team must not linger in live standings',
  );
  assert.deepEqual(context.eliminationHistory, [{ team: 'Bye Week Blues', week: 2 }]);
});

test('elimination history is an explicit empty list, not an absent key, when nobody has been chopped yet', () => {
  const context = contextFor('guillotine', { eliminationLedger: { history: [] } });

  assert.deepEqual(context.eliminationHistory, []);
  assert.equal(context.standings.length, 4, 'nobody chopped yet, so every team is still a survivor');
});

test('elimination history is still built when no ledger is supplied at all', () => {
  const context = contextFor('guillotine', { eliminationLedger: null });

  assert.deepEqual(context.eliminationHistory, []);
  assert.equal(context.standings.length, 4);
});

test('elimination history lists multiple chops in week order regardless of ledger order', () => {
  const eliminationLedger = {
    history: [
      { week: 3, rosterId: 1, team: 'Chopping Block', source: 'derived' },
      { week: 1, rosterId: 4, team: 'Bye Week Blues', source: 'declared' },
    ],
  };
  const context = contextFor('guillotine', { eliminationLedger });

  assert.deepEqual(context.eliminationHistory, [
    { team: 'Bye Week Blues', week: 1 },
    { team: 'Chopping Block', week: 3 },
  ]);
  assert.deepEqual(
    context.standings.map((entry) => entry.team),
    ['Late Bloomers', 'Faab Hoarders'],
  );
});

/* ------------------------------------------------------- context.teams (rankings) */

test('a guillotine rankings edition carries rosters with no win-loss record', () => {
  const context = contextFor('guillotine', { task: 'rankings' });

  for (const entry of context.teams) {
    assert.equal(Object.hasOwn(entry, 'record'), false, `${entry.team} should carry no record`);
    assert.ok(Object.hasOwn(entry, 'pointsFor'), 'the roster view still reports points');
  }
});

test('a dynasty rankings edition still carries each roster\'s win-loss record', () => {
  const context = contextFor('dynasty', { task: 'rankings' });

  for (const entry of context.teams) {
    assert.match(entry.record, /^\d+-\d+$/);
  }
});

test('every guillotine task keeps rosters and standings free of a win-loss record', () => {
  for (const task of ['preview', 'recap', 'rankings', 'preseason-rankings', 'postseason']) {
    const context = contextFor('guillotine', { task });
    const facts = JSON.stringify(context.teams ?? context.standings);
    assert.doesNotMatch(facts, /"record"/, `${task} leaked a win-loss record`);
  }
});

/* --------------------------------------------------------------- FAAB market */

const FAAB_PLAYERS = {
  rb2: { full_name: 'Rex Carter', position: 'RB', team: 'DAL' },
};

test('a guillotine context with a FAAB market carries balances and released pools, players resolved to lines', () => {
  const faabMarket = {
    budget: 100,
    balances: [{ rosterId: 1, team: 'Chopping Block', spent: 30, remaining: 70 }],
    releasedPools: [
      {
        week: 2,
        team: 'Bye Week Blues',
        rosterId: 4,
        playerIds: ['rb2'],
        playerPoints: { rb2: 12.5 },
        bids: [{ playerId: 'rb2', week: 3, amount: 9, wonBy: 'Chopping Block' }],
      },
    ],
  };
  const context = contextFor('guillotine', { faabMarket, players: FAAB_PLAYERS });

  assert.equal(context.faabMarket.leagueBudget, 100);
  assert.deepEqual(context.faabMarket.balances, [{ team: 'Chopping Block', spent: 30, remaining: 70 }]);
  assert.equal(context.faabMarket.releasedPools[0].week, 2);
  assert.equal(context.faabMarket.releasedPools[0].releasedBy, 'Bye Week Blues');
  assert.match(context.faabMarket.releasedPools[0].players[0], /Rex Carter/);
  assert.match(context.faabMarket.releasedPools[0].players[0], /12\.5 pts/);
  assert.match(context.faabMarket.releasedPools[0].bids[0], /Chopping Block won/);
  assert.match(context.faabMarket.releasedPools[0].bids[0], /\$9/);
});

test('a released pool with no matchup data on disk carries its note through to context untouched', () => {
  const faabMarket = {
    budget: 100,
    balances: [],
    releasedPools: [
      { week: 2, team: 'Bye Week Blues', rosterId: 4, playerIds: [], playerPoints: {}, note: 'No week 2 matchup data is on disk.' },
    ],
  };
  const context = contextFor('guillotine', { faabMarket });
  assert.equal(context.faabMarket.releasedPools[0].note, 'No week 2 matchup data is on disk.');
  assert.deepEqual(context.faabMarket.releasedPools[0].players, []);
});

test('no FAAB market supplied means no faabMarket key at all, not a null one', () => {
  const context = contextFor('guillotine');
  assert.equal(Object.hasOwn(context, 'faabMarket'), false);
});

test('a dynasty context never carries a FAAB market, even if one is supplied', () => {
  const faabMarket = { budget: 100, balances: [], releasedPools: [] };
  const context = contextFor('dynasty', { faabMarket });
  assert.equal(Object.hasOwn(context, 'faabMarket'), false);
});
