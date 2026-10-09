import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichTransactions, positionalShape, scoringContext } from '../src/analysis/transactions.mjs';
import { deriveScoringProfile, normalizeTransactions, normalizeWeekRosters } from '../src/sleeper/normalize.mjs';
import { describePlayer } from '../src/promptContext.mjs';
import { readTransactions } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A trade is graded against the rosters it was made with, not today's.
 * Fixture: a week 3 trade that sends a receiver from a team that needs him
 * to a team already deep at the position, in exchange for a running back.
 */

const STARTING_SLOTS = ['QB', 'WR', 'WR', 'TE', 'FLEX'];

const players = {
  qbA: { full_name: 'Quarterback A', position: 'QB', team: 'BUF' },
  qbB: { full_name: 'Quarterback B', position: 'QB', team: 'KC' },
  wrDJ: { full_name: 'DJ Moore', position: 'WR', team: 'CHI', age: 29 },
  wrA1: { full_name: 'Receiver A1', position: 'WR', team: 'MIA' },
  teA: { full_name: 'Tight End A', position: 'TE', team: 'LV' },
  wrB1: { full_name: 'Receiver B1', position: 'WR', team: 'CIN' },
  wrB2: { full_name: 'Receiver B2', position: 'WR', team: 'LAR' },
  wrB3: { full_name: 'Receiver B3', position: 'WR', team: 'DAL' },
  rbB: { full_name: 'Back B', position: 'RB', team: 'DET' },
  rbCut: { full_name: 'Cut Back', position: 'RB', team: 'NE' },
  teWire: { full_name: 'Wire Tight End', position: 'TE', team: 'NYG' },
};

const teams = [
  { rosterId: 1, name: 'Pick Six Appeal' },
  { rosterId: 2, name: 'Deep Receivers' },
  { rosterId: 3, name: 'Wire Hawks' },
];
const teamsByRosterId = new Map(teams.map((t) => [t.rosterId, t]));

function league({ waiverBudget = 100, scoring = {} } = {}) {
  return {
    season: '2026',
    status: 'in_season',
    startingSlots: STARTING_SLOTS,
    waiverBudget,
    format: { type: 'dynasty', scoring: deriveScoringProfile(scoring, { startingSlots: STARTING_SLOTS }) },
  };
}

function entry(rosterId, points, starters = []) {
  return { roster_id: rosterId, players: Object.keys(points), starters, players_points: points };
}

const preTradeRosters = (w) => [
  entry(1, { qbA: 20, wrDJ: 15, wrA1: 8, teA: 6 }, ['qbA', 'wrDJ', 'wrA1', 'teA']),
  entry(2, { qbB: 18, wrB1: 20, wrB2: 18, wrB3: 16, rbB: 10 + w, rbCut: 2 }, ['qbB', 'wrB1', 'wrB2', 'wrB3']),
];

// Week 3's entry as saved after the trade cleared: the move is already in it.
const week3AfterTrade = [
  entry(1, { qbA: 20, rbB: 11, wrA1: 8, teA: 6 }, ['qbA', 'wrA1', 'teA', 'rbB']),
  entry(2, { qbB: 18, wrB1: 20, wrB2: 18, wrB3: 16, wrDJ: 9 }, ['qbB', 'wrB1', 'wrB2', 'wrB3']),
];

const week4 = [
  entry(1, { qbA: 22, rbB: 14, wrA1: 7, teA: 5 }, ['qbA', 'wrA1', 'teA', 'rbB']),
  entry(2, { qbB: 19, wrB1: 21, wrB2: 17, wrB3: 15, wrDJ: 22 }, ['qbB', 'wrB1', 'wrB2', 'wrDJ']),
];

const rawTrade = {
  transaction_id: 'trade-1',
  type: 'trade',
  status: 'complete',
  leg: 3,
  status_updated: Date.UTC(2026, 8, 22, 3, 30),
  roster_ids: [1, 2],
  adds: { wrDJ: 2, rbB: 1 },
  drops: { wrDJ: 1, rbB: 2, rbCut: 2 },
  draft_picks: [],
  waiver_budget: [],
};

const normalize = (raw, l = league()) =>
  normalizeTransactions(raw, { teamsByRosterId, players, describePlayer, league: l });

const weeksWith = (week3) => [
  { week: 1, rosters: normalizeWeekRosters(preTradeRosters(1)) },
  { week: 2, rosters: normalizeWeekRosters(preTradeRosters(3)) },
  { week: 3, rosters: normalizeWeekRosters(week3) },
  { week: 4, rosters: normalizeWeekRosters(week4) },
];

function enrichedTrade(week3 = week3AfterTrade, l = league()) {
  const [trade] = enrichTransactions({
    transactions: normalize([rawTrade], l),
    league: l,
    teams,
    players,
    weeks: weeksWith(week3),
  });
  return trade;
}

const sideOf = (trade, rosterId) => trade.sides.find((side) => side.rosterId === rosterId);
const starterIds = (shape) => shape.projectedStarters.map((s) => s.id);

