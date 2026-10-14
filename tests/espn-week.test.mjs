import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enrichTransactions } from '../src/analysis/transactions.mjs';
import { analyzeWeek } from '../src/analysis/week.mjs';
import { createClient } from '../src/espn/client.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import {
  normalizeLeague,
  normalizePlayer,
  normalizePlayers,
  normalizeTeams,
  normalizeWeek,
  withRosteredPlayers,
} from '../src/espn/normalize.mjs';
import { EspnShapeError } from '../src/espn/shape.mjs';
import { captureWeek } from '../src/pipeline.mjs';
import { buildContext } from '../src/promptContext.mjs';
import { getProvider } from '../src/providers.mjs';
import { normalizeBids as sleeperBids, normalizeTransactions as sleeperTransactions } from '../src/sleeper/normalize.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  FIXTURE_WEEK,
  LEAGUE_BY_ID,
  MULTI_WEEK_LEAGUE_ID,
  PLAYERS_WL,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  SCORED_WEEK,
} from './fixtures/mock-espn-league.mjs';

// Everything here runs on the invented fixtures (tests/fixtures/mock-espn-league.mjs).
// Their shapes are guesses from docs/espn-data.md; nothing is a real league.

const { playerId, weekPoints, starterTotal, pairs } = FIXTURE_WEEK;
const views = (id = PUBLIC_LEAGUE_ID) => structuredClone(LEAGUE_BY_ID[id].league.views);

/** The League, Teams and player dictionary for a fixture league, as openLeague builds them. */
function opened(id = PUBLIC_LEAGUE_ID) {
  const v = views(id);
  return {
    league: normalizeLeague({ mSettings: v.mSettings, mDraftDetail: v.mDraftDetail }, { leagueId: id }),
    teams: normalizeTeams({ mTeam: v.mTeam, mRoster: v.mRoster, mSettings: v.mSettings }),
    players: normalizePlayers(PLAYERS_WL),
  };
}

/** A saved week bundle, as fetchWeek makes it: the week views with settings, and the transactions. */
function bundle(id = PUBLIC_LEAGUE_ID) {
  const v = views(id);
  return {
    provider: 'espn',
    week: SCORED_WEEK,
    matchups: { ...v.mMatchupWeek4, settings: v.mSettings.settings },
    transactions: v.mTransactions2,
  };
}

const weekOf = (id = PUBLIC_LEAGUE_ID, raw = bundle(id), extra = {}) => normalizeWeek(raw, { ...opened(id), ...extra });
const analyze = (weekData, id = PUBLIC_LEAGUE_ID) => {
  const { league, teams, players } = opened(id);
  return analyzeWeek({ league, teams, players, rosters: weekData.rosters, week: weekData.week });
};
const round2 = (n) => Number(n.toFixed(2));

// --- Rosters -------------------------------------------------------------------

test('each matchup side is a WeekData roster, starters lined up with the starting slots', () => {
  const { league } = opened();
  const week = weekOf();
  assert.equal(week.week, SCORED_WEEK);
  assert.equal(week.rosters.length, 12);
  assert.ok(!('multiWeekMatchup' in week));

  const first = week.rosters[0];
  assert.equal(first.rosterId, 1);
  // Roles: QB, RB1, RB2 (flex), WR1, TE, K, DEF, then two bench. Slots: QB RB WR TE DEF K FLEX.
  const id = (role) => String(playerId(0, role));
  assert.deepEqual(league.startingSlots, ['QB', 'RB', 'WR', 'TE', 'DEF', 'K', 'FLEX']);
  assert.deepEqual(first.starterIds, [id(0), id(1), id(3), id(4), id(6), id(5), id(2)]);
  assert.deepEqual(first.playerIds, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(id));
  assert.deepEqual(first.starterPoints, [0, 1, 3, 4, 6, 5, 2].map((r) => weekPoints(0, r)));
  assert.equal(first.playerPoints[id(7)], 21.4);
  assert.equal(first.points, starterTotal(0));
  assert.deepEqual(first.noPointsIds, []);
  assert.deepEqual(first.byeIds, []);
});

