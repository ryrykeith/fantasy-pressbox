/**
 * How long the league itself has run, apart from the publication
 * (src/pipeline.mjs#readLeagueHistory, `context.league.history`).
 *
 * A first Fantasy Pressbox edition for a league in its fourth season once came
 * back framed as the league's first year. Sleeper's previous_league_id chain
 * says how old a league is; it is walked once, cached in the league folder,
 * and replaced by LEAGUE_FIRST_SEASON in .env when the operator says.
 *
 * Nothing touches the network: the chain is served by stand-in clients, and
 * the editions by the fake Sleeper API, wrapped to serve earlier seasons.
 */
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { DECLARED_HISTORY_SOURCE, readLeagueHistory } from '../src/pipeline.mjs';
import { getProvider } from '../src/providers.mjs';
import { parseLeagueFirstSeason } from '../src/settings.mjs';
import { SleeperError } from '../src/sleeper/client.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';

const SLEEPER_SOURCE = "Sleeper (each season's previous_league_id)";

/** Raw Sleeper leagues for a dynasty renewed every year since 2023. */
const RENEWED_CHAIN = {
  2025: { league_id: '2025', season: '2025', previous_league_id: '2024' },
  2024: { league_id: '2024', season: '2024', previous_league_id: '2023' },
  2023: { league_id: '2023', season: '2023', previous_league_id: null },
};

/** A normalized 2026 League naming `previousLeagueId`. */
const league2026 = (previousLeagueId, id = 'current') => ({ id, season: '2026', provider: 'sleeper', previousLeagueId });

/** A stand-in Sleeper client serving `chain` by ID (404 for any other), listing every ID asked for. */
function stubClient(chain) {
  const asked = [];
  return {
    asked,
    leagueId: 'current',
    async leagueById(id) {
      asked.push(id);
      return chain[id] ?? null;
    },
  };
}

const sleeperFor = (client) => getProvider('sleeper').forClient(client);

/* ------------------------------------------------------------- the chain */

test('a Sleeper league renewed from 2023 is in its 4th season in 2026, walked back season by season', async () => {
  const client = stubClient(RENEWED_CHAIN);
  const store = createMemoryStore();
  const history = await readLeagueHistory({ provider: sleeperFor(client), store, league: league2026('2025') });
  assert.deepEqual(history, { firstSeason: 2023, seasonNumber: 4, source: SLEEPER_SOURCE });
  assert.deepEqual(client.asked, ['2025', '2024', '2023']);

  const saved = store.loadLeagueHistory('2026');
  assert.equal(saved.leagueId, 'current');
  assert.deepEqual(
    saved.seasons,
    [2026, 2025, 2024, 2023].map((season) => ({ season, leagueId: season === 2026 ? 'current' : String(season) })),
  );
});

test('the chain is walked once: a second read is the cached one and asks Sleeper nothing', async () => {
  const client = stubClient(RENEWED_CHAIN);
  const store = createMemoryStore();
  const provider = sleeperFor(client);
  await readLeagueHistory({ provider, store, league: league2026('2025') });
  const asked = client.asked.length;
  const again = await readLeagueHistory({ provider, store, league: league2026('2025') });
  assert.deepEqual(again, { firstSeason: 2023, seasonNumber: 4, source: SLEEPER_SOURCE });
  assert.equal(client.asked.length, asked, 'no request after the first walk');
});

test('a cached walk for another league ID is walked again', async () => {
  const store = createMemoryStore();
  store.saveLeagueHistory('2026', { leagueId: 'someone-else', season: 2026, firstSeason: 2010, seasonNumber: 17, source: SLEEPER_SOURCE });
  const client = stubClient(RENEWED_CHAIN);
  const history = await readLeagueHistory({ provider: sleeperFor(client), store, league: league2026('2025') });
  assert.equal(history.firstSeason, 2023);
  assert.equal(client.asked.length, 3);
});

test('a league with no previous_league_id is in its first season, and nothing is fetched', async () => {
  for (const none of [null, '0', '']) {
    const client = stubClient(RENEWED_CHAIN);
    const history = await readLeagueHistory({ provider: sleeperFor(client), store: createMemoryStore(), league: league2026(none) });
    assert.deepEqual(history, { firstSeason: 2026, seasonNumber: 1, source: SLEEPER_SOURCE }, JSON.stringify(none));
    assert.deepEqual(client.asked, []);
  }
});

