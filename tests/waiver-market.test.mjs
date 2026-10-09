import test from 'node:test';
import assert from 'node:assert/strict';

import { claimMarket, weekBids } from '../src/analysis/faab.mjs';
import { enrichTransactions } from '../src/analysis/transactions.mjs';
import { normalizeTransactions } from '../src/sleeper/normalize.mjs';
import { describePlayer } from '../src/promptContext.mjs';

/**
 * A pickup is described against its week's market: what rivals bid for the
 * same player, where the price ranks, and what else went for similar money.
 */

const players = {
  wrA: { full_name: 'Receiver A', position: 'WR', team: 'MIA' },
  rbB: { full_name: 'Back B', position: 'RB', team: 'DET' },
  teC: { full_name: 'Tight End C', position: 'TE', team: 'NYG' },
  qbD: { full_name: 'Quarterback D', position: 'QB', team: 'KC' },
  rbE: { full_name: 'Back E', position: 'RB', team: 'NE' },
};

const teams = [
  { rosterId: 1, name: 'Alpha' },
  { rosterId: 2, name: 'Bravo' },
  { rosterId: 3, name: 'Charlie' },
  { rosterId: 4, name: 'Delta' },
];
const teamsByRosterId = new Map(teams.map((t) => [t.rosterId, t]));

const bid = (id, week, rosterId, playerId, amount, status = 'complete') => ({
  transaction_id: id,
  type: 'waiver',
  status,
  leg: week,
  status_updated: Date.UTC(2026, 8, 10 + week),
  roster_ids: [rosterId],
  adds: { [playerId]: rosterId },
  drops: null,
  settings: { waiver_bid: amount },
});

// Week 3: WR A won by Alpha for 25 over Bravo's 20 and Charlie's 12; RB B won
// by Delta for 24; TE C won by Bravo for 3; a QB was bid on and lost.
const week3 = [
  bid('a', 3, 1, 'wrA', 25),
  bid('b', 3, 2, 'wrA', 20, 'failed'),
  bid('c', 3, 3, 'wrA', 12, 'failed'),
  bid('d', 3, 4, 'rbB', 24),
  bid('e', 3, 2, 'teC', 3),
  bid('f', 3, 3, 'qbD', 6, 'failed'),
  bid('g', 2, 1, 'rbE', 40), // another week: not part of this market
  { transaction_id: 'h', type: 'free_agent', status: 'complete', leg: 3, adds: { rbE: 1 }, settings: {} },
];

const bids = () => weekBids({ transactions: week3, week: 3, players, teamsByRosterId });
const winner = (id) => bids().find((entry) => entry.transactionId === id);

test('weekBids reads won and lost bids for that week only, dearest first', () => {
  assert.deepEqual(
    bids().map((b) => [b.transactionId, b.outcome, b.amount]),
    [
      ['a', 'won', 25],
      ['d', 'won', 24],
      ['b', 'lost', 20],
      ['c', 'lost', 12],
      ['f', 'lost', 6],
      ['e', 'won', 3],
    ],
  );
  assert.deepEqual(
    [winner('a').player, winner('a').position, winner('a').team],
    ['Receiver A', 'WR', 'Alpha'],
  );
});

test('a contested claim reports its rivals, its margin and its rank among winners', () => {
  const market = claimMarket({ bid: winner('a'), bids: bids() });
  assert.deepEqual(market.rivals, [
    { team: 'Bravo', amount: 20 },
    { team: 'Charlie', amount: 12 },
  ]);
  assert.equal(market.margin, 5);
  assert.equal(market.rankAmongWinners, 1);
  assert.equal(market.weekWinningBids, 3);
  assert.equal(market.shareOfWeekSpend, 0.481);
});

test('similar money is every other bid in range, won or lost, and never the claim itself', () => {
  const market = claimMarket({ bid: winner('a'), bids: bids() });
  // 25 ± max(2, 6.25): Delta's 24 for Back B and Bravo's 20 on the same player.
  assert.deepEqual(
    market.similarSpend.map((s) => [s.player, s.team, s.amount, s.outcome]),
    [
      ['Back B', 'Delta', 24, 'won'],
      ['Receiver A', 'Bravo', 20, 'lost'],
    ],
  );
});

test('a small bid uses the dollar window, not a percentage of nothing', () => {
  const market = claimMarket({ bid: winner('e'), bids: bids() });
  // 3 ± 2 reaches the QB's lost 6? No: |6 − 3| = 3 > 2. Nothing is similar.
  assert.deepEqual(market.similarSpend, []);
  assert.equal(market.rankAmongWinners, 3);
});

test('an uncontested claim has no margin rather than a made-up one', () => {
  const market = claimMarket({ bid: winner('d'), bids: bids() });
  assert.deepEqual(market.rivals, []);
  assert.equal(market.margin, null);
});

test('a player a chop released is named with the week and team that released him', () => {
  const releasedPools = [{ week: 2, team: 'Echo', playerIds: ['rbB', 'rbE'] }];
  assert.deepEqual(claimMarket({ bid: winner('d'), bids: bids(), releasedPools }).chopRelease, {
    week: 2,
    team: 'Echo',
  });
  assert.equal(claimMarket({ bid: winner('a'), bids: bids(), releasedPools }).chopRelease, null);
});

/* --------------------------------------------------- on enriched claims */

function enrich({ market, waiverBudget = 100 }) {
  const league = { startingSlots: [], waiverBudget, format: {} };
  return enrichTransactions({
    transactions: normalizeTransactions(week3, { teamsByRosterId, players, describePlayer, league }).filter(
      (t) => t.week === 3,
    ),
    league,
    teams,
    players,
    market,
  });
}

const claimOf = (enriched, id) => enriched.find((t) => t.id === id).sides[0];

test('an enriched claim carries its market and every team\'s FAAB as of that claim', () => {
  const enriched = enrich({ market: { bids: bids(), releasedPools: [] } });
  const { market, faab } = claimOf(enriched, 'a');
  assert.equal(market.margin, 5);
  assert.equal(faab.bid, 25);
  // Alpha paid 25 in week 3 (the week 2 claim is not in this season list).
  assert.deepEqual(market.balances.find((b) => b.team === 'Alpha'), { rosterId: 1, team: 'Alpha', remaining: 75 });
  // Delta's claim clears later in the week; at Alpha's claim Delta still holds it all.
  assert.equal(market.balances.find((b) => b.team === 'Delta').remaining, 100);
});

test('a claim made without a market is unchanged', () => {
  const enriched = enrich({ market: null });
  assert.equal('market' in claimOf(enriched, 'a'), false);
  assert.equal(claimOf(enriched, 'a').faab.bid, 25);
});

test('a league with no budget reports no balances', () => {
  const enriched = enrich({ market: { bids: bids() }, waiverBudget: null });
  assert.ok(claimOf(enriched, 'a').market.balances.every((b) => b.remaining === null));
});