test('the two sides of a matchup share a pairing key; a side with no away team has none', () => {
  const week = weekOf();
  const keyOf = (rosterId) => week.rosters.find((r) => r.rosterId === rosterId).pairingKey;
  for (const [home, away] of pairs) assert.equal(keyOf(home + 1), keyOf(away + 1));
  assert.equal(new Set(week.rosters.map((r) => r.pairingKey)).size, 6);

  const raw = bundle();
  delete raw.matchups.schedule[0].away;
  const bye = weekOf(PUBLIC_LEAGUE_ID, raw);
  assert.equal(bye.rosters.length, 11);
  assert.equal(bye.rosters[0].pairingKey, null);
});

test('a bundle that does not match its documented shape is refused, not guessed', () => {
  const raw = bundle();
  delete raw.matchups.schedule[0].home.totalPoints;
  assert.throws(() => weekOf(PUBLIC_LEAGUE_ID, raw), EspnShapeError);
});

test('a whole-season schedule needs lineups only in the requested matchup period', () => {
  const other = (periodId) =>
    structuredClone(views().mMatchup.schedule).map((m) => ({ ...m, matchupPeriodId: periodId }));
  const expected = weekOf();

  const season = bundle();
  assert.ok(season.matchups.schedule.every((m) => m.matchupPeriodId === SCORED_WEEK));
  season.matchups.schedule = [...other(SCORED_WEEK - 1), ...season.matchups.schedule, ...other(SCORED_WEEK + 1)];
  for (const m of season.matchups.schedule.filter((e) => e.matchupPeriodId !== SCORED_WEEK)) {
    for (const side of [m.home, m.away]) if (side) delete side.rosterForCurrentScoringPeriod;
  }
  assert.deepEqual(weekOf(PUBLIC_LEAGUE_ID, season), expected);

  // An entry in the requested period with no lineup is still refused, naming the path.
  const broken = bundle();
  delete broken.matchups.schedule[1].away.rosterForCurrentScoringPeriod;
  broken.matchups.schedule.push(...other(SCORED_WEEK + 1));
  assert.throws(
    () => weekOf(PUBLIC_LEAGUE_ID, broken),
    (e) => e instanceof EspnShapeError && /schedule\[1\]\.away\.rosterForCurrentScoringPeriod/.test(e.message),
  );
});

// --- analyzeWeek on ESPN ------------------------------------------------------

test('analyzeWeek on the ESPN fixture: games, winners, lineup efficiency and awards', () => {
  const analysis = analyze(weekOf());
  assert.equal(analysis.games.length, 6);
  assert.deepEqual(analysis.unpairedRosterIds, []);

  const { teams } = opened();
  const nameOf = (index) => teams[index].name;
  for (const [home, away] of pairs) {
    const game = analysis.games.find((g) => g.teams.some((t) => t.team === nameOf(home)));
    const [h, a] = [starterTotal(home), starterTotal(away)];
    assert.equal(game.winner, h > a ? nameOf(home) : nameOf(away));
    assert.equal(game.margin, round2(Math.abs(h - a)));
  }

  // Bye Week Blues: the bench receiver's 21.4 belongs at WR, and RB1 in the flex.
  // Optimal: QB 12.8 + RB2 16.8 + BWR 21.4 + TE 13.5 + DEF 11.2 + K 6.7 + RB1 12.3 = 94.7.
  const blues = analysis.teamWeeks.find((t) => t.rosterId === 1);
  assert.equal(blues.points, 85.3);
  assert.equal(blues.potentialPoints, 94.7);
  assert.equal(blues.lineupEfficiency, 90.1);
  assert.ok(!('pointsUnreported' in blues));

  const totals = pairs.flat().map((i) => ({ team: nameOf(i), points: starterTotal(i) }));
  const top = totals.reduce((a, b) => (b.points > a.points ? b : a));
  const low = totals.reduce((a, b) => (b.points < a.points ? b : a));
  assert.deepEqual(analysis.awards.teamOfTheWeek, { team: top.team, points: top.points });
  assert.deepEqual(analysis.awards.lowestScore, { team: low.team, points: low.points });
  assert.ok(analysis.awards.biggestBlowout);
  assert.ok(analysis.awards.managerOfTheWeek);
  assert.equal(analysis.awards.benchPain.points, 21.4);
  assert.equal(analysis.awards.benchPain.team, nameOf(0));
});

// --- A player with no points entry --------------------------------------------

