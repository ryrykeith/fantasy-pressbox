import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NO_MEETING_SAVED, SEASON_NOT_COVERED, headToHead, readSavedSeasons } from '../src/analysis/rivalry.mjs';
import { createClient } from '../src/espn/client.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { captureWeek } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { PUBLIC_LEAGUE_ID, SCORED_WEEK } from './fixtures/mock-espn-league.mjs';

// The invented cast: roster 1 "Bye Week Blues", roster 2 "Punt Intended",
// roster 3 "Gridiron Gremlins", roster 4 "Fourth and Wrong".
const NAMES = { 1: 'Bye Week Blues', 2: 'Punt Intended', 3: 'Gridiron Gremlins', 4: 'Fourth and Wrong' };

/** A side as analyzeWeek saves it: the name the roster went by that week. */
const side = (rosterId, points, opponentPoints, names) => ({
  rosterId,
  team: names[rosterId] ?? NAMES[rosterId],
  points,
  ...(opponentPoints === undefined ? {} : { opponentPoints, result: points > opponentPoints ? 'W' : points < opponentPoints ? 'L' : 'T' }),
});

/**
 * A settled week's snapshot. `games` is `[[rosterA, pointsA, rosterB, pointsB]]`;
 * `alone` lists roster ids saved with no opponent (a guillotine week's sides).
 */
function snapshot(week, games, { alone = [], names = {}, ...extra } = {}) {
  const analysed = games.map(([a, pa, b, pb]) => ({ teams: [side(a, pa, pb, names), side(b, pb, pa, names)] }));
  const teamWeeks = [...analysed.flatMap((game) => game.teams), ...alone.map(([id, points]) => side(id, points, undefined, names))];
  return {
    week,
    played: true,
    settled: true,
    teams: teamWeeks.map((entry) => ({ rosterId: entry.rosterId, name: entry.team })),
    analysis: { week, games: analysed, teamWeeks },
    ...extra,
  };
}

const record = (store, teams = [1, 2], through) => headToHead(readSavedSeasons(store, { through }), teams);

for (const [backend, make] of Object.entries({
  memory: () => ({ store: createMemoryStore(), done: () => {} }),
  file: () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'pressbox-rivalry-'));
    return { store: createStore({ dataDir }), done: () => rmSync(dataDir, { recursive: true, force: true }) };
  },
})) {
  test(`${backend} store: a renamed team keeps its record, matched by roster id`, () => {
    const { store, done } = make();
    try {
      store.saveSnapshot('2026', 1, snapshot(1, [[1, 110.5, 2, 98.25], [3, 90, 4, 80]]));
      // Both teams are renamed by week 5; one even takes a name the other used.
      store.saveSnapshot('2026', 5, snapshot(5, [[2, 120, 1, 101.1], [3, 70, 4, 75]], { names: { 1: 'user4817', 2: 'Bye Week Blues' } }));
      store.saveSnapshot('2026', 9, snapshot(9, [[1, 130, 2, 100]], { names: { 1: 'Pick Six Appeal', 2: 'Bye Week Blues' }, alone: [] }));

      const h2h = record(store);
      assert.equal(h2h.unavailable, undefined);
      assert.equal(h2h.meetings, 3);
      assert.deepEqual(h2h.record, { wins: 2, losses: 1, ties: 0 });
      assert.deepEqual(h2h.points, [341.6, 318.25]);
      assert.deepEqual(h2h.lastMeeting, { season: '2026', week: 9, points: [130, 100], winner: 1 });
      assert.deepEqual(h2h.streak, { holder: 1, result: 'W', length: 1 });
      assert.deepEqual(h2h.biggestMargin, { season: '2026', week: 9, points: [130, 100], winner: 1, margin: 30 });
      assert.deepEqual(h2h.covered, [{ season: '2026', weeks: [1, 5, 9] }]);
      assert.deepEqual(h2h.notCovered, []);

      // The same record, seen from the other side.
      const other = record(store, [2, 1]);
      assert.deepEqual(other.record, { wins: 1, losses: 2, ties: 0 });
      assert.deepEqual(other.points, [318.25, 341.6]);
      assert.deepEqual(other.lastMeeting.points, [100, 130]);
      assert.equal(other.streak.holder, 1);
    } finally {
      done();
    }
  });
}

test('a tie is a tie in the record, and ends any winning streak', () => {
  const store = createMemoryStore();
  store.saveSnapshot('2026', 2, snapshot(2, [[1, 100, 2, 90]]));
  store.saveSnapshot('2026', 4, snapshot(4, [[1, 105, 2, 95]]));
  store.saveSnapshot('2026', 8, snapshot(8, [[2, 99.5, 1, 99.5]]));
  const h2h = record(store);
  assert.deepEqual(h2h.record, { wins: 2, losses: 0, ties: 1 });
  assert.deepEqual(h2h.lastMeeting, { season: '2026', week: 8, points: [99.5, 99.5], winner: null });
  assert.deepEqual(h2h.streak, { holder: null, result: 'T', length: 1 });
  // Two meetings share the biggest margin: the earliest is kept.
  assert.deepEqual(h2h.biggestMargin, { season: '2026', week: 2, points: [100, 90], winner: 1, margin: 10 });
});

