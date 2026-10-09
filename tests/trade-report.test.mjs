import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { marketValueQuery, normalizeMarketValues } from '../src/fantasycalc/client.mjs';
import { currentSeeds } from '../src/analysis/standings.mjs';
import { enrichTransactions } from '../src/analysis/transactions.mjs';
import { deriveScoringProfile, normalizeTransactions, normalizeWeekRosters } from '../src/sleeper/normalize.mjs';
import { TASKS, buildContext, buildPrompt, describePlayer } from '../src/promptContext.mjs';
import { readMarketValues } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { checkPosts } from '../src/validate.mjs';

/**
 * The trade report: a DJ Moore-shaped week 3 trade — a receiver and a 2027
 * 2nd one way, a 2027 1st the other — graded against a FantasyCalc snapshot.
 */

const STARTING_SLOTS = ['QB', 'WR', 'WR', 'TE', 'SUPER_FLEX'];

const players = {
  qbA: { full_name: 'Quarterback A', position: 'QB', team: 'BUF' },
  qbB: { full_name: 'Quarterback B', position: 'QB', team: 'KC' },
  wrDJ: { full_name: 'DJ Moore', position: 'WR', team: 'BUF', age: 29, injury_status: 'Questionable' },
  wrA1: { full_name: 'Receiver A1', position: 'WR', team: 'MIA' },
  teA: { full_name: 'Tight End A', position: 'TE', team: 'LV' },
  wrB1: { full_name: 'Receiver B1', position: 'WR', team: 'CIN' },
  teB: { full_name: 'Tight End B', position: 'TE', team: 'DET' },
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
  team(1, 'Rebuild Szn', 1, 3, 486.67, 597.05),
  team(2, 'Taco Tuesday', 3, 1, 480.1, 590.3),
  team(3, 'Bystanders', 3, 1, 510.2, 600.0),
];
const teamsByRosterId = new Map(teams.map((t) => [t.rosterId, t]));

