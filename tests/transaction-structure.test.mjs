import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTransactions, normalizeWeekRosters } from '../src/sleeper/normalize.mjs';
import { buildContext, describePlayer } from '../src/promptContext.mjs';

const teamsByRosterId = new Map([
  [1, { rosterId: 1, name: 'Pick Six Appeal' }],
  [2, { rosterId: 2, name: 'Second Team' }],
  [3, { rosterId: 3, name: 'Third Team' }],
]);

const players = {
  p_wr: { full_name: 'DJ Moore', position: 'WR', team: 'CHI', age: 29 },
  p_rb: { full_name: 'Some Back', position: 'RB', team: 'DET', age: 24 },
  p_te: { full_name: 'Waiver Tight End', position: 'TE', team: 'NYG', age: 26 },
  p_cut: { full_name: 'Cut Receiver', position: 'WR', team: 'NE', age: 31 },
};

const inSeason = { season: '2026', status: 'in_season' };

const normalize = (transactions, league = inSeason) =>
  normalizeTransactions(transactions, { teamsByRosterId, players, describePlayer, league });

const trade = {
  transaction_id: 't1',
  type: 'trade',
  status: 'complete',
  leg: 3,
  status_updated: Date.UTC(2026, 8, 22, 3, 30),
  roster_ids: [1, 2],
  adds: { p_wr: 2, p_rb: 1 },
  drops: { p_wr: 1, p_rb: 2, p_cut: 2 },
  draft_picks: [{ season: '2027', round: 2, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
  waiver_budget: [{ sender: 1, receiver: 2, amount: 15 }],
};

const waiverClaim = {
  transaction_id: 'w1',
  type: 'waiver',
  status: 'complete',
  leg: 3,
  status_updated: Date.UTC(2026, 8, 17, 7),
  roster_ids: [3],
  adds: { p_te: 3 },
  drops: null,
  settings: { waiver_bid: 22 },
};

test('the readable moves are unchanged by the structured side', () => {
  const [entry] = normalize([trade]);
  assert.deepEqual(entry.moves, [
    'Second Team gets DJ Moore (WR, CHI, age 29)',
    'Pick Six Appeal gets Some Back (RB, DET, age 24)',
    'Pick Six Appeal drops DJ Moore (WR, CHI, age 29)',
    'Second Team drops Some Back (RB, DET, age 24)',
    'Second Team drops Cut Receiver (WR, NE, age 31)',
    'Pick Six Appeal gets 2027 round 2 pick from Second Team',
    'Pick Six Appeal sends $15 FAAB to Second Team',
  ]);
  assert.equal(entry.type, 'trade');
  assert.equal(entry.week, 3);
  assert.deepEqual(entry.teams, ['Pick Six Appeal', 'Second Team']);
  assert.equal(entry.bid, null);
});

test('a transaction records its id and when it cleared', () => {
  const [entry] = normalize([trade]);
  assert.equal(entry.id, 't1');
  assert.equal(entry.completedAt, '2026-09-22T03:30:00.000Z');
});

test('a transaction that never says when it cleared has a null time, not a guess', () => {
  const [entry] = normalize([{ ...trade, status_updated: undefined }]);
  assert.equal(entry.completedAt, null);
});

test('each side is identified by roster id, with the name for display only', () => {
  const [entry] = normalize([trade]);
  assert.deepEqual(entry.rosterIds, [1, 2]);
  assert.deepEqual(
    entry.sides.map((side) => [side.rosterId, side.team]),
    [
      [1, 'Pick Six Appeal'],
      [2, 'Second Team'],
    ],
  );
});

test('each side lists what it received and what it gave up as player references', () => {
  const [entry] = normalize([trade]);
  const [first, second] = entry.sides;

  assert.deepEqual(first.received.players, [
    { id: 'p_rb', name: 'Some Back', position: 'RB', nflTeam: 'DET', age: 24, from: 2 },
  ]);
  assert.deepEqual(first.gaveUp.players, [
    { id: 'p_wr', name: 'DJ Moore', position: 'WR', nflTeam: 'CHI', age: 29, to: 2 },
  ]);
  assert.deepEqual(first.received.picks, [{ season: '2027', round: 2, originalRosterId: 2, from: 2 }]);
  assert.deepEqual(first.gaveUp.picks, []);
  assert.equal(first.received.faab, 0);
  assert.equal(first.gaveUp.faab, 15);

  // A player dropped in the same move without going to anyone was released,
  // not traded — `to: null` says so.
  assert.deepEqual(
    second.gaveUp.players.map((p) => [p.id, p.to]),
    [
      ['p_rb', 1],
      ['p_cut', null],
    ],
  );
  assert.deepEqual(second.gaveUp.picks, [{ season: '2027', round: 2, originalRosterId: 2, to: 1 }]);
  assert.equal(second.received.faab, 15);
});

test('a waiver claim carries its winning bid on the claiming side', () => {
  const [entry] = normalize([waiverClaim]);
  assert.equal(entry.bid, 22);
  assert.equal(entry.sides.length, 1);
  assert.equal(entry.sides[0].rosterId, 3);
  assert.equal(entry.sides[0].waiverBid, 22);
  assert.deepEqual(entry.sides[0].received.players.map((p) => [p.id, p.from]), [['p_te', null]]);
});

test('a trade side carries no waiver bid at all', () => {
  const [entry] = normalize([trade]);
  for (const side of entry.sides) assert.equal('waiverBid' in side, false);
});

test('a player the player file does not know is still a reference, never dropped', () => {
  const [entry] = normalize([{ ...waiverClaim, adds: { ghost: 3 } }]);
  assert.deepEqual(entry.sides[0].received.players, [
    { id: 'ghost', name: 'Unknown player ghost', position: null, nflTeam: null, age: null, from: null },
  ]);
});

test('a pick-only swap made during a startup draft is not reported as a trade', () => {
  // Five of six trades in a startup year look like this: picks for the draft
  // that was being held, consumed the moment it ended.
  const startupSwap = {
    transaction_id: 's1',
    type: 'trade',
    status: 'complete',
    leg: 1,
    roster_ids: [1, 2],
    adds: null,
    drops: null,
    draft_picks: [
      { season: '2026', round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 2 },
      { season: '2026', round: 5, roster_id: 2, previous_owner_id: 2, owner_id: 1 },
    ],
    waiver_budget: [],
  };
  assert.deepEqual(normalize([startupSwap], { season: '2026', status: 'in_season' }), []);
});

test('a failed claim is not news', () => {
  assert.deepEqual(normalize([{ ...waiverClaim, status: 'failed' }]), []);
});

test('an edition gets transactions as the readable moves only, not the grading structure', () => {
  // The structured side is for a transaction brief. Every other edition has
  // always had the moves as colour, and keeps exactly that.
  const [entry] = normalize([trade]);
  const context = buildContext({
    task: 'rankings',
    config: {
      editorial: { tone: 'dry', output: { sleeper_max_chars: 500 }, banned_phrases: [], awards: {} },
      rankings: { weights: { dynasty: { starting_lineup: 1 } }, weekly: {} },
    },
    league: {
      name: 'Test League',
      season: '2026',
      status: 'in_season',
      startingSlots: ['QB'],
      taxiSlots: 0,
      format: { type: 'dynasty', source: 'declared', declaredType: 'dynasty', detectedType: 'dynasty' },
    },
    teams: [],
    players,
    week: 3,
    transactions: [entry],
  });
  assert.deepEqual(context.transactions, [
    { type: entry.type, week: entry.week, teams: entry.teams, bid: entry.bid, moves: entry.moves },
  ]);
});

test('a week of matchup entries becomes rosters keyed by roster id', () => {
  const rosters = normalizeWeekRosters([
    {
      roster_id: 1,
      matchup_id: 1,
      players: ['p_wr', 'p_cut'],
      starters: ['p_wr'],
      players_points: { p_wr: 12.4, p_cut: 3 },
    },
    { roster_id: 2, matchup_id: null, players: null, starters: null },
  ]);
  assert.deepEqual(rosters, [
    { rosterId: 1, playerIds: ['p_wr', 'p_cut'], starterIds: ['p_wr'], playerPoints: { p_wr: 12.4, p_cut: 3 } },
    { rosterId: 2, playerIds: [], starterIds: [], playerPoints: {} },
  ]);
});
