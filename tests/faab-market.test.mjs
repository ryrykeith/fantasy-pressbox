import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { faabBalances, releasedPool, buildFaabMarket } from '../src/analysis/faab.mjs';
import { waiverBidsFor } from '../src/sleeper/normalize.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { captureWeek, readFaabMarket } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

/**
 * The waiver market IS the story in a guillotine league: every chop dumps a
 * full roster of talent onto the wire at once. Fixtures mirror
 * tests/elimination-ledger.test.mjs and tests/danger-board.test.mjs, since
 * this module reads the same ledger and the same raw weekly bundles those
 * already build.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

function team(rosterId, name, { waiverBudgetUsed = 0 } = {}) {
  return { rosterId, name, ownerId: `owner-${rosterId}`, playerIds: ['qb', 'rb', 'wr'], waiverBudgetUsed };
}

function choppedTeam(rosterId, name, { waiverBudgetUsed = 0 } = {}) {
  return { rosterId, name, ownerId: null, playerIds: [], waiverBudgetUsed };
}

function week(number, scores, { played = true } = {}) {
  return {
    week: number,
    played,
    scores: Object.entries(scores).map(([rosterId, points]) => ({
      rosterId: Number.parseInt(rosterId, 10),
      points,
    })),
  };
}

/* ------------------------------------------------------------ faabBalances */

test('remaining FAAB is the league budget minus what a team has spent', () => {
  const balances = faabBalances({
    teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 30 }), team(2, 'Late Bloomers', { waiverBudgetUsed: 65 })],
    waiverBudget: 100,
  });

  assert.deepEqual(balances, [
    { rosterId: 1, team: 'Chopping Block', spent: 30, remaining: 70 },
    { rosterId: 2, team: 'Late Bloomers', spent: 65, remaining: 35 },
  ]);
});

test('balances are sorted richest-remaining-first', () => {
  const balances = faabBalances({
    teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 90 }), team(2, 'Late Bloomers', { waiverBudgetUsed: 10 })],
    waiverBudget: 100,
  });

  assert.deepEqual(balances.map((entry) => entry.team), ['Late Bloomers', 'Chopping Block']);
});

test('a league with no waiver budget configured reports remaining as null, not a guessed number', () => {
  const balances = faabBalances({ teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 30 })], waiverBudget: null });
  assert.equal(balances[0].remaining, null);
  assert.equal(balances[0].spent, 30);
});

test('an eliminated team is excluded from balances entirely', () => {
  const ledger = buildEliminationLedger({
    teams: [team(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')],
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 80 })],
    throughWeek: 1,
  });

  const balances = faabBalances({
    teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 20 }), team(2, 'Late Bloomers', { waiverBudgetUsed: 5 })],
    waiverBudget: 100,
    ledger,
  });

  assert.deepEqual(balances.map((entry) => entry.team), ['Chopping Block']);
});

test('with no ledger supplied, every team is treated as a survivor', () => {
  const balances = faabBalances({
    teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 0 }), team(2, 'Late Bloomers', { waiverBudgetUsed: 0 })],
    waiverBudget: 100,
  });
  assert.equal(balances.length, 2);
});

/* ------------------------------------------------------------ releasedPool */

const WEEK1_MATCHUPS = [
  { roster_id: 1, matchup_id: 1, points: 120, starters: ['qb1'], starters_points: [120], players: ['qb1'], players_points: { qb1: 120 } },
  {
    roster_id: 2,
    matchup_id: 1,
    points: 80,
    starters: ['qb2'],
    starters_points: [50],
    players: ['qb2', 'rb2'],
    players_points: { qb2: 50, rb2: 30 },
  },
];

test('the released pool is the chopped roster\'s full player list for the week it happened, bench included', () => {
  const pool = releasedPool({
    eliminatedEntry: { week: 1, team: 'Late Bloomers', rosterId: 2 },
    matchups: WEEK1_MATCHUPS,
  });

  assert.deepEqual(pool.playerIds, ['qb2', 'rb2']);
  assert.deepEqual(pool.playerPoints, { qb2: 50, rb2: 30 });
  assert.equal(Object.hasOwn(pool, 'note'), false);
});

