import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pairOnKey } from '../src/league/pairing.mjs';
import { describePlayer } from '../src/promptContext.mjs';
import { captureWeek, readFaabMarket, readRosterWindow, readTransactions } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { normalizePlayers, normalizeTeams, normalizeWeek } from '../src/sleeper/normalize.mjs';
import {
  RAW_PLAYERS,
  RAW_ROSTERS,
  RAW_USERS,
  WEEK_1_MATCHUPS,
  WEEK_1_TRANSACTIONS,
  WEEK_2_MATCHUPS,
  WEEK_2_TRANSACTIONS,
  leagueOf,
  readSavedWeeks,
} from './fixtures/week-data-league.mjs';

/**
 * Analysis reads a week as WeekData (src/sleeper/normalize.mjs#normalizeWeek)
 * rather than Sleeper's raw matchups and transactions. The raw bundles under
 * data/raw/ stay exactly as fetched and are normalized on read, so a league
 * folder written before WeekData existed reads as it always did.
 *
 * week-data-reads.json was produced by the code before this change, from the
 * same fixture (tests/fixtures/week-data-league.mjs); it is reproduced here
 * exactly.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PINNED = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/week-data-reads.json'), 'utf8'));
const players = normalizePlayers(RAW_PLAYERS);
const teams = normalizeTeams({ rosters: RAW_ROSTERS, users: RAW_USERS });

/* ------------------------------------------------- saved weeks, read as before */

test('untagged raw bundles read exactly as they did before WeekData, in every reader', async () => {
  const reads = await readSavedWeeks(
    { normalizePlayers, normalizeTeams, createStore, captureWeek, readTransactions, readRosterWindow, readFaabMarket, describePlayer },
    { dataDir: mkdtempSync(join(tmpdir(), 'pressbox-week-data-')), transactionsOf: (captured) => captured.transactions },
  );
  for (const type of ['dynasty', 'guillotine']) {
    for (const [read, value] of Object.entries(reads[type])) {
      assert.equal(
        `${JSON.stringify(value, null, 2)}`,
        `${JSON.stringify(PINNED[type][read], null, 2)}`,
        `${type} ${read}`,
      );
    }
  }
});

test('the pinned reads cover unpaired rosters, the guillotine no-pairing path and an empty slot', () => {
  assert.deepEqual(PINNED.dynasty.week1.analysis.unpairedRosterIds, [3, 4]);
  assert.deepEqual(PINNED.dynasty.week2.analysis.unpairedRosterIds, [2, 4, 5]);
  assert.equal(PINNED.guillotine.week1.analysis.games.length, 0);
  assert.deepEqual(PINNED.guillotine.week1.analysis.unpairedRosterIds, []);
  assert.equal(PINNED.dynasty.week1.analysis.teamWeeks[0].starters[2].name, 'Unknown player 0');
  assert.equal(PINNED.dynasty.week1Settled.kept, true);
});

test('captureWeek saves the raw bundle exactly as fetched, tagged with its provider', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-week-data-')) });
  const client = { matchups: async () => WEEK_2_MATCHUPS, transactions: async () => WEEK_2_TRANSACTIONS };
  const league = { ...leagueOf('dynasty'), lastScoredWeek: 1 };
  await captureWeek({ client, store, league, teams, players, week: 2 });

  const saved = store.loadRaw('2026', 2);
  assert.deepEqual(Object.keys(saved), ['provider', 'fetchedAt', 'leagueId', 'week', 'matchups', 'transactions']);
  assert.equal(saved.provider, 'sleeper');
  assert.deepEqual(saved.matchups, WEEK_2_MATCHUPS);
  assert.deepEqual(saved.transactions, WEEK_2_TRANSACTIONS);
});

/* -------------------------------------------------------------- normalizeWeek */