function league(type = 'dynasty', scoring = { rec: 0.5, bonus_rec_te: 0.5 }) {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: STARTING_SLOTS,
    benchSlots: 5,
    taxiSlots: type === 'dynasty' ? 3 : 0,
    playoffTeams: 2,
    playoffWeekStart: 15,
    waiverBudget: 100,
    format: {
      type,
      source: 'declared',
      declaredType: type,
      detectedType: type,
      scoring: deriveScoringProfile(scoring, { startingSlots: STARTING_SLOTS }),
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

const weeks = [
  { week: 1, rosters: normalizeWeekRosters([entry(1, { qbA: 20, wrDJ: 18.5, wrA1: 8, teA: 6 }, ['qbA', 'wrDJ', 'wrA1', 'teA']), entry(2, { qbB: 18, wrB1: 20, teB: 9 }, ['qbB', 'wrB1', 'teB'])]) },
  { week: 2, rosters: normalizeWeekRosters([entry(1, { qbA: 22, wrDJ: -0.1, wrA1: 9, teA: 5 }, ['qbA', 'wrDJ', 'wrA1', 'teA']), entry(2, { qbB: 17, wrB1: 15, teB: 7 }, ['qbB', 'wrB1', 'teB'])]) },
  { week: 3, rosters: normalizeWeekRosters([entry(1, { qbA: 21, wrA1: 9, teA: 6 }, ['qbA', 'wrA1', 'teA']), entry(2, { qbB: 19, wrB1: 14, teB: 8, wrDJ: 9.7 }, ['qbB', 'wrB1', 'teB', 'wrDJ'])]) },
];

const rawTrade = {
  transaction_id: 'trade-dj',
  type: 'trade',
  status: 'complete',
  leg: 3,
  status_updated: Date.UTC(2026, 8, 30, 2, 21),
  roster_ids: [1, 2],
  adds: { wrDJ: 2 },
  drops: { wrDJ: 1 },
  draft_picks: [
    { season: '2027', round: 1, roster_id: 2, owner_id: 1, previous_owner_id: 2 },
    { season: '2027', round: 2, roster_id: 1, owner_id: 2, previous_owner_id: 1 },
  ],
  waiver_budget: [],
};

const rawWaiver = {
  transaction_id: 'claim-1',
  type: 'waiver',
  status: 'complete',
  leg: 3,
  status_updated: Date.UTC(2026, 8, 29),
  roster_ids: [3],
  adds: { teB2: 3 },
  drops: null,
  settings: { waiver_bid: 5 },
};

function enriched(l = league()) {
  return enrichTransactions({
    transactions: normalizeTransactions([rawTrade, rawWaiver], { teamsByRosterId, players, describePlayer, league: l }),
    league: l,
    teams,
    players,
    weeks,
  });
}

// FantasyCalc's own shape, trimmed to the fields this project reads.
const FANTASYCALC = [
  { player: { name: 'DJ Moore', position: 'WR', sleeperId: 'wrDJ', maybeAge: 29.43 }, value: 2097, overallRank: 100, positionRank: 37 },
  { player: { name: 'Nobody Sleeper Knows', position: 'WR', sleeperId: null }, value: 50, overallRank: 400, positionRank: 150 },
  { player: { name: '2027 1st (Early)', position: 'PICK' }, value: 5128, overallRank: 20, positionRank: 1 },
  { player: { name: '2027 1st (Mid)', position: 'PICK' }, value: 3377, overallRank: 40, positionRank: 2 },
  { player: { name: '2027 1st', position: 'PICK' }, value: 3116, overallRank: 45, positionRank: 3 },
  { player: { name: '2027 1st (Late)', position: 'PICK' }, value: 2594, overallRank: 60, positionRank: 4 },
  { player: { name: '2027 2nd', position: 'PICK' }, value: 1500, overallRank: 120, positionRank: 9 },
  { player: { name: '2026 Pick 1.05', position: 'PICK' }, value: 4000, overallRank: 30, positionRank: 5 },
];

const marketSnapshot = (l = league()) => {
  const query = marketValueQuery({ format: l.format, teamCount: 12 });
  return {
    source: 'FantasyCalc',
    label: query.label,
    fetchedAt: '2026-10-08T23:17:05.924Z',
    week: 3,
    params: query.params,
    caveats: query.caveats,
    ...normalizeMarketValues(FANTASYCALC),
  };
};

function context({ l = league(), marketValues = marketSnapshot(l), transactions = enriched(l) } = {}) {
  return buildContext({
    task: 'trade-report',
    config: CONFIG,
    league: l,
    teams,
    players,
    week: 3,
    transactions: normalizeTransactions([rawTrade], { teamsByRosterId, players, describePlayer, league: l }),
    enrichedTransactions: transactions,
    marketValues,
  });
}

const field = (ctx, name) => ctx.unavailable.find((entry) => entry.field === name);
const side = (ctx, name) => ctx.trades[0].sides.find((s) => s.team === name);

/* ------------------------------------------------------------ FantasyCalc */

test('the market query is built from the resolved format and scoring profile', () => {
  const query = marketValueQuery({ format: league().format, teamCount: 12 });
  assert.deepEqual(query.params, { isDynasty: true, numQbs: 2, numTeams: 12, ppr: 0.5 });
  assert.equal(
    query.url,
    'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5',
  );
  assert.equal(query.label, 'dynasty, superflex, 12 teams, half-PPR');

  const redraft = marketValueQuery({ format: league('redraft', { rec: 1 }).format, teamCount: 10 });
  assert.deepEqual(redraft.params, { isDynasty: false, numQbs: 2, numTeams: 10, ppr: 1 });
});

test('a TE premium, which FantasyCalc cannot price, is stated as a caveat', () => {
  const premium = marketValueQuery({ format: league().format, teamCount: 12 });
  assert.deepEqual(premium.caveats.map((c) => c.factor), ['tightEndPremium']);
  const plain = marketValueQuery({ format: league('dynasty', { rec: 0.5 }).format, teamCount: 12 });
  assert.deepEqual(plain.caveats, []);
});

test('reception scoring FantasyCalc does not price is rounded and said so', () => {
  const query = marketValueQuery({ format: league('dynasty', { rec: 0.8 }).format, teamCount: 12 });
  assert.equal(query.params.ppr, 1);
  assert.match(query.caveats[0].why, /pays 0\.8 per reception/);
});

test('market entries are keyed by Sleeper id, and picks by season and round with their tiers', () => {
  const { players: priced, picks } = normalizeMarketValues(FANTASYCALC);
  assert.deepEqual(priced, {
    wrDJ: { name: 'DJ Moore', position: 'WR', value: 2097, overallRank: 100, positionRank: 37, age: 29.4 },
  });
  assert.deepEqual(picks, {
    '2027-1': { season: '2027', round: 1, generic: 3116, tiers: { Early: 5128, Mid: 3377, Late: 2594 } },
    '2027-2': { season: '2027', round: 2, generic: 1500, tiers: {} },
  });
});

/* -------------------------------------------------------------- pipeline */

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok, status, json: async () => body };
  };
  return { impl, calls };
}