/** Removes a team-0 player's actual-points entry for the week, and returns his NFL team. */
function withoutPoints(raw, role) {
  const entry = raw.matchups.schedule[0].home.rosterForCurrentScoringPeriod.entries.find(
    (e) => e.playerPoolEntry.player.id === playerId(0, role),
  );
  const player = entry.playerPoolEntry.player;
  player.stats = player.stats.filter((s) => s.statSourceId !== 0);
  return normalizePlayer(player).team;
}

test('a starter on his bye has no points value, is flagged onBye and counts 0 for the optimal lineup', () => {
  const raw = bundle();
  const team = withoutPoints(raw, 0); // the QB
  // ESPN's team total, which is never recomputed from players: here without the QB.
  raw.matchups.schedule[0].home.totalPoints = 72.5;
  const week = weekOf(PUBLIC_LEAGUE_ID, raw, { byeWeeks: new Map([[team, SCORED_WEEK]]) });

  const roster = week.rosters[0];
  const qb = String(playerId(0, 0));
  assert.ok(!(qb in roster.playerPoints));
  assert.equal(roster.starterPoints[0], null);
  assert.deepEqual(roster.noPointsIds, [qb]);
  assert.deepEqual(roster.byeIds, [qb]);
  assert.equal(roster.points, 72.5);

  const blues = analyze(week).teamWeeks.find((t) => t.rosterId === 1);
  assert.equal(blues.points, 72.5);
  assert.equal(blues.starters[0].points, null);
  assert.equal(blues.starters[0].onBye, true);
  // 94.7 without the QB's 12.8: nobody else can play QB.
  assert.equal(blues.potentialPoints, 81.9);
  assert.equal(blues.lineupEfficiency, 88.5);
  assert.equal(blues.optimalLineup[0].points, 0);
  assert.deepEqual(blues.pointsUnreported, [
    { name: 'Quill Aldermere', position: 'QB', nflTeam: team, started: true, onBye: true },
  ]);
});

test('a bench player on his bye counts 0 for the optimal lineup and is no bench highlight', () => {
  const raw = bundle();
  const team = withoutPoints(raw, 7); // the bench receiver who scored 21.4
  const week = weekOf(PUBLIC_LEAGUE_ID, raw, { byeWeeks: () => new Map([[team, SCORED_WEEK]]) });
  const bwr = String(playerId(0, 7));
  assert.deepEqual(week.rosters[0].byeIds, [bwr]);

  const blues = analyze(week).teamWeeks.find((t) => t.rosterId === 1);
  assert.equal(blues.points, 85.3);
  // WR1 12 at WR, RB1 12.3 in the flex: the lineup as fielded.
  assert.equal(blues.potentialPoints, 85.3);
  assert.equal(blues.lineupEfficiency, 100);
  assert.ok(blues.benchHighlights.every((b) => b.name !== 'Marlow Aldermere'));
  assert.deepEqual(blues.pointsUnreported, [
    { name: 'Marlow Aldermere', position: 'WR', nflTeam: team, started: false, onBye: true },
  ]);
});

test('a starter with no points who was not on a bye leaves his team\'s lineup efficiency unavailable', () => {
  const raw = bundle();
  const team = withoutPoints(raw, 1); // RB1
  const week = weekOf(PUBLIC_LEAGUE_ID, raw, { byeWeeks: new Map([[team, 9]]) });
  assert.deepEqual(week.rosters[0].byeIds, []);
  assert.deepEqual(week.rosters[0].noPointsIds, [String(playerId(0, 1))]);

  const analysis = analyze(week);
  const blues = analysis.teamWeeks.find((t) => t.rosterId === 1);
  // The team score is still ESPN's.
  assert.equal(blues.points, starterTotal(0));
  assert.equal(blues.starters[1].points, null);
  assert.ok(!('onBye' in blues.starters[1]));
  for (const key of ['potentialPoints', 'lineupEfficiency', 'optimalLineup']) assert.ok(!(key in blues), key);
  assert.deepEqual(blues.pointsUnreported, [
    { name: 'Brindle Aldermere', position: 'RB', nflTeam: team, started: true },
  ]);
  // Not a candidate for an efficiency award, and his null is in no comparison.
  assert.notEqual(analysis.awards.managerOfTheWeek.team, blues.team);
  assert.notEqual(analysis.awards.lineupMalpractice.team, blues.team);
  assert.notEqual(analysis.awards.playerOfTheWeek.points, null);
});

