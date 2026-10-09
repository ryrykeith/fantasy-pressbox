import test from 'node:test';
import assert from 'node:assert/strict';

import { weekBids } from '../src/analysis/faab.mjs';
import { enrichTransactions } from '../src/analysis/transactions.mjs';
import { deriveScoringProfile, normalizeTransactions, normalizeWeekRosters } from '../src/sleeper/normalize.mjs';
import { TASKS, TRANSACTION_TASKS, buildContext, buildPrompt, describePlayer, taskPromptOnly } from '../src/promptContext.mjs';

/**
 * The waiver report: a week 3 in which one team paid $22 for a tight end it
 * had no one to start at, against a $7 rival bid, while another swapped a
 * starting back for a free-agent receiver. Judged on the acquiring roster's
 * shape and the scoring profile, never on a player's general standing.
 */

const STARTING_SLOTS = ['QB', 'WR', 'WR', 'TE', 'FLEX'];

const players = {
  qbA: { full_name: 'Quarterback A', position: 'QB', team: 'BUF' },
  wrA1: { full_name: 'Receiver A1', position: 'WR', team: 'MIA' },
  wrA2: { full_name: 'Receiver A2', position: 'WR', team: 'CIN' },
  teA: { full_name: 'Tight End A', position: 'TE', team: 'LV' },
  rbCut: { full_name: 'Cut Back', position: 'RB', team: 'NE' },
  wrFA: { full_name: 'Free Receiver', position: 'WR', team: 'DAL' },
  qbC: { full_name: 'Quarterback C', position: 'QB', team: 'KC' },
  wrC1: { full_name: 'Receiver C1', position: 'WR', team: 'LAR' },
  wrC2: { full_name: 'Receiver C2', position: 'WR', team: 'DET' },
  rbC: { full_name: 'Back C', position: 'RB', team: 'SF' },
  teWire: { full_name: 'Wire Tight End', position: 'TE', team: 'NYG' },
  qbB: { full_name: 'Quarterback B', position: 'QB', team: 'GB' },
  wrB1: { full_name: 'Receiver B1', position: 'WR', team: 'MIN' },
  wrB2: { full_name: 'Receiver B2', position: 'WR', team: 'SEA' },
  teB: { full_name: 'Tight End B', position: 'TE', team: 'DEN' },
  rbB: { full_name: 'Back B', position: 'RB', team: 'HOU' },
  wrB3: { full_name: 'Receiver B3', position: 'WR', team: 'PHI' },
};

const team = (rosterId, name, wins, losses, pointsFor, potential) => ({
  rosterId,
  name,
  manager: `${name.toLowerCase().replace(/\s+/g, '')}_mgr`,
  record: { wins, losses, ties: 0 },
  seasonPointsFor: pointsFor,
  seasonPointsAgainst: 300,
  seasonPotentialPoints: potential,
  playerIds: [],
  starterIds: [],
  taxiIds: [],
  reserveIds: [],
});

const teams = [
  team(1, 'Pick Six Appeal', 1, 3, 486.67, 597.05),
  team(2, 'Deep Receivers', 3, 1, 480.1, 590.3),
  team(3, 'Wire Hawks', 2, 2, 410.2, 500.0),
];
const teamsByRosterId = new Map(teams.map((t) => [t.rosterId, t]));

function league(type) {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: STARTING_SLOTS,
    benchSlots: 5,
    taxiSlots: 0,
    playoffTeams: 2,
    playoffWeekStart: 15,
    waiverBudget: 100,
    format: {
      type,
      source: 'declared',
      declaredType: type,
      detectedType: type,
      scoring: deriveScoringProfile({ rec: 0.5, bonus_rec_te: 0.5 }, { startingSlots: STARTING_SLOTS }),
    },
  };
}

const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 'medium',
    ranking_emoji: {},
    output: { sleeper_max_chars: 900, include_emoji: false },
    banned_phrases: ['Only time will tell.'],
    awards: {},
  },
  rankings: { weekly: {} },
};

const entry = (rosterId, points, starters) => ({
  roster_id: rosterId,
  players: Object.keys(points),
  starters,
  players_points: points,
});