test('a broken chain is unavailable, naming why, and is not cached', async () => {
  const cases = [
    // 2024 names a league Sleeper does not know.
    [{ ...RENEWED_CHAIN, 2024: { ...RENEWED_CHAIN[2024], previous_league_id: '1999' } }, /The 2024 league names 1999 as its previous season, and Sleeper has no league/],
    // A season that is not earlier than the one naming it.
    [{ ...RENEWED_CHAIN, 2024: { ...RENEWED_CHAIN[2024], season: '2025' } }, /reports that league's season as "2025", which is not an earlier year/],
    // A loop.
    [{ ...RENEWED_CHAIN, 2023: { ...RENEWED_CHAIN[2023], season: '2023', previous_league_id: '2025' } }, /loops back on itself at league 2025/],
  ];
  for (const [chain, reason] of cases) {
    const store = createMemoryStore();
    const history = await readLeagueHistory({ provider: sleeperFor(stubClient(chain)), store, league: league2026('2025') });
    assert.match(history.unavailable, reason);
    assert.equal(store.loadLeagueHistory('2026'), null, 'a failed walk is tried again next time');
  }
});

test('a chain Sleeper cannot be reached for is unavailable; a bug is not swallowed', async () => {
  const offline = { leagueId: 'current', leagueById: async () => { throw new SleeperError('Could not reach Sleeper.'); } };
  const history = await readLeagueHistory({ provider: sleeperFor(offline), store: createMemoryStore(), league: league2026('2025') });
  assert.match(history.unavailable, /could not be read: Could not reach Sleeper/);

  const broken = { leagueId: 'current', leagueById: async () => { throw new TypeError('a bug'); } };
  await assert.rejects(readLeagueHistory({ provider: sleeperFor(broken), store: createMemoryStore(), league: league2026('2025') }), TypeError);
});

test('an ESPN league is unavailable, naming LEAGUE_FIRST_SEASON', async () => {
  const history = await readLeagueHistory({
    provider: getProvider('espn'),
    store: createMemoryStore(),
    league: { id: '1', season: '2026', provider: 'espn' },
  });
  assert.match(history.unavailable, /ESPN does not report a league's earlier seasons.*LEAGUE_FIRST_SEASON/);
});

/* ---------------------------------------------------------- the override */

test('LEAGUE_FIRST_SEASON replaces the chain, a broken chain and an ESPN league, and fetches nothing', async () => {
  const config = { leagueFirstSeason: 2021 };
  const expected = { firstSeason: 2021, seasonNumber: 6, source: DECLARED_HISTORY_SOURCE };

  const client = stubClient(RENEWED_CHAIN);
  assert.deepEqual(await readLeagueHistory({ provider: sleeperFor(client), store: createMemoryStore(), league: league2026('2025'), config }), expected);
  const broken = stubClient({});
  assert.deepEqual(await readLeagueHistory({ provider: sleeperFor(broken), store: createMemoryStore(), league: league2026('2025'), config }), expected);
  assert.deepEqual(client.asked.concat(broken.asked), []);

  const espn = { id: '1', season: '2026', provider: 'espn' };
  assert.deepEqual(await readLeagueHistory({ provider: getProvider('espn'), store: createMemoryStore(), league: espn, config }), expected);
});

test('LEAGUE_FIRST_SEASON after the league season is refused', async () => {
  await assert.rejects(
    readLeagueHistory({ provider: sleeperFor(stubClient({})), store: createMemoryStore(), league: league2026(null), config: { leagueFirstSeason: 2027 } }),
    /LEAGUE_FIRST_SEASON in \.env is 2027, after this league's 2026 season/,
  );
});

test('LEAGUE_FIRST_SEASON is a four-digit year, or empty', () => {
  assert.equal(parseLeagueFirstSeason(undefined), null);
  assert.equal(parseLeagueFirstSeason(' '), null);
  assert.equal(parseLeagueFirstSeason(' 2023 '), 2023);
  for (const bad of ['23', 'twenty', '2023.5', '1899', '20233']) {
    assert.throws(() => parseLeagueFirstSeason(bad), /LEAGUE_FIRST_SEASON in \.env is .*, which is not a season/, bad);
  }
});

/* --------------------------------------------------- through an edition */

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** A Sleeper league folder for the fake API's league, with extra .env lines. */
function loadLeague(env = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-league-history-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=redraft\n${env}`);
  return loadConfig({ workspaceRoot: root });
}

// The fake API serves the 2026 league only. Wrapped: the 2026 league names
// `previous` as its previous season, and any other league is served from
// `earlier` (404 when absent), each request listed in `asked`.
await import('./fixtures/fake-sleeper-api-fetch.mjs');
const fakeApi = globalThis.fetch;
const served = { previous: null, earlier: {}, asked: [] };
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const id = /\/league\/(\d+)$/.exec(String(url))?.[1];
  if (id && id !== FAKE_LEAGUE_ID) {
    served.asked.push(id);
    return served.earlier[id] ? json(served.earlier[id]) : new Response('null', { status: 404 });
  }
  const response = await fakeApi(url);
  return id ? json({ ...(await response.json()), previous_league_id: served.previous }) : response;
};
beforeEach(() => {
  Object.assign(served, { previous: null, earlier: {}, asked: [] });
});

async function rankings(config, store = createMemoryStore()) {
  const warnings = [];
  const prepared = await prepareEdition({
    task: 'rankings',
    week: 1,
    settings: { ...config, playerCache: createMemoryPlayerCache() },
    store,
    assets: loadDiskAssets({ promptsDir: config.promptsDir }),
    log: { say() {}, warn: (line) => warnings.push(line) },
  });
  return { ...prepared, warnings };
}

const entry = (context, field) => context.unavailable.find((item) => item.field === field);

test('a renewed league: the context says its 4th season, and the first edition says the league is not new', async () => {
  served.previous = '2025';
  served.earlier = RENEWED_CHAIN;
  const store = createMemoryStore();
  const { context, prompt } = await rankings(loadLeague(), store);
  assert.deepEqual(context.league.history, { firstSeason: 2023, seasonNumber: 4, source: SLEEPER_SOURCE });
  assert.equal(entry(context, 'leagueHistory'), undefined);

  const first = entry(context, 'previousRankings');
  assert.match(first.why, /this is the first Fantasy Pressbox edition for this league\./);
  assert.match(first.why, /The league itself is not new: 2026 is its 4th season \(it started in 2023\)\./);
  assert.match(first.instruction, /Do not call this the league's first season and do not describe the league as new/);
  assert.match(first.instruction, /Describe nothing from its earlier seasons/);

  // The system prompt carries the rule, whatever the context says.
  assert.match(prompt, /Call this the league's first season, its debut or its inaugural year only\s+when `seasonNumber` is 1/);
  assert.match(prompt, /Nothing from an earlier season is on file: no champions, no standings, no\s+trades/);

  // A second edition reads the cache: no request for an earlier season.
  served.asked = [];
  const again = await rankings(loadLeague(), store);
  assert.deepEqual(again.context.league.history, context.league.history);
  assert.deepEqual(served.asked, []);
});

test('a first-season league: seasonNumber 1, and the first edition says so', async () => {
  const { context, warnings } = await rankings(loadLeague());
  assert.deepEqual(context.league.history, { firstSeason: 2026, seasonNumber: 1, source: SLEEPER_SOURCE });
  assert.match(entry(context, 'previousRankings').why, /This is also the league's first season \(2026\)\./);
  assert.doesNotMatch(entry(context, 'previousRankings').instruction, /not new/);
  assert.deepEqual(served.asked, []);
  assert.deepEqual(warnings.filter((line) => /league has run/.test(line)), []);
});

test('a broken chain: the context gets an unavailable entry, the operator a warning', async () => {
  served.previous = '2025';
  served.earlier = { 2025: RENEWED_CHAIN[2025] };
  const { context, warnings } = await rankings(loadLeague());
  assert.match(context.league.history.unavailable, /The 2025 league names 2024 as its previous season/);
  const missing = entry(context, 'leagueHistory');
  assert.match(missing.why, /The 2025 league names 2024/);
  assert.match(missing.instruction, /Do not say how many seasons this league has run, when it started, or that this is its first season/);
  assert.match(entry(context, 'previousRankings').instruction, /Do not say whether the league itself is new/);
  assert.match(warnings.join('\n'), /How long the league has run is not known/);
});

test('LEAGUE_FIRST_SEASON in .env replaces a broken chain in the edition, and asks Sleeper nothing', async () => {
  served.previous = '2025';
  const { context } = await rankings(loadLeague('LEAGUE_FIRST_SEASON=2020\n'));
  assert.deepEqual(context.league.history, { firstSeason: 2020, seasonNumber: 7, source: DECLARED_HISTORY_SOURCE });
  assert.equal(entry(context, 'leagueHistory'), undefined);
  assert.match(entry(context, 'previousRankings').why, /2026 is its 7th season \(it started in 2020\)/);
  assert.deepEqual(served.asked, []);
});