test('a recap context builds when a team\'s lineup efficiency is unavailable, and never prints a null score', () => {
  const raw = bundle();
  const rb1Team = withoutPoints(raw, 1); // RB1: no points, not on a bye
  const qbTeam = withoutPoints(raw, 0); // QB: no points, on his bye
  const week = weekOf(PUBLIC_LEAGUE_ID, raw, { byeWeeks: new Map([[rb1Team, 9], [qbTeam, SCORED_WEEK]]) });
  const { league, teams, players } = opened();
  const config = {
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {},
    },
    rankings: { weights: { redraft: { starting_lineup: 1 } }, weekly: {} },
  };
  const context = buildContext({ task: 'recap', config, league, teams, players, week: SCORED_WEEK, weekAnalysis: analyze(week) });
  const blues = context.thisWeek.games.flatMap((g) => g.teams).find((t) => t.team === teams[0].name);
  assert.ok(!('bestPossibleLineup' in blues));
  // Undefined, so the prompt's JSON carries no such field.
  assert.equal(blues.lineupEfficiency, undefined);
  assert.ok(!('lineupEfficiency' in JSON.parse(JSON.stringify(blues))));
  assert.ok(blues.starters[0].endsWith('on bye, no points'), blues.starters[0]);
  assert.ok(blues.starters[1].endsWith('no points reported'), blues.starters[1]);
  assert.ok(!JSON.stringify(blues).includes('null'));
});

test('a player with no points is never given 0 by default, even with no bye table', () => {
  const raw = bundle();
  withoutPoints(raw, 1);
  const week = weekOf(PUBLIC_LEAGUE_ID, raw);
  assert.equal(week.rosters[0].starterPoints[1], null);
  assert.deepEqual(week.rosters[0].byeIds, []);
  assert.ok(!('lineupEfficiency' in analyze(week).teamWeeks.find((t) => t.rosterId === 1)));
});

test('the bye table is read only when a player has no points', () => {
  let reads = 0;
  weekOf(PUBLIC_LEAGUE_ID, bundle(), { byeWeeks: () => { reads += 1; return new Map(); } });
  assert.equal(reads, 0);
});

// --- Transactions -------------------------------------------------------------

const { league: faabLeague, teams, players } = opened();
const id = (team, role) => String(playerId(team, role));
const contested = String(playerId(11, 0) + 1000);

/** The Sleeper raw transactions that say what the fixture's ESPN week-4 transactions say. */
const SLEEPER_EQUIVALENTS = [
  {
    transaction_id: 'fixture-txn-trade', type: 'trade', status: 'complete', leg: 4, status_updated: 1790007200000,
    roster_ids: [11, 7], adds: { [id(10, 1)]: 7, [id(6, 3)]: 11 }, drops: { [id(10, 1)]: 11, [id(6, 3)]: 7 },
  },
  {
    transaction_id: 'fixture-txn-claim-won', type: 'waiver', status: 'complete', leg: 4, status_updated: 1790010000000,
    roster_ids: [3], adds: { [contested]: 3 }, drops: { [id(2, 8)]: 3 }, settings: { waiver_bid: 12 },
  },
  {
    transaction_id: 'fixture-txn-claim-lost', type: 'waiver', status: 'failed', leg: 4, status_updated: 1790010000000,
    roster_ids: [9], adds: { [contested]: 9 }, settings: { waiver_bid: 8 },
  },
  {
    transaction_id: 'fixture-txn-free-agent', type: 'free_agent', status: 'complete', leg: 4, status_updated: 1790020000000,
    roster_ids: [5], adds: { [String(Number(contested) + 1)]: 5 },
  },
  {
    transaction_id: 'fixture-txn-drop', type: 'free_agent', status: 'complete', leg: 4, status_updated: 1790030000000,
    roster_ids: [12], drops: { [id(11, 8)]: 12 },
  },
];