test('a bundle with no provider field is read as Sleeper', () => {
  const week = normalizeWeek({ week: 1, matchups: WEEK_1_MATCHUPS, transactions: WEEK_1_TRANSACTIONS }, { league: leagueOf('dynasty'), teams, players });
  assert.equal(week.week, 1);
  assert.deepEqual(week.rosters[0], {
    rosterId: 1,
    playerIds: ['qb1', 'rb1', 'te1', 'wr2'],
    // Lined up with the starting slots; Sleeper's "0" is an empty slot.
    starterIds: ['qb1', 'rb1', null, 'te1'],
    starterPoints: [30.2, 20.1, 0],
    playerPoints: { qb1: 30.2, rb1: 20.1, te1: 22.3, wr2: 25.55 },
    points: 72.6,
    pairingKey: 1,
  });
  assert.equal(week.rosters[2].pairingKey, null);
  // No points from Sleeper is no points, not zero.
  assert.equal(week.rosters[3].points, null);
  // The pending trade is not a move; the completed one is, with its sides.
  assert.deepEqual(week.transactions.map((t) => t.id), ['w1-trade']);
  assert.deepEqual(week.transactions[0].sides.map((side) => side.rosterId), [1, 2]);
  assert.deepEqual(week.bids, []);
});

test('bids keep won and lost claims, with the week Sleeper filed them under', () => {
  const { bids } = normalizeWeek({ week: 2, matchups: [], transactions: WEEK_2_TRANSACTIONS });
  assert.deepEqual(bids, [
    { playerId: 'wr2', rosterId: 3, week: 2, amount: 12, outcome: 'won', type: 'waiver', transactionId: 'w2-claim' },
    { playerId: 'wr2', rosterId: 2, week: 2, amount: 9, outcome: 'lost', type: 'waiver', transactionId: 'w2-lost' },
    { playerId: 'fa2', rosterId: 1, week: 2, amount: 4, outcome: 'lost', type: 'waiver', transactionId: 'w2-lost-fa2' },
    { playerId: 'fa2', rosterId: 1, week: 1, amount: 2, outcome: 'won', type: 'waiver', transactionId: 'w2-late' },
  ]);
});

test("a team's empty starting slot is null, as in WeekData", () => {
  assert.deepEqual(teams[0].starterIds, ['qb2', 'rb1', null, 'te1']);
  assert.deepEqual(teams[3].starterIds, []);
});

/* ------------------------------------------------------------------ pairOnKey */

test('rosters sharing a key are opponents; a null key or a key without two sides is unpaired', () => {
  const roster = (rosterId, pairingKey) => ({ rosterId, pairingKey });
  const { games, unpaired } = pairOnKey([
    roster(1, 2),
    roster(2, null),
    roster(3, 1),
    roster(4, 3),
    roster(5, 2),
    roster(6, 1),
    roster(7, 3),
    roster(8, 3),
    roster(9, undefined),
  ]);
  assert.deepEqual(
    games.map((game) => [game.pairingKey, game.sides.map((side) => side.rosterId)]),
    [[1, [3, 6]], [2, [1, 5]]],
  );
  assert.deepEqual(unpaired.map((side) => side.rosterId), [2, 9, 4, 7, 8]);
});

test('text keys pair and sort too', () => {
  const { games } = pairOnKey([
    { rosterId: 1, pairingKey: 'b' },
    { rosterId: 2, pairingKey: 'a' },
    { rosterId: 3, pairingKey: 'b' },
    { rosterId: 4, pairingKey: 'a' },
  ]);
  assert.deepEqual(games.map((game) => game.pairingKey), ['a', 'b']);
});

/* ---------------------------------------------------------------------- guard */

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.mjs') ? [path] : [];
  });
}

/** Code only: a comment may name a Sleeper field to explain what it replaced. */
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test("no module outside src/sleeper/ reads Sleeper's week fields or its empty-slot marker", () => {
  const fields = /\b(roster_id|matchup_id|players_points|starters_points|waiver_bid)\b|\.(adds|drops)\b|[!=]==?\s*['"]0['"]/;
  const offenders = sourceFiles(join(ROOT, 'src'))
    .map((path) => relative(ROOT, path))
    .filter((path) => !path.startsWith(join('src', 'sleeper')))
    .filter((path) => fields.test(withoutComments(readFileSync(join(ROOT, path), 'utf8'))));
  assert.deepEqual(offenders, []);
});

test('analysis does not import from src/sleeper/', () => {
  const offenders = sourceFiles(join(ROOT, 'src/analysis'))
    .map((path) => relative(ROOT, path))
    .filter((path) => /from '\.\.\/sleeper\//.test(readFileSync(join(ROOT, path), 'utf8')));
  assert.deepEqual(offenders, []);
});
