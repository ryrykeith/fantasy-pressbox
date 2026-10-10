/**
 * A week's snapshot, once captured after Sleeper scored the week, is that
 * week's record and is never rewritten (isSettledSnapshot in
 * src/pipeline.mjs).
 *
 * The bug this pins: a preview for week 5 captured week 4 again for "last
 * week's results", and the capture overwrote week 4's snapshot with that
 * day's injury statuses, a draft order projected from that day's standings,
 * and — had anyone renamed their team in between — the new name, erasing the
 * old one src/teamIdentity.mjs reads to recognise the roster.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { captureWeek, isSettledSnapshot } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

const PLAYERS = {
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF', injury_status: null },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL', injury_status: 'Questionable' },
};

function matchups(points = [120, 90]) {
  return [
    { roster_id: 1, matchup_id: 1, points: points[0], starters: ['qb'], starters_points: [points[0]], players: ['qb'], players_points: { qb: points[0] } },
    { roster_id: 2, matchup_id: 1, points: points[1], starters: ['rb'], starters_points: [points[1]], players: ['rb'], players_points: { rb: points[1] } },
  ];
}

function teams(names = ['Punt Intended', 'user4817']) {
  return names.map((name, index) => ({
    rosterId: index + 1,
    ownerId: `owner-${index + 1}`,
    name,
    manager: `manager${index + 1}`,
    record: { wins: 2, losses: 2, ties: 0 },
    playerIds: index === 0 ? ['qb'] : ['rb'],
  }));
}

/** A Sleeper stand-in that counts its calls, so a kept week can prove it fetched nothing. */
function client({ points, transactions = [] } = {}) {
  const calls = { matchups: 0, transactions: 0 };
  return {
    calls,
    matchups: async () => {
      calls.matchups += 1;
      return matchups(points);
    },
    transactions: async () => {
      calls.transactions += 1;
      return transactions;
    },
  };
}

const league = (lastScoredWeek, formatType = 'redraft') => ({
  id: '123',
  season: '2026',
  startingSlots: ['QB', 'RB'],
  format: { type: formatType, source: 'declared' },
  lastScoredWeek,
});

function newStore() {
  return createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-settled-')) });
}

const capture = (store, overrides) =>
  captureWeek({
    client: client(),
    store,
    league: league(4),
    teams: teams(),
    players: PLAYERS,
    week: 4,
    ...overrides,
  });

test('a week captured after Sleeper scored it is settled, and capturing it again rewrites nothing', async () => {
  const store = newStore();
  const first = await capture(store, { client: client({ transactions: [{ type: 'trade' }] }) });
  assert.equal(first.kept, false);
  assert.equal(store.loadSnapshot('2026', 4).settled, true);
  const onDisk = readFileSync(store.snapshotPath('2026', 4), 'utf8');

  // A week later: a team has renamed itself, an injury has changed, and
  // Sleeper would report different points if it were asked.
  const later = client({ points: [1, 1] });
  const again = await capture(store, {
    client: later,
    league: league(5),
    teams: teams(['Punt Intended', 'Pick Six Appeal']),
    players: { ...PLAYERS, rb: { ...PLAYERS.rb, injury_status: 'Out' } },
  });

  assert.equal(readFileSync(store.snapshotPath('2026', 4), 'utf8'), onDisk, 'the snapshot is byte for byte the same');
  assert.equal(again.kept, true);
  assert.deepEqual(later.calls, { matchups: 0, transactions: 0 }, 'nothing was fetched');
  assert.deepEqual(again.analysis, store.loadSnapshot('2026', 4).analysis);
  assert.deepEqual(again.transactions, [{ type: 'trade' }], "transactions come from the week's raw bundle");
  assert.ok(store.loadTeamNameHistory('2026').some((entry) => entry.name === 'user4817'), 'the old name survives');
});

test("a week's preview-time capture is replaced once the week is scored", async () => {
  const store = newStore();
  // Captured by its own preview: Sleeper has scored only week 3, and nobody has played.
  await capture(store, { league: league(3), client: client({ points: [0, 0] }) });
  assert.equal(store.loadSnapshot('2026', 4).settled, false);
  assert.equal(store.loadSnapshot('2026', 4).played, false);

  const scored = await capture(store, { league: league(4) });
  assert.equal(scored.kept, false);
  const saved = store.loadSnapshot('2026', 4);
  assert.equal(saved.played, true);
  assert.equal(saved.settled, true);
});

test('a capture during the games is not final, so the capture after them replaces it', async () => {
  const store = newStore();
  // Sunday afternoon: points on the board, but Sleeper has scored only week 3.
  await capture(store, { league: league(3), client: client({ points: [40, 12] }) });
  const sunday = store.loadSnapshot('2026', 4);
  assert.equal(sunday.played, true);
  assert.equal(sunday.settled, false);

  await capture(store, { league: league(4) });
  assert.equal(store.loadSnapshot('2026', 4).analysis.teamWeeks.find((t) => t.rosterId === 1).points, 120);
});

test('a snapshot written before the flag existed is settled when it has scores for a week Sleeper has scored', () => {
  const legacy = { week: 4, played: true, analysis: {} };
  assert.equal(isSettledSnapshot(legacy, league(4)), true);
  assert.equal(isSettledSnapshot(legacy, league(5)), true);
  assert.equal(isSettledSnapshot(legacy, league(3)), false, 'Sleeper has not scored it yet');
  assert.equal(isSettledSnapshot({ ...legacy, played: false }, league(5)), false, 'no scores to keep');
  assert.equal(isSettledSnapshot(legacy, league(null)), false, 'without a scored week there is nothing to go on');
  assert.equal(isSettledSnapshot(null, league(5)), false);
});

test('a legacy guillotine snapshot without its elimination ledger is captured again', () => {
  const legacy = { week: 4, played: true, analysis: {} };
  assert.equal(isSettledSnapshot(legacy, league(5, 'guillotine')), false);
  assert.equal(isSettledSnapshot({ ...legacy, elimination: { history: [] } }, league(5, 'guillotine')), true);
});

test('the flag, once written, is what decides', () => {
  assert.equal(isSettledSnapshot({ week: 4, played: true, settled: false }, league(9)), false);
  assert.equal(isSettledSnapshot({ week: 4, played: false, settled: true }, league(1)), true);
});