test('the moves strings and structured sides survive enrichment untouched', () => {
  const [plain] = normalize([rawTrade]);
  const trade = enrichedTrade();
  assert.deepEqual(trade.moves, plain.moves);
  assert.equal(trade.id, 'trade-1');
  assert.deepEqual(sideOf(trade, 1).received, plain.sides[0].received);
});

test('the roster before the move is rebuilt whether the week was saved before or after it', () => {
  const week3BeforeTrade = preTradeRosters(5);
  const fromAfter = enrichedTrade(week3AfterTrade);
  const fromBefore = enrichedTrade(week3BeforeTrade);

  for (const rosterId of [1, 2]) {
    const after = sideOf(fromAfter, rosterId).roster;
    const before = sideOf(fromBefore, rosterId).roster;
    assert.deepEqual(after.before.byPosition, before.before.byPosition);
    assert.deepEqual(starterIds(after.before), starterIds(before.before));
    assert.deepEqual(starterIds(after.after), starterIds(before.after));
  }

  const giver = sideOf(fromAfter, 1).roster;
  assert.equal(giver.asOfWeek, 3);
  assert.deepEqual(giver.before.byPosition.WR, { rostered: 2, dedicatedSlots: 2 });
  assert.deepEqual(giver.after.byPosition.WR, { rostered: 1, dedicatedSlots: 2 });
  assert.deepEqual(giver.after.byPosition.RB, { rostered: 1, dedicatedSlots: 0 });
});

test('a receiver added to a team already deep at the position would not start', () => {
  const deep = sideOf(enrichedTrade(), 2).roster;
  assert.deepEqual(deep.received, [{ id: 'wrDJ', startsAfter: null }]);
  // B3 holds the flex at 16 a game; DJ Moore's 15 does not move him.
  assert.equal(deep.after.projectedStarters.find((s) => s.slot === 'FLEX').id, 'wrB3');
  assert.deepEqual(deep.gaveUp, [
    { id: 'rbB', startedBefore: null },
    { id: 'rbCut', startedBefore: null },
  ]);
});

test('the team that gave him up is left with an empty receiver slot, and says so', () => {
  const giver = sideOf(enrichedTrade(), 1).roster;
  assert.deepEqual(giver.gaveUp, [{ id: 'wrDJ', startedBefore: 'WR' }]);
  assert.deepEqual(giver.received, [{ id: 'rbB', startsAfter: 'FLEX' }]);
  const emptyWr = giver.after.projectedStarters.filter((s) => s.slot === 'WR' && s.id === null);
  assert.equal(emptyWr.length, 1);
});

test('player value is points per rostered game from the weeks before the move only', () => {
  const giver = sideOf(enrichedTrade(), 1).roster;
  assert.equal(giver.valueBasis, 'points per rostered game, weeks 1–2');
  const rb = giver.after.projectedStarters.find((s) => s.id === 'rbB');
  // Weeks 1 and 2 scored 11 and 13; week 3's 11 and week 4's 14 are not used.
  assert.equal(rb.pointsPerGame, 12);
});

test('each moved player carries week-by-week points and the roster that banked them', () => {
  // Saved before the trade cleared: week 3's points stayed with the old team.
  const trade = enrichedTrade(preTradeRosters(5));
  const dj = trade.playerHistory.find((p) => p.id === 'wrDJ');
  assert.deepEqual(
    dj.weeks.map((w) => [w.week, w.rosterId, w.team, w.points, w.started]),
    [
      [1, 1, 'Pick Six Appeal', 15, true],
      [2, 1, 'Pick Six Appeal', 15, true],
      [3, 1, 'Pick Six Appeal', 15, true],
      [4, 2, 'Deep Receivers', 22, true],
    ],
  );
  assert.equal(trade.completedAt, '2026-09-22T03:30:00.000Z');
});

test('a move whose week is not on disk reports the gap instead of guessing a roster', () => {
  const l = league();
  const [trade] = enrichTransactions({ transactions: normalize([rawTrade], l), league: l, teams, players, weeks: [] });
  for (const side of trade.sides) {
    assert.equal(side.roster, null);
    assert.match(side.rosterNote, /No week 3 matchup data/);
  }
});

/* ---------------------------------------------------------------- FAAB */

const claim = (id, week, rosterId, playerId, bid, day) => ({
  transaction_id: id,
  type: 'waiver',
  status: 'complete',
  leg: week,
  status_updated: Date.UTC(2026, 8, day),
  roster_ids: [rosterId],
  adds: { [playerId]: rosterId },
  drops: null,
  settings: { waiver_bid: bid },
});

const faabTrade = {
  transaction_id: 'faab-trade',
  type: 'trade',
  status: 'complete',
  leg: 2,
  status_updated: Date.UTC(2026, 8, 12),
  roster_ids: [2, 3],
  adds: { rbCut: 3 },
  drops: { rbCut: 2 },
  waiver_budget: [{ sender: 2, receiver: 3, amount: 10 }],
};