test('a FAAB claim, a trade, a free-agent add and a drop come out exactly as their Sleeper equivalents', () => {
  const espn = weekOf().transactions;
  const teamsByRosterId = new Map(teams.map((t) => [t.rosterId, t]));
  const sleeper = sleeperTransactions(SLEEPER_EQUIVALENTS, {
    teamsByRosterId,
    players,
    describePlayer: (pid, p) => (p ? `${p.name}` : `Unknown player ${pid}`),
    league: null,
  });
  const line = (pid, p) => (p ? `${p.name}` : `Unknown player ${pid}`);
  const espnSamePrinter = normalizeWeek(bundle(), { league: faabLeague, teams, players, describePlayer: line }).transactions;
  // Sleeper's adds and drops are objects keyed by numeric IDs, which JavaScript
  // orders by number; ESPN's items keep ESPN's order. The lines are the same.
  const sortedMoves = (list) => list.map((t) => ({ ...t, moves: [...t.moves].sort() }));
  assert.deepEqual(sortedMoves(espnSamePrinter), sortedMoves(sleeper));
  assert.deepEqual(espn.map((t) => t.type), ['trade', 'waiver', 'free_agent', 'free_agent']);
  assert.equal(espn[1].sides[0].waiverBid, 12);
});

test('FAAB bids, won and lost, match Sleeper\'s; a failed claim is a lost bid and no move', () => {
  const week = weekOf();
  assert.deepEqual(week.bids, sleeperBids(SLEEPER_EQUIVALENTS));
  assert.ok(!week.transactions.some((t) => t.id === 'fixture-txn-claim-lost'));
});

test('rolling-waiver claims carry no bid, and there are no bids', () => {
  const week = weekOf(ROLLING_LEAGUE_ID);
  const claim = week.transactions.find((t) => t.type === 'waiver');
  assert.equal(claim.bid, null);
  assert.ok(claim.sides.every((side) => !('waiverBid' in side)));
  assert.deepEqual(week.bids, []);

  // Even if a rolling league's response carried a bidAmount, nothing is made of it.
  const raw = bundle(ROLLING_LEAGUE_ID);
  raw.transactions.transactions[1].bidAmount = 5;
  const again = weekOf(ROLLING_LEAGUE_ID, raw);
  assert.equal(again.transactions.find((t) => t.type === 'waiver').bid, null);
  assert.deepEqual(again.bids, []);
});

test('a trade ESPN sent with no items is kept, its contents unknown, never a trade of nothing', () => {
  const raw = bundle();
  raw.transactions.transactions[0].items = [];
  const trade = weekOf(PUBLIC_LEAGUE_ID, raw).transactions.find((t) => t.type === 'trade');
  assert.equal(trade.contentsUnknown, true);
  assert.deepEqual(trade.rosterIds, [11]);
  assert.deepEqual(trade.moves, []);
  assert.deepEqual(trade.sides, []);
});

test('transactions are filtered on type, not on a guessed status', () => {
  const raw = bundle();
  for (const txn of raw.transactions.transactions) txn.status = 'SOME_UNDOCUMENTED_VALUE';
  raw.transactions.transactions.push({
    id: 'fixture-txn-proposal', type: 'TRADE_PROPOSAL', status: 'PENDING', scoringPeriodId: 4, teamId: 2,
    items: [{ type: 'ADD', playerId: playerId(1, 1), fromTeamId: 2, toTeamId: 4 }],
  });
  const week = weekOf(PUBLIC_LEAGUE_ID, raw);
  assert.deepEqual(week.transactions.map((t) => t.id), weekOf().transactions.map((t) => t.id));
});

// --- Multi-week matchup periods -----------------------------------------------

test('a matchup period over two NFL weeks is marked, and its points are not given to one week', () => {
  const week = weekOf(MULTI_WEEK_LEAGUE_ID);
  assert.deepEqual(week.multiWeekMatchup, { matchupPeriod: 4, weeks: [4, 5] });
  assert.equal(week.rosters.length, 12);
  for (const roster of week.rosters) {
    assert.equal(roster.points, null);
    assert.equal(roster.pairingKey, null);
  }
  // The week's own player points are still that week's.
  assert.equal(week.rosters[0].playerPoints[String(playerId(0, 7))], 21.4);
});

// --- The provider -------------------------------------------------------------

const fakeClient = (leagueId = PUBLIC_LEAGUE_ID, extra = {}) =>
  createClient({ leagueId, season: 2026, dataDir: mkdtempSync(join(tmpdir(), 'pressbox-espn-week-')), fetch: createFakeEspnFetch(), ...extra });

test('the registry hands out the ESPN provider', () => {
  assert.equal(getProvider('espn'), espnProvider);
});

