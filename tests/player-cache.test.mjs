/**
 * The player-list cache: the rule (src/playerCache.mjs) and the Sleeper client
 * that uses it. Fake fetch, invented players, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '../src/sleeper/client.mjs';
import {
  PLAYER_CACHE_MAX_AGE_MS,
  createMemoryPlayerCache,
} from '../src/playerCache.mjs';
import { createDiskPlayerCache } from '../src/diskPlayerCache.mjs';

const LEAGUE_ID = '000000000000000000';
const DAY = PLAYER_CACHE_MAX_AGE_MS;

/** A fake Sleeper whose player list is `current`, counting how often it was asked. */
function fakeSleeper() {
  const state = { calls: 0, current: { p1: { full_name: 'Ada Quill' } } };
  const fetchImpl = async (url) => {
    assert.match(String(url), /\/players\/nfl$/);
    state.calls += 1;
    return new Response(JSON.stringify(state.current), { status: 200 });
  };
  return { state, fetchImpl };
}

async function withFetch(fetchImpl, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

/** A cache holding one entry that was saved `ageMs` ago. */
function agedCache(value, ageMs) {
  const writes = [];
  return {
    writes,
    async get(key) {
      assert.equal(key, 'players-nfl');
      return { value, savedAt: Date.now() - ageMs };
    },
    async set(key, next) {
      writes.push([key, next]);
    },
  };
}

test('a fresh cache entry is returned without asking Sleeper', async () => {
  const { state, fetchImpl } = fakeSleeper();
  const cached = { cachedOnly: { full_name: 'Bram Holt' } };
  const cache = agedCache(cached, DAY - 60_000);
  const players = await withFetch(fetchImpl, () => createClient({ leagueId: LEAGUE_ID, playerCache: cache }).players());
  assert.deepEqual(players, cached);
  assert.equal(state.calls, 0);
  assert.deepEqual(cache.writes, []);
});

test('a stale entry is fetched again and the new list is cached', async () => {
  const { state, fetchImpl } = fakeSleeper();
  const cache = agedCache({ old: {} }, DAY + 60_000);
  const players = await withFetch(fetchImpl, () => createClient({ leagueId: LEAGUE_ID, playerCache: cache }).players());
  assert.deepEqual(players, state.current);
  assert.equal(state.calls, 1);
  assert.deepEqual(cache.writes, [['players-nfl', state.current]]);
});

test('refresh: true skips a fresh entry and still writes the result', async () => {
  const { state, fetchImpl } = fakeSleeper();
  const cache = agedCache({ old: {} }, 1000);
  const players = await withFetch(fetchImpl, () =>
    createClient({ leagueId: LEAGUE_ID, playerCache: cache }).players({ refresh: true }),
  );
  assert.deepEqual(players, state.current);
  assert.equal(state.calls, 1);
  assert.equal(cache.writes.length, 1);
});

test('an empty cache fetches once, then the memory cache answers', async () => {
  const { state, fetchImpl } = fakeSleeper();
  const client = createClient({ leagueId: LEAGUE_ID, playerCache: createMemoryPlayerCache() });
  await withFetch(fetchImpl, async () => {
    const first = await client.players();
    const second = await client.players();
    assert.deepEqual(second, first);
  });
  assert.equal(state.calls, 1);
});

test('with no playerCache every call fetches', async () => {
  const { state, fetchImpl } = fakeSleeper();
  const client = createClient({ leagueId: LEAGUE_ID });
  await withFetch(fetchImpl, async () => {
    await client.players();
    await client.players();
  });
  assert.equal(state.calls, 2);
});

test('the disk cache keeps today\'s path and age rule', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pressbox-player-cache-'));
  try {
    const { state, fetchImpl } = fakeSleeper();
    const client = createClient({ leagueId: LEAGUE_ID, playerCache: createDiskPlayerCache({ dataDir: dir }) });
    await withFetch(fetchImpl, async () => {
      await client.players();
      const path = join(dir, 'cache', 'players-nfl.json');
      assert.ok(existsSync(path));
      assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), state.current);

      await client.players();
      assert.equal(state.calls, 1, 'within a day it is read from disk');

      const old = new Date(Date.now() - 2 * DAY);
      utimesSync(path, old, old);
      await client.players();
      assert.equal(state.calls, 2, 'a file older than a day is fetched again');

      await client.players({ refresh: true });
      assert.equal(state.calls, 3, '--refresh-players always fetches');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('neither client imports from node:', () => {
  for (const file of ['../src/sleeper/client.mjs', '../src/espn/client.mjs', '../src/playerCache.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]node:|require\(['"]node:/, file);
  }
});