test('a multi-season history with a gap: every season counts, and the missing one is named', () => {
  const store = createMemoryStore();
  store.saveSnapshot('2023', 3, snapshot(3, [[1, 80, 2, 120]]));
  store.saveSnapshot('2023', 12, snapshot(12, [[1, 90, 2, 91]]));
  // 2024 was never captured.
  store.saveSnapshot('2025', 6, snapshot(6, [[1, 70, 3, 60], [2, 100, 4, 50]])); // saved, but no meeting
  store.saveSnapshot('2026', 2, snapshot(2, [[2, 88, 1, 140]]));
  store.saveSnapshot('2026', 7, snapshot(7, [[1, 111, 2, 101]]));

  const h2h = record(store);
  assert.deepEqual(h2h.record, { wins: 2, losses: 2, ties: 0 });
  assert.deepEqual(h2h.points, [421, 400]);
  assert.deepEqual(h2h.streak, { holder: 1, result: 'W', length: 2 });
  assert.deepEqual(h2h.biggestMargin, { season: '2026', week: 2, points: [140, 88], winner: 1, margin: 52 });
  assert.deepEqual(h2h.covered, [
    { season: '2023', weeks: [3, 12] },
    { season: '2025', weeks: [6] },
    { season: '2026', weeks: [2, 7] },
  ]);
  assert.deepEqual(h2h.notCovered, [{ season: '2024', reason: SEASON_NOT_COVERED.NO_WEEK_SAVED }]);

  // Read as of an edition: a later season with nothing saved is named too, and
  // `through.week` stops the newest season there.
  const asOf = record(store, [1, 2], { season: '2026', week: 6 });
  assert.equal(asOf.meetings, 3);
  assert.deepEqual(asOf.covered.at(-1), { season: '2026', weeks: [2] });
  const later = record(store, [1, 2], { season: '2027' });
  assert.deepEqual(later.notCovered.at(-1), { season: '2027', reason: SEASON_NOT_COVERED.NO_WEEK_SAVED });
});

test('with no meeting saved the record is unavailable, never 0-0', () => {
  assert.deepEqual(record(createMemoryStore()), { teams: [1, 2], unavailable: NO_MEETING_SAVED, covered: [], notCovered: [] });

  const store = createMemoryStore();
  store.saveSnapshot('2026', 1, snapshot(1, [[1, 100, 3, 90], [2, 80, 4, 70]]));
  const h2h = record(store);
  assert.equal(h2h.unavailable, NO_MEETING_SAVED);
  for (const key of ['record', 'points', 'meetings', 'lastMeeting', 'streak', 'biggestMargin']) assert.ok(!(key in h2h), key);
  assert.deepEqual(h2h.covered, [{ season: '2026', weeks: [1] }]);
});

test('a week still being played, unscored, or with no analysis is no result and covers nothing', () => {
  const store = createMemoryStore();
  store.saveSnapshot('2026', 1, snapshot(1, [[1, 50, 2, 10]], { settled: false }));
  store.saveSnapshot('2026', 2, snapshot(2, [[1, 0, 2, 0]], { played: false }));
  store.saveSnapshot('2026', 3, { week: 3, played: false, settled: true, multiWeekMatchup: { matchupPeriod: 3, weeks: [3, 4] } });
  const h2h = record(store);
  assert.equal(h2h.unavailable, NO_MEETING_SAVED);
  assert.deepEqual(h2h.covered, []);
  assert.deepEqual(h2h.notCovered, [{ season: '2026', reason: SEASON_NOT_COVERED.NO_WEEK_WITH_BOTH }]);
});

test('a guillotine league\'s weeks save no games, so they give no meetings', () => {
  const store = createMemoryStore();
  for (const week of [1, 2, 3]) {
    store.saveSnapshot('2026', week, snapshot(week, [], { alone: [[1, 100 + week], [2, 90 + week], [3, 80]] }));
  }
  const h2h = record(store);
  assert.equal(h2h.unavailable, NO_MEETING_SAVED);
  assert.deepEqual(h2h.covered, [{ season: '2026', weeks: [1, 2, 3] }]);
});

test('a pair must be two different teams', () => {
  assert.throws(() => headToHead([], [1, 1]), /two different teams/);
});

test('an ESPN week, captured through the pipeline, gives the meeting it saved', async () => {
  const provider = espnProvider.forClient(createClient({ leagueId: PUBLIC_LEAGUE_ID, season: 2026, fetch: createFakeEspnFetch() }));
  const ctx = await provider.openLeague();
  const store = createMemoryStore();
  const { analysis } = await captureWeek({ provider, store, ...ctx, week: SCORED_WEEK });

  const [x, y] = analysis.games[0].teams;
  const h2h = record(store, [x.rosterId, y.rosterId]);
  assert.equal(h2h.meetings, 1);
  assert.deepEqual(h2h.lastMeeting, {
    season: '2026',
    week: SCORED_WEEK,
    points: [x.points, y.points],
    winner: x.points > y.points ? x.rosterId : y.points > x.points ? y.rosterId : null,
  });
  assert.deepEqual(h2h.covered, [{ season: '2026', weeks: [SCORED_WEEK] }]);

  // Two teams that did not play each other that week have no record.
  const [z] = analysis.games[1].teams;
  assert.equal(record(store, [x.rosterId, z.rosterId]).unavailable, NO_MEETING_SAVED);
});