test('openLeague, currentWeek and fetchWeek through a client', async () => {
  const provider = espnProvider.forClient(fakeClient());
  const { league, teams: opened12, players: dict, draftCapital } = await provider.openLeague();
  assert.equal(league.provider, 'espn');
  assert.equal(league.lastScoredWeek, 4);
  assert.equal(opened12.length, 12);
  assert.ok(Object.keys(dict).length > 0);
  assert.equal(draftCapital, null);

  assert.deepEqual(await provider.currentWeek(), { week: 5, source: 'ESPN (current week)' });

  const raw = await provider.fetchWeek(SCORED_WEEK);
  assert.deepEqual(Object.keys(raw), ['fetchedAt', 'leagueId', 'week', 'matchups', 'transactions']);
  assert.equal(raw.leagueId, PUBLIC_LEAGUE_ID);
  const week = provider.normalizeWeek({ ...raw, provider: 'espn' }, { league, teams: opened12, players: dict });
  assert.equal(week.rosters.length, 12);
  assert.equal(week.transactions.length, 4);
});

test('currentWeek falls back to the season endpoint', async () => {
  const provider = espnProvider.forClient(fakeClient());
  assert.deepEqual(await provider.currentWeek({ league: { currentWeek: null } }), { week: 5, source: 'ESPN (current week)' });
});