test('a waiver claim is costed against the budget and what the claimant had left', () => {
  const l = league({ waiverBudget: 100 });
  const season = normalize([claim('c1', 1, 3, 'wrB3', 30, 9), faabTrade], l);
  const [enriched] = enrichTransactions({
    transactions: normalize([claim('c2', 3, 3, 'teWire', 22, 23)], l),
    seasonTransactions: season,
    league: l,
    teams,
    players,
  });
  // 100 − 30 (week 1 claim) + 10 (received in a trade) − 22 = 58 left; 80 before.
  assert.deepEqual(enriched.sides[0].faab, {
    bid: 22,
    budget: 100,
    shareOfBudget: 0.22,
    remainingAfter: 58,
    shareOfRemaining: 0.275,
  });
});

test('a later claim does not count against an earlier one', () => {
  const l = league({ waiverBudget: 100 });
  const transactions = normalize([claim('c1', 1, 3, 'wrB3', 30, 9)], l);
  const [enriched] = enrichTransactions({
    transactions,
    seasonTransactions: normalize([claim('c1', 1, 3, 'wrB3', 30, 9), claim('c9', 5, 3, 'teWire', 50, 30)], l),
    league: l,
    teams,
    players,
  });
  assert.equal(enriched.sides[0].faab.remainingAfter, 70);
});

test('a league with no budget reports no shares rather than dividing by nothing', () => {
  const l = league({ waiverBudget: null });
  const [enriched] = enrichTransactions({
    transactions: normalize([claim('c1', 1, 3, 'wrB3', 30, 9)], l),
    league: l,
    teams,
    players,
  });
  assert.deepEqual(enriched.sides[0].faab, {
    bid: 30,
    budget: null,
    shareOfBudget: null,
    remainingAfter: null,
    shareOfRemaining: null,
  });
});

test('a trade side has no claim cost', () => {
  for (const side of enrichedTrade().sides) assert.equal('faab' in side, false);
});

/* ------------------------------------------------------------- scoring */

test('a tight end moved in a TE-premium league carries the premium', () => {
  const l = league({ scoring: { rec: 1, bonus_rec_te: 0.5 } });
  const [enriched] = enrichTransactions({
    transactions: normalize([claim('c1', 1, 3, 'teWire', 5, 9)], l),
    league: l,
    teams,
    players,
  });
  assert.deepEqual(enriched.scoring, {
    superflex: false,
    receptionTier: 'full PPR',
    perCatch: { TE: 1.5 },
    premiumPositions: ['TE'],
  });
});

test('the premium is not mentioned when no premium position moved', () => {
  const l = league({ scoring: { rec: 1, bonus_rec_te: 0.5 } });
  const trade = enrichedTrade(week3AfterTrade, l);
  assert.deepEqual(trade.scoring.premiumPositions, []);
  assert.deepEqual(trade.scoring.perCatch, { WR: 1, RB: 1 });
});

test('passing rules appear only when a quarterback moved', () => {
  const profile = deriveScoringProfile({ pass_td: 6, pass_yd: 0.04 }, { startingSlots: ['QB', 'SUPER_FLEX'] });
  assert.equal('passing' in scoringContext(profile, ['WR']), false);
  const withQb = scoringContext(profile, ['QB']);
  assert.equal(withQb.superflex, true);
  assert.equal(withQb.passing.touchdown, 6);
});

test('positional shape counts only positions a starting slot can use', () => {
  const shape = positionalShape({
    playerIds: ['qbA', 'wrA1', 'rbB'],
    startingSlots: ['QB', 'WR', 'FLEX'],
    players,
    valueOf: () => null,
  });
  assert.deepEqual(shape.byPosition, {
    QB: { rostered: 1, dedicatedSlots: 1 },
    WR: { rostered: 1, dedicatedSlots: 1 },
    RB: { rostered: 1, dedicatedSlots: 0 },
    TE: { rostered: 0, dedicatedSlots: 0 },
  });
  assert.deepEqual(shape.flexSlots, ['FLEX']);
});

/* ------------------------------------------------------------ pipeline */

test('readTransactions grades a week from the raw bundles already on disk', () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const bundle = (week, matchups, transactions = []) => store.saveRaw('2026', week, { week, matchups, transactions });
  bundle(1, preTradeRosters(1), [claim('c1', 1, 3, 'wrB3', 30, 9)]);
  bundle(2, preTradeRosters(3));
  bundle(3, week3AfterTrade, [rawTrade, claim('c2', 3, 3, 'teWire', 22, 23)]);
  bundle(4, week4);

  const read = readTransactions({
    store,
    league: league(),
    teams,
    players,
    describePlayer,
    week: 3,
    throughWeek: 4,
  });

  assert.deepEqual(
    read.map((t) => t.id),
    ['trade-1', 'c2'],
  );
  assert.deepEqual(sideOf(read[0], 2).roster.received, [{ id: 'wrDJ', startsAfter: null }]);
  assert.deepEqual(
    read[0].playerHistory.find((p) => p.id === 'wrDJ').weeks.map((w) => w.week),
    [1, 2, 3, 4],
  );
  // 100 − 30 in week 1 − 22 now.
  assert.equal(read[1].sides[0].faab.remainingAfter, 48);
});
