import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient, EspnError } from '../src/espn/client.mjs';
import { createDiskPlayerCache } from '../src/diskPlayerCache.mjs';
import { EspnShapeError } from '../src/espn/shape.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  UNKNOWN_LEAGUE_ID,
} from './fixtures/mock-espn-league.mjs';

// No test here touches the network: every client gets the fake fetch (or a stub), and sleep is a no-op.

const SECRETS = { ESPN_S2: FIXTURE_COOKIES.espn_s2, ESPN_SWID: FIXTURE_COOKIES.SWID };
const COOKIE_VALUES = [FIXTURE_COOKIES.espn_s2, FIXTURE_COOKIES.SWID];
const noSleep = async () => {};

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'pressbox-espn-'));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function client(overrides = {}) {
  const logged = [];
  const fake = createFakeEspnFetch({ log: (url) => logged.push(url) });
  const made = createClient({
    leagueId: PUBLIC_LEAGUE_ID,
    season: 2026,
    fetch: fake,
    sleep: noSleep,
    ...overrides,
  });
  return { made, logged };
}

const noCookies = (text) => {
  for (const value of COOKIE_VALUES) assert.ok(!String(text).includes(value), `cookie value found in: ${text}`);
};

test('a public league is read without cookies, several views in one request', async () => {
  const { made, logged } = client();
  const body = await made.league(['mTeam', 'mRoster']);
  assert.equal(body.teams.length, 12);
  assert.match(logged[0], /\/seasons\/2026\/segments\/0\/leagues\/1000001\?view=mTeam&view=mRoster$/);
});

test('a week is asked for with scoringPeriodId', async () => {
  const { made, logged } = client();
  const body = await made.league(['mMatchupScore', 'mScoreboard'], { week: 4 });
  assert.ok(body.schedule[0].home.rosterForCurrentScoringPeriod);
  assert.match(logged[0], /view=mMatchupScore&view=mScoreboard&scoringPeriodId=4$/);
});

test('cookies go only in a Cookie header, only to league requests, only to the ESPN host', async () => {
  const seen = [];
  const fake = createFakeEspnFetch();
  const spy = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    return fake(url, init);
  };
  const { made } = client({ leagueId: PRIVATE_LEAGUE_ID, secrets: SECRETS, fetch: spy });
  await made.league(['mSettings']);
  await made.seasonInfo();
  const [leagueCall, seasonCall] = seen;
  assert.equal(new URL(leagueCall.url).host, 'lm-api-reads.fantasy.espn.com');
  assert.equal(leagueCall.headers.cookie, `espn_s2=${FIXTURE_COOKIES.espn_s2}; SWID=${FIXTURE_COOKIES.SWID}`);
  assert.equal(seasonCall.headers.cookie, undefined);
  for (const call of seen) noCookies(call.url);
});

test('a private league without cookies is refused with the fix, and says nothing secret', async () => {
  const { made } = client({ leagueId: PRIVATE_LEAGUE_ID });
  await assert.rejects(made.league(['mSettings']), (error) => {
    assert.ok(error instanceof EspnError);
    assert.match(error.message, /private league/);
    assert.match(error.message, /ESPN_S2/);
    assert.match(error.message, /ESPN_SWID/);
    assert.match(error.message, /refresh/);
    noCookies(error.message);
    return true;
  });
});

test('wrong cookies on a private league are refused, naming the cookies and not echoing them', async () => {
  const bad = { ESPN_S2: 'WRONG-S2-VALUE', ESPN_SWID: '{WRONG-SWID-VALUE}' };
  const { made } = client({ leagueId: PRIVATE_LEAGUE_ID, secrets: bad });
  await assert.rejects(made.league(['mSettings']), (error) => {
    assert.match(error.message, /expired|wrong/);
    assert.match(error.message, /ESPN_S2 and ESPN_SWID/);
    for (const value of Object.values(bad)) assert.ok(!error.message.includes(value));
    return true;
  });
});

test('404: no such league, and no such season, name the fix', async () => {
  const { made } = client({ leagueId: UNKNOWN_LEAGUE_ID });
  await assert.rejects(made.league(['mSettings']), (error) => {
    assert.match(error.message, /no league .*HTTP 404/i);
    assert.match(error.message, /ESPN_LEAGUE_ID/);
    return true;
  });
  const wrongSeason = client({ season: 2019 }).made;
  await assert.rejects(wrongSeason.league(['mSettings']), (error) => {
    assert.match(error.message, /LEAGUE_SEASON \(2019\)/);
    return true;
  });
});

test('404 is not retried', async () => {
  let calls = 0;
  const stub = async () => (calls++, new Response('{}', { status: 404 }));
  await assert.rejects(client({ fetch: stub }).made.league(['mSettings']));
  assert.equal(calls, 1);
});

