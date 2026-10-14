import test from 'node:test';
import assert from 'node:assert/strict';

import { leagueFileFromWorkspace, openLeague, parseLeagueFile, serializeLeagueFile } from '../src/core/index.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { openLeague as openLeagueOnAnySurface } from '../src/pipeline.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON } from './fixtures/mock-espn-league.mjs';

// Owner decision 2026-10-13: core supports ESPN on the import route only. The
// cookie fetch (ESPN_ROUTE=fetch) belongs to the command line alone, so core's
// openLeague refuses it in refuseCliOnly's words before a client exists. The
// static half of this guard, which pins every way core could reach the ESPN
// client, is in tests/core-purity.test.mjs.

/** An ESPN league file on the fetch route, as the website could be handed one. */
function fetchRouteLeagueFile() {
  const env = [
    'LEAGUE_PROVIDER=espn',
    `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`,
    `LEAGUE_SEASON=${SEASON}`,
    'ESPN_ROUTE=fetch',
    'LEAGUE_FORMAT=redraft',
  ].join('\n');
  const { leagueFile } = leagueFileFromWorkspace([{ path: '.env', text: `${env}\n` }], { surface: 'cli' });
  return parseLeagueFile(serializeLeagueFile(leagueFile));
}

/** The settings a surface opens that league file with. A league file carries no cookies. */
function settingsFrom(file) {
  assert.equal(file.settings.espnRoute, 'fetch', 'the league file carries the fetch route');
  return {
    league: {
      provider: file.league.provider,
      id: file.league.leagueId,
      season: file.settings.season,
      route: file.settings.espnRoute,
    },
    leagueFormat: file.settings.format,
  };
}

/** Replaces the global fetch with one that records each call and throws. */
function forbidFetch(t) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`a request was made to ${url}`);
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  return calls;
}

test("core's openLeague refuses an ESPN league file on the fetch route before any request, in refuseCliOnly's words", async (t) => {
  const calls = forbidFetch(t);
  const settings = settingsFrom(fetchRouteLeagueFile());
  for (const surface of [undefined, 'core', 'web']) {
    const options = surface === undefined ? {} : { surface };
    await assert.rejects(openLeague(settings, { store: createMemoryStore(), ...options }), (error) => {
      assert.equal(
        error.message,
        'This ESPN league is read with ESPN_ROUTE=fetch, which only the command line can build an edition from: ' +
          "the cookie fetch is automated access to ESPN you opted into under ESPN's terms, with your ESPN_S2 and " +
          'ESPN_SWID cookies, and only the command line makes it. ' +
          'Here, editions are built from the pages you saved from ESPN (ESPN_ROUTE=import).',
      );
      return true;
    });
  }
  assert.deepEqual(calls, [], 'the fetch was never called');
});

test("core's openLeague refuses any ESPN route that is not import, since the provider fetches on all of them", async (t) => {
  // src/espn/provider.mjs fromConfig reads saved pages only for route 'import'
  // (or none) and builds the cookie client for anything else, so a guard that
  // refused only the exact value 'fetch' would let these through to ESPN.
  const calls = forbidFetch(t);
  for (const route of ['FETCH', '', 'cookie']) {
    const settings = { league: { provider: 'espn', id: PUBLIC_LEAGUE_ID, season: SEASON, route }, leagueFormat: null };
    await assert.rejects(openLeague(settings, { store: createMemoryStore() }), (error) => {
      assert.match(error.message, /ESPN_ROUTE must be "import" or "fetch"/);
      assert.match(error.message, /Here, editions are built from the pages you saved from ESPN \(ESPN_ROUTE=import\)/);
      return true;
    });
  }
  assert.deepEqual(calls, [], 'the fetch was never called');
});

test("core's openLeague opens the import route, the default, off the command line", async (t) => {
  const calls = forbidFetch(t);
  for (const route of [undefined, null, 'import']) {
    const settings = { league: { provider: 'espn', id: PUBLIC_LEAGUE_ID, season: SEASON, route }, leagueFormat: null };
    // Nothing is imported into the empty store, so the provider refuses for
    // that reason, naming import-espn — not the surface guard.
    await assert.rejects(openLeague(settings, { store: createMemoryStore() }), /import-espn/);
  }
  assert.deepEqual(calls, []);
});

test("core's openLeague still opens the fetch route for the command line", async (t) => {
  const real = globalThis.fetch;
  globalThis.fetch = createFakeEspnFetch();
  t.after(() => {
    globalThis.fetch = real;
  });
  const ctx = await openLeague(settingsFrom(fetchRouteLeagueFile()), { store: createMemoryStore(), surface: 'cli' });
  assert.equal(String(ctx.league.id), PUBLIC_LEAGUE_ID);
  assert.equal(ctx.league.currentWeek, SCORED_WEEK + 1);
});

test("core exports the surface-checked openLeague, not pipeline.mjs's", () => {
  assert.notEqual(openLeague, openLeagueOnAnySurface);
});