test('a week with no matchup data on disk reports the gap instead of an empty pool that looks the same as "nothing released"', () => {
  const pool = releasedPool({
    eliminatedEntry: { week: 3, team: 'Late Bloomers', rosterId: 2 },
    matchups: [],
  });

  assert.deepEqual(pool.playerIds, []);
  assert.match(pool.note, /week 3/);
  assert.match(pool.note, /Late Bloomers/);
});

/* -------------------------------------------------------------- waiverBidsFor */

test('a winning FAAB bid on a wanted player is matched by id, team name resolved from roster id', () => {
  const transactions = [
    {
      status: 'complete',
      type: 'waiver',
      leg: 2,
      settings: { waiver_bid: 12 },
      adds: { qb2: 1 },
      drops: {},
    },
  ];
  const bids = waiverBidsFor(transactions, ['qb2'], {
    teamsByRosterId: new Map([[1, { name: 'Chopping Block' }]]),
  });

  assert.deepEqual(bids, [{ playerId: 'qb2', week: 2, amount: 12, wonBy: 'Chopping Block' }]);
});

test('a free-agent add with no waiver_bid is not a bid', () => {
  const transactions = [{ status: 'complete', type: 'free_agent', leg: 2, adds: { qb2: 1 }, settings: {} }];
  assert.deepEqual(waiverBidsFor(transactions, ['qb2'], { teamsByRosterId: new Map() }), []);
});

test('a failed transaction is never a winning bid', () => {
  const transactions = [
    { status: 'failed', type: 'waiver', leg: 2, settings: { waiver_bid: 12 }, adds: { qb2: 1 } },
  ];
  assert.deepEqual(waiverBidsFor(transactions, ['qb2'], { teamsByRosterId: new Map() }), []);
});

test('a bid on a player nobody asked about is left out', () => {
  const transactions = [
    { status: 'complete', type: 'waiver', leg: 2, settings: { waiver_bid: 12 }, adds: { someoneElse: 1 } },
  ];
  assert.deepEqual(waiverBidsFor(transactions, ['qb2'], { teamsByRosterId: new Map() }), []);
});

/* ------------------------------------------------------------ buildFaabMarket */

test('buildFaabMarket attaches a winning bid to the released player it was placed on', () => {
  const ledger = buildEliminationLedger({
    teams: [team(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')],
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 80 })],
    throughWeek: 1,
  });

  const market = buildFaabMarket({
    teams: [team(1, 'Chopping Block', { waiverBudgetUsed: 10 }), team(2, 'Late Bloomers', { waiverBudgetUsed: 0 })],
    waiverBudget: 100,
    ledger,
    rawWeeks: [
      { week: 1, matchups: WEEK1_MATCHUPS, transactions: [] },
      {
        week: 2,
        matchups: [],
        transactions: [
          {
            status: 'complete',
            type: 'waiver',
            leg: 2,
            settings: { waiver_bid: 15 },
            adds: { qb2: 1 },
          },
        ],
      },
    ],
    teamsByRosterId: new Map([[1, { name: 'Chopping Block' }], [2, { name: 'Late Bloomers' }]]),
  });

  assert.deepEqual(market.balances.map((entry) => entry.team), ['Chopping Block']);
  assert.equal(market.releasedPools.length, 1);
  const [pool] = market.releasedPools;
  assert.equal(pool.team, 'Late Bloomers');
  assert.deepEqual(pool.playerIds, ['qb2', 'rb2']);
  assert.deepEqual(pool.bids, [{ playerId: 'qb2', week: 2, amount: 15, wonBy: 'Chopping Block' }]);
});

test('a released player nobody has claimed yet carries no bids key', () => {
  const ledger = buildEliminationLedger({
    teams: [team(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')],
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 80 })],
    throughWeek: 1,
  });

  const market = buildFaabMarket({
    teams: [team(1, 'Chopping Block'), team(2, 'Late Bloomers')],
    waiverBudget: 100,
    ledger,
    rawWeeks: [{ week: 1, matchups: WEEK1_MATCHUPS, transactions: [] }],
    teamsByRosterId: new Map([[1, { name: 'Chopping Block' }], [2, { name: 'Late Bloomers' }]]),
  });

  assert.equal(Object.hasOwn(market.releasedPools[0], 'bids'), false);
});