test('captureWeek saves the ESPN week tagged with its provider, with no cookie in it, and analyzes it', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'pressbox-espn-capture-'));
  try {
    const secrets = { ESPN_S2: FIXTURE_COOKIES.espn_s2, ESPN_SWID: FIXTURE_COOKIES.SWID };
    const provider = espnProvider.forClient(fakeClient(PRIVATE_LEAGUE_ID, { secrets }));
    const ctx = await provider.openLeague();
    const store = createStore({ dataDir });
    const result = await captureWeek({ provider, store, ...ctx, week: SCORED_WEEK });
    assert.equal(result.analysis.games.length, 6);
    assert.equal(result.transactions.length, 4);

    const saved = store.loadRaw('2026', SCORED_WEEK);
    assert.equal(saved.provider, 'espn');
    const text = readFileSync(store.rawPath('2026', SCORED_WEEK), 'utf8');
    for (const value of Object.values(FIXTURE_COOKIES)) assert.ok(!text.includes(value));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('lookupLeague reads a private league with its season and cookies', async (t) => {
  const real = globalThis.fetch;
  globalThis.fetch = createFakeEspnFetch();
  t.after(() => { globalThis.fetch = real; });
  const secrets = { ESPN_S2: FIXTURE_COOKIES.espn_s2, ESPN_SWID: FIXTURE_COOKIES.SWID };
  const league = await espnProvider.lookupLeague({ id: PRIVATE_LEAGUE_ID, season: 2026, secrets });
  assert.equal(league.id, PRIVATE_LEAGUE_ID);
  assert.equal(league.provider, 'espn');
  await assert.rejects(espnProvider.lookupLeague({ id: PRIVATE_LEAGUE_ID, season: 2026 }), /private league/);
});

test('fromConfig refuses a missing league ID, naming the key', () => {
  assert.throws(() => espnProvider.fromConfig({ league: { provider: 'espn', id: '' }, dataDir: tmpdir() }), /ESPN_LEAGUE_ID/);
  const config = {
    league: { provider: 'espn', id: PUBLIC_LEAGUE_ID, season: '2026', secrets: {} },
    dataDir: tmpdir(),
  };
  const made = espnProvider.fromConfig(config, { store: createMemoryStore() });
  assert.equal(made.client.leagueId, PUBLIC_LEAGUE_ID);
  assert.throws(() => espnProvider.fromConfig(config), /through a store/, 'the import route needs a store passed in');
});

// --- IR players (operator decision, 2026-10-13) ------------------------------

/** Moves team 0's bench running back (role 8) into the IR slot, optionally with no points entry. */
function irBundle({ withPoints, points }) {
  const raw = bundle();
  const entry = raw.matchups.schedule[0].home.rosterForCurrentScoringPeriod.entries.find(
    (e) => e.playerPoolEntry.player.id === playerId(0, 8),
  );
  entry.lineupSlotId = 21;
  const player = entry.playerPoolEntry.player;
  if (!withPoints) player.stats = player.stats.filter((s) => s.statSourceId !== 0);
  else if (points !== undefined) player.stats.find((s) => s.statSourceId === 0).appliedTotal = points;
  return raw;
}

test('a starter of unknown position leaves his team\'s lineup efficiency unavailable, never above 100%', () => {
  // The fixture's players_wl knows only the first two teams' players.
  const analysis = analyze(weekOf());
  const known = new Set([1, 2]);
  for (const side of analysis.teamWeeks) {
    if (known.has(side.rosterId)) {
      assert.ok(side.lineupEfficiency <= 100 && side.potentialPoints >= side.points, side.team);
    } else {
      for (const key of ['potentialPoints', 'lineupEfficiency', 'optimalLineup']) assert.ok(!(key in side), `${side.team}: ${key}`);
    }
  }
  assert.ok(known.has(analysis.teamWeeks.find((t) => t.team === analysis.awards.managerOfTheWeek.team).rosterId));
});

test('the fetch route\'s dictionary adds every rostered player players_wl leaves out, and keeps its own records', () => {
  const v = views();
  const fromList = normalizePlayers(PLAYERS_WL);
  const players = withRosteredPlayers(fromList, v.mRoster);
  for (const t of v.mRoster.teams) {
    for (const entry of t.roster.entries) {
      assert.deepEqual(players[String(entry.playerId)], normalizePlayer(entry.playerPoolEntry.player));
    }
  }
  // A player in both keeps his players_wl record, and the list's own players are all still there.
  const marked = { ...fromList, [String(playerId(0, 0))]: { ...fromList[String(playerId(0, 0))], name: 'From the list' } };
  assert.equal(withRosteredPlayers(marked, v.mRoster)[String(playerId(0, 0))].name, 'From the list');
  for (const id of Object.keys(fromList)) assert.ok(id in players, id);
  assert.notEqual(players, fromList, 'the dictionary passed in is not changed');

  // With it, every team's lineup efficiency is known, and none is above 100%.
  const { league, teams } = opened();
  const analysis = analyzeWeek({ league, teams, players, rosters: weekOf().rosters, week: SCORED_WEEK });
  for (const side of analysis.teamWeeks) {
    assert.equal(typeof side.lineupEfficiency, 'number', side.team);
    assert.ok(side.lineupEfficiency <= 100 && side.potentialPoints >= side.points, side.team);
  }
});

test('an IR player with no points entry does not make his team\'s lineup efficiency unavailable', () => {
  const week = weekOf(PUBLIC_LEAGUE_ID, irBundle({ withPoints: false }));
  const ir = String(playerId(0, 8));
  assert.deepEqual(week.rosters[0].reserveIds, [ir]);
  assert.deepEqual(week.rosters[0].noPointsIds, [ir]);

  const blues = analyze(week).teamWeeks.find((t) => t.rosterId === 1);
  assert.equal(typeof blues.lineupEfficiency, 'number');
  assert.equal(typeof blues.potentialPoints, 'number');
  assert.ok(Array.isArray(blues.optimalLineup));
});

test('an IR player who has points is still left out of the optimal lineup', () => {
  const week = weekOf(PUBLIC_LEAGUE_ID, irBundle({ withPoints: true, points: 99 })); // would win the flex if eligible
  const blues = analyze(week).teamWeeks.find((t) => t.rosterId === 1);
  assert.ok(blues.potentialPoints < 99);
  assert.ok(blues.optimalLineup.every((s) => s.points !== 99));
});

// --- A moved player with no points entry, in the transaction context ----------

/** Removes one player's actual-points entry wherever he is in the week's matchups, and returns his NFL team. */
function withoutPointsFor(raw, pid) {
  for (const game of raw.matchups.schedule) {
    for (const sideOfGame of [game.home, game.away]) {
      const entry = sideOfGame.rosterForCurrentScoringPeriod.entries.find((e) => e.playerPoolEntry.player.id === pid);
      if (!entry) continue;
      const player = entry.playerPoolEntry.player;
      player.stats = player.stats.filter((s) => s.statSourceId !== 0);
      return normalizePlayer(player).team;
    }
  }
  throw new Error(`player ${pid} is on no fixture roster`);
}

/**
 * The fixture's week-4 trade, enriched against weeks 2, 3 and 4, where weeks
 * 2 and 3 are the fixture week relabelled (the trade's value is read from the
 * weeks before it). `blank` maps a week to how the traded running back's
 * points entry is removed there: 'bye' (his NFL team's bye) or 'missing'.
 */
function tradeWithUnreportedWeeks(blank) {
  const moved = playerId(10, 1);
  const weeks = [2, 3, SCORED_WEEK].map((week) => {
    const raw = bundle();
    let byeWeeks = new Map();
    if (blank[week]) {
      const nflTeam = withoutPointsFor(raw, moved);
      // The normalizer compares the bye with the bundle's own week, which is always the fixture's.
      byeWeeks = new Map([[nflTeam, blank[week] === 'bye' ? SCORED_WEEK : 99]]);
    }
    const data = weekOf(PUBLIC_LEAGUE_ID, raw, { byeWeeks });
    return { week, rosters: data.rosters, transactions: data.transactions };
  });
  const trade = weeks.at(-1).transactions.filter((t) => t.type === 'trade');
  const enriched = enrichTransactions({ transactions: trade, league: faabLeague, teams, players, weeks });
  return { moved: String(moved), trade, enriched };
}

const TRADE_CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 1,
    ranking_emoji: '',
    output: { sleeper_max_chars: 900, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: { weights: { redraft: { starting_lineup: 1 } }, weekly: {} },
};

test('a traded ESPN player with no points entry that week is never given 0 in the trade history or the report', () => {
  const { moved, trade, enriched } = tradeWithUnreportedWeeks({ [SCORED_WEEK]: 'missing' });
  const history = enriched[0].playerHistory.find((h) => h.id === moved);
  const unreported = history.weeks.find((w) => w.week === SCORED_WEEK);
  assert.equal(unreported.points, null);
  assert.ok(!('onBye' in unreported));
  assert.equal(history.weeks.find((w) => w.week === 2).points, weekPoints(10, 1));

  const context = buildContext({
    task: 'trade-report',
    config: TRADE_CONFIG,
    league: faabLeague,
    teams,
    players,
    week: SCORED_WEEK,
    transactions: trade,
    enrichedTransactions: enriched,
  });
  const lines = JSON.stringify(context.trades[0].playerHistory);
  assert.match(lines, new RegExp(`week ${SCORED_WEEK}: [^"]*, no points reported, `));
  assert.doesNotMatch(lines, new RegExp(`week ${SCORED_WEEK}: [^"]*, 0, `));
  assert.ok(!lines.includes('null'), lines);
});

test('a traded ESPN player on his bye with no points entry is flagged onBye, not given 0', () => {
  const { moved, trade, enriched } = tradeWithUnreportedWeeks({ [SCORED_WEEK]: 'bye' });
  const unreported = enriched[0].playerHistory.find((h) => h.id === moved).weeks.find((w) => w.week === SCORED_WEEK);
  assert.equal(unreported.points, null);
  assert.equal(unreported.onBye, true);

  const context = buildContext({
    task: 'trade-report',
    config: TRADE_CONFIG,
    league: faabLeague,
    teams,
    players,
    week: SCORED_WEEK,
    transactions: trade,
    enrichedTransactions: enriched,
  });
  assert.match(JSON.stringify(context.trades[0].playerHistory), new RegExp(`week ${SCORED_WEEK}: [^"]*, on bye, no points, `));
});

test('points per game leaves out a week with no points entry rather than counting it as 0', () => {
  // The side that gave him up started him before the trade, so its "before" lineup carries his value.
  const valueOf = ({ enriched, moved }) =>
    enriched[0].sides.find((s) => s.rosterId === 11).roster.before.projectedStarters.find((s) => s.id === moved);

  const full = valueOf(tradeWithUnreportedWeeks({}));
  assert.ok(full, 'the traded running back starts for the side that gave him up');
  assert.equal(full.pointsPerGame, Math.round(weekPoints(10, 1) * 10) / 10);

  // Week 3 unreported: week 2 alone, not week 2 averaged with a made-up 0.
  assert.equal(valueOf(tradeWithUnreportedWeeks({ 3: 'missing' })).pointsPerGame, full.pointsPerGame);

  // Unreported in every earlier week: unscored, never 0.
  const none = valueOf(tradeWithUnreportedWeeks({ 2: 'missing', 3: 'missing' }));
  assert.equal(none?.pointsPerGame ?? null, null);
});