const earlyRosters = (week) => [
  entry(1, { qbA: 20, wrA1: 9, wrA2: 8, teA: 6, rbCut: 11 + week }, ['qbA', 'wrA1', 'wrA2', 'teA', 'rbCut']),
  entry(2, { qbB: 18, wrB1: 14, wrB2: 12, teB: 8, rbB: 10 }, ['qbB', 'wrB1', 'wrB2', 'teB', 'rbB']),
  entry(3, { qbC: 17, wrC1: 13, wrC2: 11, rbC: 12 }, ['qbC', 'wrC1', 'wrC2', 'rbC']),
];

const weeks = [
  { week: 1, rosters: normalizeWeekRosters(earlyRosters(1)) },
  { week: 2, rosters: normalizeWeekRosters(earlyRosters(2)) },
  {
    week: 3,
    rosters: normalizeWeekRosters([
      entry(1, { qbA: 21, wrA1: 9, wrA2: 8, teA: 6, wrFA: 7 }, ['qbA', 'wrA1', 'wrA2', 'teA', 'wrFA']),
      entry(2, { qbB: 18, wrB1: 14, wrB2: 12, teB: 8, rbB: 10, wrB3: 4 }, ['qbB', 'wrB1', 'wrB2', 'teB', 'rbB']),
      entry(3, { qbC: 17, wrC1: 13, wrC2: 11, rbC: 12, teWire: 9 }, ['qbC', 'wrC1', 'wrC2', 'teWire', 'rbC']),
    ]),
  },
];

const raw = [
  // Wire Hawks have no tight end and pay $22 for one.
  {
    transaction_id: 'claim-te',
    type: 'waiver',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 30),
    roster_ids: [3],
    adds: { teWire: 3 },
    drops: null,
    settings: { waiver_bid: 22 },
  },
  // Deep Receivers bid $7 for the same tight end and lost.
  {
    transaction_id: 'claim-te-lost',
    type: 'waiver',
    status: 'failed',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 30),
    roster_ids: [2],
    adds: { teWire: 2 },
    drops: null,
    settings: { waiver_bid: 7 },
  },
  {
    transaction_id: 'claim-depth',
    type: 'waiver',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 30, 1),
    roster_ids: [2],
    adds: { wrB3: 2 },
    drops: null,
    settings: { waiver_bid: 3 },
  },
  // Pick Six Appeal drops a starting back for a free receiver.
  {
    transaction_id: 'free-swap',
    type: 'free_agent',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 30, 2),
    roster_ids: [1],
    adds: { wrFA: 1 },
    drops: { rbCut: 1 },
  },
  // A trade is not a pickup and must stay out of this edition.
  {
    transaction_id: 'trade-1',
    type: 'trade',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 30, 3),
    roster_ids: [1, 2],
    adds: { wrB1: 1 },
    drops: { wrB1: 2 },
    draft_picks: [],
    waiver_budget: [],
  },
];

function enriched(l, rawEntries = raw) {
  return enrichTransactions({
    transactions: normalizeTransactions(rawEntries, { teamsByRosterId, players, describePlayer, league: l }),
    league: l,
    teams,
    players,
    weeks,
    market: { bids: weekBids({ transactions: rawEntries, week: 3, players, teamsByRosterId }), releasedPools: [] },
  });
}

function context(type, { rawEntries = raw } = {}) {
  const l = league(type);
  return buildContext({
    task: 'waiver-report',
    config: CONFIG,
    league: l,
    teams,
    players,
    week: 3,
    transactions: normalizeTransactions(rawEntries, { teamsByRosterId, players, describePlayer, league: l }),
    enrichedTransactions: enriched(l, rawEntries),
  });
}

const field = (ctx, name) => ctx.unavailable.find((item) => item.field === name);
const pickup = (ctx, name) => ctx.pickups.find((item) => item.team === name);

test('waiver-report is a registered transaction edition', () => {
  assert.ok(TASKS.includes('waiver-report'));
  assert.ok(TRANSACTION_TASKS.includes('waiver-report'));
});

test('every completed pickup is in the context, and no trade is', () => {
  const ctx = context('dynasty');
  assert.deepEqual(ctx.pickups.map((p) => p.team).sort(), ['Deep Receivers', 'Pick Six Appeal', 'Wire Hawks']);
  assert.equal(ctx.trades, undefined);
  assert.equal(ctx.transactions, undefined, 'the incidental moves are replaced, not repeated');
  assert.equal(ctx.marketValues, undefined, 'trade values are for trade grades; a pickup is judged on roster fit');
});