test('with no ledger at all, there are no released pools to report', () => {
  const market = buildFaabMarket({
    teams: [team(1, 'Chopping Block')],
    waiverBudget: 100,
    rawWeeks: [],
    teamsByRosterId: new Map(),
  });
  assert.deepEqual(market.releasedPools, []);
});

/* ------------------------------------------------- captureWeek / readFaabMarket */

const CURRENT_MATCHUPS = [
  { roster_id: 1, matchup_id: 1, points: 120, starters: ['qb'], starters_points: [120], players: ['qb'], players_points: { qb: 120 } },
  { roster_id: 2, matchup_id: 1, points: 90, starters: ['rb'], starters_points: [90], players: ['rb'], players_points: { rb: 90 } },
];

const PLAYERS = {
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL' },
};

function fakeClient(transactions = []) {
  return {
    matchups: async () => CURRENT_MATCHUPS,
    transactions: async () => transactions,
  };
}

function leagueOf(formatType, { waiverBudget = 100 } = {}) {
  return {
    id: '123',
    season: '2026',
    startingSlots: STARTING_SLOTS,
    format: { type: formatType, source: 'declared' },
    waiverBudget,
  };
}

test('captureWeek records the FAAB market in a guillotine snapshot', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block', { waiverBudgetUsed: 10 }), choppedTeam(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('guillotine'),
    teams,
    players: PLAYERS,
    week: 1,
    config: { guillotine: { eliminations: [] } },
  });

  assert.equal(result.faab.balances.length, 1);
  assert.equal(result.faab.balances[0].team, 'Chopping Block');
  assert.equal(result.faab.balances[0].remaining, 90);
  assert.equal(result.faab.releasedPools[0].team, 'Late Bloomers');
  assert.deepEqual(result.faab.releasedPools[0].playerIds, ['rb']);

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(written.faab.releasedPools[0].team, 'Late Bloomers');
});

test('a format with no eliminations gets no faab key at all, rather than a null one', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block'), team(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('dynasty'),
    teams,
    players: PLAYERS,
    week: 1,
  });

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(Object.hasOwn(written, 'faab'), false);
  assert.equal(Object.hasOwn(result, 'faab'), false);
});

test('a chop from an earlier week still reports its released pool once a later week is captured', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')];
  const league = leagueOf('guillotine');
  const config = { guillotine: { eliminations: [] } };

  // Week 1: roster 2 is chopped (lowest score, and already looks emptied).
  await captureWeek({ client: fakeClient(), store, league, teams, players: PLAYERS, week: 1, config });

  // Week 2: a different client (different matchups) — proves the released
  // pool for week 1 comes from week 1's own saved raw bundle, not week 2's.
  const week2Client = {
    matchups: async () => [
      { roster_id: 1, matchup_id: 1, points: 100, starters: ['qb'], starters_points: [100], players: ['qb'], players_points: { qb: 100 } },
    ],
    transactions: async () => [
      { status: 'complete', type: 'waiver', leg: 2, settings: { waiver_bid: 8 }, adds: { rb: 1 } },
    ],
  };
  const second = await captureWeek({ client: week2Client, store, league, teams, players: PLAYERS, week: 2, config });

  assert.equal(second.faab.releasedPools.length, 1);
  assert.equal(second.faab.releasedPools[0].week, 1);
  assert.deepEqual(second.faab.releasedPools[0].playerIds, ['rb']);
  assert.deepEqual(second.faab.releasedPools[0].bids, [{ playerId: 'rb', week: 2, amount: 8, wonBy: 'Chopping Block' }]);
});

test('readFaabMarket fetches nothing and rebuilds the market from weeks already on disk', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block', { waiverBudgetUsed: 10 }), choppedTeam(2, 'Late Bloomers')];
  const league = leagueOf('guillotine');
  const config = { guillotine: { eliminations: [] } };

  await captureWeek({ client: fakeClient(), store, league, teams, players: PLAYERS, week: 1, config });

  const noFetchClient = {
    matchups: async () => { throw new Error('should not fetch'); },
    transactions: async () => { throw new Error('should not fetch'); },
  };

  const market = readFaabMarket({ client: noFetchClient, store, league, teams, config, throughWeek: 1 });
  assert.equal(market.balances[0].team, 'Chopping Block');
  assert.equal(market.releasedPools[0].team, 'Late Bloomers');
  assert.deepEqual(market.releasedPools[0].playerIds, ['rb']);
});