test('429 backs off and retries, then succeeds', async () => {
  const fake = createFakeEspnFetch();
  let calls = 0;
  const waits = [];
  const flaky = async (url, init) => (++calls < 3 ? new Response('', { status: 429 }) : fake(url, init));
  const { made } = client({ fetch: flaky, sleep: async (ms) => waits.push(ms) });
  const body = await made.league(['mSettings']);
  assert.equal(body.settings.size, 12);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('429 that never clears is reported as rate limiting after the retries', async () => {
  let calls = 0;
  const stub = async () => (calls++, new Response('', { status: 429 }));
  await assert.rejects(client({ fetch: stub }).made.league(['mSettings']), /rate-limited.*HTTP 429.*3 tries/s);
  assert.equal(calls, 3);
});

test('a network failure is retried, and a cookie inside its message is scrubbed', async () => {
  let calls = 0;
  const stub = async () => {
    calls++;
    throw new Error(`socket hang up (cookie: ${FIXTURE_COOKIES.espn_s2})`);
  };
  const { made } = client({ leagueId: PRIVATE_LEAGUE_ID, secrets: SECRETS, fetch: stub });
  await assert.rejects(made.league(['mSettings']), (error) => {
    noCookies(error.message);
    assert.match(error.message, /Could not reach ESPN/);
    return true;
  });
  assert.equal(calls, 3);
});

test('a response that is not JSON is a shape error naming the view', async () => {
  const stub = async () => new Response('<html>maintenance</html>', { status: 200 });
  await assert.rejects(client({ fetch: stub }).made.league(['mSettings']), (error) => {
    assert.ok(error instanceof EspnShapeError);
    assert.equal(error.view, 'league 1000001 (mSettings)');
    assert.match(error.message, /docs\/espn-data\.md/);
    assert.ok(!error.message.includes('maintenance'));
    return true;
  });
});

test('a response that is JSON but not an object is a shape error', async () => {
  const stub = async () => new Response('[1,2,3]', { status: 200 });
  await assert.rejects(client({ fetch: stub }).made.league(['mTeam']), EspnShapeError);
});

test('other HTTP failures are named, not retried into silence', async () => {
  const stub = async () => new Response('', { status: 500 });
  await assert.rejects(client({ fetch: stub }).made.league(['mSettings']), /HTTP 500/);
});

test('only one cookie configured is refused, naming the missing one', () => {
  assert.throws(() => client({ secrets: { ESPN_S2: 'x' } }), /ESPN_SWID is missing/);
  assert.throws(() => client({ secrets: { ESPN_SWID: 'x' } }), /ESPN_S2 is missing/);
});

test('a missing league ID or season is refused', () => {
  assert.throws(() => createClient({ season: 2026 }), /ESPN_LEAGUE_ID/);
  assert.throws(() => createClient({ leagueId: '1' }), /LEAGUE_SEASON/);
});

test('the player list is fetched once, cached under data/cache, and read from the cache within a day', async () => {
  const ws = workspace();
  try {
    const { made, logged } = client({ playerCache: createDiskPlayerCache({ dataDir: ws.dir }) });
    const first = await made.players();
    assert.ok(first.length > 10);
    assert.ok(existsSync(join(ws.dir, 'cache', 'players-espn-2026.json')));
    const second = await made.players();
    assert.deepEqual(second, first);
    assert.equal(logged.filter((u) => u.includes('players_wl')).length, 1);
    await made.players({ refresh: true });
    assert.equal(logged.filter((u) => u.includes('players_wl')).length, 2);
  } finally {
    ws.done();
  }
});

test('the player request carries the active-players filter and no cookie', async () => {
  const ws = workspace();
  try {
    const fake = createFakeEspnFetch();
    let init;
    const spy = async (url, i) => ((init = i), fake(url, i));
    await client({ playerCache: createDiskPlayerCache({ dataDir: ws.dir }), secrets: SECRETS, fetch: spy }).made.players();
    assert.equal(init.headers['x-fantasy-filter'], JSON.stringify({ filterActive: { value: true } }));
    assert.equal(init.headers.cookie, undefined);
  } finally {
    ws.done();
  }
});

test('a stale or unreadable player cache is fetched again', async () => {
  const ws = workspace();
  try {
    const { made, logged } = client({ playerCache: createDiskPlayerCache({ dataDir: ws.dir }) });
    await made.players();
    const cachePath = join(ws.dir, 'cache', 'players-espn-2026.json');
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(cachePath, old, old);
    await made.players();
    assert.equal(logged.length, 2);
    // Corrupt it: fresh by age, unreadable by content.
    writeFileSync(cachePath, '{not json');
    const again = await made.players();
    assert.ok(Array.isArray(again));
    assert.equal(logged.length, 3);
  } finally {
    ws.done();
  }
});

test('a malformed player list is refused and never cached', async () => {
  const ws = workspace();
  try {
    const stub = async () => new Response(JSON.stringify([{ id: 1, fullName: 'No Slots' }]), { status: 200 });
    await assert.rejects(client({ playerCache: createDiskPlayerCache({ dataDir: ws.dir }), fetch: stub }).made.players(), (error) => {
      assert.ok(error instanceof EspnShapeError);
      assert.equal(error.view, 'players_wl');
      assert.equal(error.path, '(response)[0].defaultPositionId');
      return true;
    });
    assert.ok(!existsSync(join(ws.dir, 'cache', 'players-espn-2026.json')));
  } finally {
    ws.done();
  }
});

test('no cookie value reaches any file written or any URL asked for', async () => {
  const ws = workspace();
  try {
    const { made, logged } = client({ playerCache: createDiskPlayerCache({ dataDir: ws.dir }), leagueId: PRIVATE_LEAGUE_ID, secrets: SECRETS });
    await made.league(['mSettings', 'mTeam']);
    await made.players();
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = walk(ws.dir);
    assert.ok(files.length > 0);
    for (const file of files) noCookies(readFileSync(file, 'utf8'));
    for (const url of logged) noCookies(url);
  } finally {
    ws.done();
  }
});