test('a pickup carries the acquiring roster shape before and after', () => {
  const claim = pickup(context('dynasty'), 'Wire Hawks');
  assert.equal(claim.type, 'waiver');
  assert.equal(claim.added[0].startsAfter, 'TE');
  assert.match(claim.roster.startersBefore.join('|'), /TE EMPTY/);
  assert.doesNotMatch(claim.roster.startersAfter.join('|'), /TE EMPTY/);
  assert.match(claim.roster.depthBefore, /TE 0/);
  assert.match(claim.roster.depthAfter, /TE 1/);
});

test('a depth add to a deep roster would not start', () => {
  const depth = pickup(context('dynasty'), 'Deep Receivers');
  assert.equal(depth.added[0].startsAfter, null);
});

test('a drop says whether the player was starting, and what he did after', () => {
  const swap = pickup(context('dynasty'), 'Pick Six Appeal');
  assert.equal(swap.type, 'free_agent');
  assert.equal(swap.dropped[0].startedBefore, 'FLEX');
  const history = swap.playerHistory.find((item) => item.player.startsWith('Cut Back'));
  assert.ok(history.weeks.length > 0);
});

test('a claim is costed against the budget and set against its rivals', () => {
  const claim = pickup(context('dynasty'), 'Wire Hawks');
  assert.equal(claim.faab.bid, 22);
  assert.equal(claim.faab.shareOfBudget, 0.22);
  assert.equal(claim.market.margin, 15);
  assert.deepEqual(claim.market.rivals, [{ team: 'Deep Receivers', amount: 7 }]);
  assert.ok(claim.market.balances.length > 0);
});

test('a free-agent pickup has no cost and no market', () => {
  const swap = pickup(context('dynasty'), 'Pick Six Appeal');
  assert.equal(swap.faab, undefined);
  assert.equal(swap.market, undefined);
});

test('the scoring rules for the positions that moved travel with the pickup', () => {
  assert.ok(pickup(context('dynasty'), 'Wire Hawks').scoring);
});

test('standing carries a record only where teams play each other', () => {
  assert.ok(pickup(context('dynasty'), 'Wire Hawks').standing.record);
  assert.equal(pickup(context('guillotine'), 'Wire Hawks').standing.record, undefined);
});

test('a claim made before any chop is shown with no chop release', () => {
  assert.equal(pickup(context('guillotine'), 'Wire Hawks').market.chopRelease, null);
});

test('the unavailable list forbids general player standing and recalled production', () => {
  const ctx = context('dynasty');
  assert.match(field(ctx, 'playerQuality').instruction, /not in the context/i);
  assert.ok(field(ctx, 'projections'));
  assert.ok(field(ctx, 'managerMotives'));
  assert.equal(field(ctx, 'marketValues'), undefined);
});

test('a week with no pickups builds no pickups and no prompt', () => {
  const tradeOnly = raw.filter((item) => item.type === 'trade');
  const ctx = context('dynasty', { rawEntries: tradeOnly });
  assert.equal(ctx.pickups, undefined);
  assert.throws(() => buildPrompt({ task: 'waiver-report', context: ctx }), /no completed waiver or free-agent move/);
});

test('the guillotine prompt ties FAAB to survival; the other formats never mention a chop', () => {
  const guillotine = taskPromptOnly('waiver-report', 'guillotine');
  assert.match(guillotine, /later chops/i);
  assert.match(guillotine, /weekly floor/i);
  for (const type of ['dynasty', 'redraft']) {
    assert.doesNotMatch(taskPromptOnly('waiver-report', type), /chop/i);
  }
});

test('the prompt names the three verdicts and requires every number as written', () => {
  const text = taskPromptOnly('waiver-report', 'dynasty');
  assert.match(text, /best value/i);
  assert.match(text, /overpay/i);
  assert.match(text, /regret/i);
  assert.match(text, /exactly as written/i);
});

test('a built prompt carries the pickups', () => {
  const prompt = buildPrompt({ task: 'waiver-report', context: context('redraft') });
  assert.match(prompt, /Wire Tight End/);
});