test('the market is fetched once per week, saved, and read back on a re-run', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-market-')) });
  const { impl, calls } = fakeFetch(FANTASYCALC);
  const first = await readMarketValues({ store, league: league(), teams, week: 3, fetchImpl: impl });
  assert.equal(first.source, 'FantasyCalc');
  assert.equal(first.players.wrDJ.value, 2097);
  assert.match(first.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);

  const again = await readMarketValues({ store, league: league(), teams, week: 3, fetchImpl: impl });
  assert.deepEqual(again, first);
  assert.equal(calls.length, 1);

  await readMarketValues({ store, league: league(), teams, week: 3, fetchImpl: impl, refresh: true });
  assert.equal(calls.length, 2);
});

test('a failed market fetch is an unavailable result, not a failed edition', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-market-')) });
  const down = fakeFetch(null, { ok: false, status: 503 });
  const result = await readMarketValues({ store, league: league(), teams, week: 3, fetchImpl: down.impl });
  assert.match(result.unavailable, /HTTP 503/);
  assert.equal(store.loadMarketValues('2026', 3), null);

  const offline = async () => {
    throw new TypeError('fetch failed');
  };
  const unreachable = await readMarketValues({ store, league: league(), teams, week: 3, fetchImpl: offline });
  assert.match(unreachable.unavailable, /Could not reach FantasyCalc/);
});

/* ------------------------------------------------------------- standings */

test('current seeds order by wins, then points-for', () => {
  assert.deepEqual([...currentSeeds(teams)], [[3, 1], [2, 2], [1, 3]]);
});

/* --------------------------------------------------------------- context */

test('the trade report is a registered task', () => {
  assert.ok(TASKS.includes('trade-report'));
});

test('only trades are graded, and the incidental transaction colour is not repeated', () => {
  const ctx = context();
  assert.equal(ctx.trades.length, 1);
  assert.equal(ctx.transactions, undefined);
  assert.equal(field(ctx, 'transactions'), undefined);
});

test('each side carries its standing, its players with market values and its roster shape', () => {
  const ctx = context();
  const jd = side(ctx, 'Taco Tuesday');
  assert.deepEqual(jd.standing, {
    team: 'Taco Tuesday',
    record: '3-1',
    currentSeed: 2,
    pointsFor: 480.1,
    maxPointsFor: 590.3,
  });
  assert.deepEqual(jd.received.players, [
    {
      player: 'DJ Moore (WR, BUF, age 29) [Questionable]',
      startsAfter: 'WR',
      market: { value: 2097, overallRank: 100, positionRank: 'WR37', age: 29.4 },
    },
  ]);
  assert.equal(jd.roster.asOfWeek, 3);
  assert.ok(jd.roster.startersAfter.includes('WR DJ Moore 9.2'));
  // SUPER_FLEX makes a running back startable, so an empty RB room is shown.
  assert.equal(jd.roster.depthBefore, 'QB 1, WR 1, TE 1, RB 0');
  assert.equal(jd.roster.depthAfter, 'QB 1, WR 2, TE 1, RB 0');

  const rebuildSzn = side(ctx, 'Rebuild Szn');
  assert.ok(rebuildSzn.roster.startersAfter.includes('WR EMPTY'));
  assert.deepEqual(rebuildSzn.gaveUp.players[0].startedBefore, 'WR');
});

test('a dynasty pick carries its original team\'s facts and market range, never a tier', () => {
  const ctx = context();
  const [pick] = side(ctx, 'Rebuild Szn').received.picks;
  assert.deepEqual(pick, {
    pick: '2027 round 1',
    originalTeam: 'Taco Tuesday',
    originalTeamNow: {
      team: 'Taco Tuesday',
      record: '3-1',
      currentSeed: 2,
      pointsFor: 480.1,
      maxPointsFor: 590.3,
    },
    market: { generic: 3116, tiers: { Early: 5128, Mid: 3377, Late: 2594 } },
  });

  const slot = field(ctx, 'projectedDraftSlot');
  assert.ok(slot, 'a traded pick needs the projectedDraftSlot entry');
  assert.match(slot.instruction, /Do not place any pick in a tier/);
  assert.match(slot.instruction, /do not name a draft slot/);
});

test('each side\'s received total is summed for the model, with picks at their generic value', () => {
  const ctx = context();
  assert.deepEqual(side(ctx, 'Taco Tuesday').receivedMarketTotal, {
    value: 2097 + 1500,
    basis: 'players plus picks at their generic value',
    unpriced: [],
  });
  assert.equal(side(ctx, 'Rebuild Szn').receivedMarketTotal.value, 3116);
});

test('the market is labelled with its source, settings, fetch date and caveats', () => {
  const ctx = context();
  assert.equal(ctx.marketValues.source, 'FantasyCalc');
  assert.equal(ctx.marketValues.settings, 'dynasty, superflex, 12 teams, half-PPR');
  assert.equal(ctx.marketValues.fetchedAt, '2026-10-08T23:17:05.924Z');
  assert.deepEqual(ctx.marketValues.caveats.map((c) => c.factor), ['tightEndPremium']);
  assert.match(field(ctx, 'marketValuesAtTradeTime').why, /2026-10-08T23:17:05.924Z/);
});

test('the prototype\'s unavailable entries are always present', () => {
  const ctx = context();
  for (const name of ['managerMotives', 'projections', 'injuryDetail']) assert.ok(field(ctx, name), name);
});

test('without a market, no value reaches the model and the reason is stated', () => {
  const ctx = context({ marketValues: { unavailable: 'FantasyCalc returned HTTP 503' } });
  assert.equal(ctx.marketValues, undefined);
  const jd = side(ctx, 'Taco Tuesday');
  assert.equal(jd.receivedMarketTotal, undefined);
  assert.equal('market' in jd.received.players[0], false);
  assert.equal('market' in jd.received.picks[0], false);
  const entry = field(ctx, 'marketValues');
  assert.match(entry.why, /HTTP 503/);
  assert.match(entry.instruction, /Do not quote, estimate or recall any trade value/);
  assert.equal(field(ctx, 'marketValuesAtTradeTime'), undefined);
});

test('a redraft trade carries no picks and says picks are not an asset', () => {
  const l = league('redraft');
  const ctx = context({ l });
  for (const s of ctx.trades[0].sides) {
    assert.equal(s.received.picks, undefined);
    assert.equal(s.gaveUp.picks, undefined);
  }
  assert.equal(side(ctx, 'Taco Tuesday').receivedMarketTotal.basis, 'players only');
  assert.equal(field(ctx, 'projectedDraftSlot'), undefined);
  assert.match(field(ctx, 'draftPicks').why, /redraft league/);
});

test('a guillotine trade carries no picks, no record and no seed', () => {
  const l = league('guillotine');
  const ctx = context({ l });
  const jd = side(ctx, 'Taco Tuesday');
  assert.equal(jd.received.picks, undefined);
  assert.deepEqual(jd.standing, { team: 'Taco Tuesday', pointsFor: 480.1, maxPointsFor: 590.3 });
  assert.match(field(ctx, 'draftPicks').why, /eliminated/);
});

/* ---------------------------------------------------------------- prompt */

test('the prompt states the format\'s rule for picks and nothing from the others', () => {
  const dynasty = buildPrompt({ task: 'trade-report', context: context() });
  assert.match(dynasty, /# Trade Report/);
  assert.match(dynasty, /do not\s+put any pick in a tier/);
  assert.doesNotMatch(dynasty, /weekly floor/);

  const redraft = buildPrompt({ task: 'trade-report', context: context({ l: league('redraft') }) });
  assert.match(redraft, /Ignore draft picks\s+entirely/);
  assert.doesNotMatch(redraft, /projectedDraftSlot` entry/);

  const guillotine = buildPrompt({ task: 'trade-report', context: context({ l: league('guillotine') }) });
  assert.match(guillotine, /weekly floor/);
});

test('the prompt allows a trade with no clear winner', () => {
  const prompt = buildPrompt({ task: 'trade-report', context: context() });
  assert.match(prompt, /no clear winner may be called exactly that/);
});

test('a trade report with no trade in it is refused', () => {
  const quiet = context({ transactions: enriched().filter((t) => t.type !== 'trade') });
  assert.equal(quiet.trades, undefined);
  assert.throws(() => buildPrompt({ task: 'trade-report', context: quiet }), /no completed trade/);
});

test('an edition in the requested four-post shape passes the Sleeper length check', () => {
  const max = context().editorial.sleeperMaxChars;
  const edition = [
    'TRADE REPORT • 1/4\n\nTaco Tuesday gets DJ Moore and a 2027 round 2 pick. Rebuild Szn get a 2027 round 1.',
    'TRADE REPORT • 2/4\n\nTACO TUESDAY: B\nDJ Moore fills a receiver slot that was otherwise thin.',
    'TRADE REPORT • 3/4\n\nREBUILD_SZN AND THE BOYS: B-\nA 1-3 team turning a starter into a 1st.',
    'TRADE REPORT • 4/4\n\nVERDICT: even. Where Taco Tuesday finishes decides it.',
  ].join('\n%%%\n');
  const result = checkPosts(edition, { maxChars: max });
  assert.equal(result.count, 4);
  assert.ok(result.allOk);
});
