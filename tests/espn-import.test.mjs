import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { createClient } from '../src/espn/client.mjs';
import { EspnImportError, MAX_IMPORT_BYTES, importedPlayers, parseSavedFile } from '../src/espn/import.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { NAME_UNAVAILABLE } from '../src/league/players.mjs';
import { captureWeek, importSavedFiles, openLeague } from '../src/pipeline.mjs';
import { buildContext } from '../src/promptContext.mjs';
import { createStore } from '../src/store.mjs';

/** The file store for a league folder's config, as the CLI makes it. */
const storeOf = (config) => createStore({ dataDir: config.dataDir });
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  LEAGUE_BY_ID,
  PLAYERS_WL,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  SCORED_WEEK,
  SEASON,
} from './fixtures/mock-espn-league.mjs';

// Everything here runs on the invented fixtures (tests/fixtures/mock-espn-league.mjs).
// The "saved pages" are what the fake ESPN API answers at the addresses
// espnImportLinks lists: nothing is a real league, and nothing touches the network.

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID',
  'SLEEPER_SEASON',
  'ESPN_LEAGUE_ID',
  'ESPN_S2',
  'ESPN_SWID',
  'ESPN_ROUTE',
  'LEAGUE_PROVIDER',
  'LEAGUE_SEASON',
  'LEAGUE_FORMAT',
  'FANTASY_WEEK',
  'DATA_DIR',
  'OUTPUT_DIR',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  WORKSPACE_ENV_VAR,
];

/** A league folder for an ESPN league, with no cookies unless `extra` adds them. */
function leagueFolder(leagueId = PUBLIC_LEAGUE_ID, extra = []) {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-espn-import-'));
  const lines = ['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${leagueId}`, `LEAGUE_SEASON=${SEASON}`, ...extra];
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
  return root;
}

/** loadConfig for a folder, with no league key taken from this shell. */
function configFor(root) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return loadConfig({ workspaceRoot: root });
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  }
}

/** The pages a person would save: the fake API's answers at the import addresses. */
async function savedPages(leagueId = PUBLIC_LEAGUE_ID, week = SCORED_WEEK) {
  const fetch = createFakeEspnFetch();
  const links = espnImportLinks({ leagueId, season: SEASON, weeks: [week] });
  const text = async (url) => (await fetch(url)).text();
  return {
    league: await text(links.league),
    matchups: await text(links.weeks[0].matchups),
    transactions: await text(links.weeks[0].transactions),
  };
}

/** Writes pages into the league folder, as the operator would save them. → their paths. */
function savePages(root, pages) {
  return Object.fromEntries(
    Object.entries(pages).map(([kind, text]) => {
      const path = join(root, `${kind}.json`);
      writeFileSync(path, text);
      return [kind, path];
    }),
  );
}

const asFiles = (paths) => Object.values(paths).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

/** A fetch that fails the test if anything calls it. */
function forbidFetch(t) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    throw new Error(`fetch was called under ESPN_ROUTE=import: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  return calls;
}

const withoutSavedAt = ({ savedAt, ...rest }) => rest;

// --- Addresses ---------------------------------------------------------------

test('espnImportLinks lists exactly the league requests the client makes, both per week', async () => {
  const asked = [];
  const client = createClient({
    leagueId: PUBLIC_LEAGUE_ID,
    season: SEASON,
    dataDir: mkdtempSync(join(tmpdir(), 'pressbox-espn-links-')),
    fetch: createFakeEspnFetch({ log: (url) => asked.push(url) }),
  });
  const provider = espnProvider.forClient(client);
  await provider.openLeague();
  await provider.fetchWeek(SCORED_WEEK);

  const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [SCORED_WEEK] });
  const leagueRequests = asked.filter((url) => url.includes('/leagues/'));
  assert.deepEqual(
    [...leagueRequests].sort(),
    [links.league, links.weeks[0].matchups, links.weeks[0].transactions].sort(),
  );
  assert.deepEqual(links.weeks.map((w) => w.week), [SCORED_WEEK]);
  // The player list is the one request a browser visit cannot make (it needs a header), so it is not listed.
  assert.ok(asked.some((url) => url.includes('players_wl')));
  assert.ok(!JSON.stringify(links).includes('players_wl'));
});

test('espnImportLinks gives two addresses for every week asked for', () => {
  const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [1, 2, 3] });
  assert.equal(links.weeks.length, 3);
  for (const { week, matchups, transactions } of links.weeks) {
    assert.ok(matchups.endsWith(`scoringPeriodId=${week}`));
    assert.ok(transactions.includes('view=mTransactions2'));
    assert.ok(transactions.endsWith(`scoringPeriodId=${week}`));
  }
  assert.throws(() => espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: '26' }), /four-digit/);
  assert.throws(() => espnImportLinks({ leagueId: '', season: SEASON }), /league ID/);
});

test('the client builds its addresses with the shared URL module', () => {
  const client = readFileSync(join(PACKAGE_ROOT, 'src', 'espn', 'client.mjs'), 'utf8');
  assert.match(client, /from '\.\/urls\.mjs'/);
  assert.ok(!client.includes('segments/0/leagues'), 'the client builds a league address of its own');
});

// --- Node-free ------------------------------------------------------------------

/** Every relative module `entry` imports, transitively, with the node: specifiers each one names. */
function importGraph(entry) {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    const specifiers = [...code.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    seen.set(file, specifiers.filter((s) => s.startsWith('node:') || !s.startsWith('.')));
    for (const s of specifiers) if (s.startsWith('.')) visit(resolve(dirname(file), s));
  };
  visit(entry);
  return seen;
}

test('the parse and normalize modules the import path uses import nothing from node:', () => {
  for (const entry of ['import.mjs', 'urls.mjs', 'normalize.mjs', 'shape.mjs', 'codes.mjs']) {
    const graph = importGraph(join(PACKAGE_ROOT, 'src', 'espn', entry));
    assert.ok(graph.size >= 1);
    for (const [file, outside] of graph) assert.deepEqual(outside, [], `${file} imports ${outside.join(', ')}`);
  }
  // The guard sees the graph it guards: import.mjs reaches the normalizer and the shared player module.
  const files = [...importGraph(join(PACKAGE_ROOT, 'src', 'espn', 'import.mjs')).keys()];
  assert.ok(files.some((f) => f.endsWith(join('espn', 'normalize.mjs'))));
  assert.ok(files.some((f) => f.endsWith(join('league', 'players.mjs'))));
});

// --- The same snapshot as the fetch route ------------------------------------------

/** The fake API, but with every rostered player in players_wl, so the fetch route can name everyone. */
function fetchWithFullPlayerList(leagueId) {
  const inner = createFakeEspnFetch();
  const rostered = LEAGUE_BY_ID[leagueId].league.views.mRoster.teams.flatMap((t) =>
    t.roster.entries.map((e) => e.playerPoolEntry.player),
  );
  const byId = new Map([...PLAYERS_WL, ...rostered].map((p) => [p.id, p]));
  return async (input, init) => {
    if (new URL(String(input)).pathname.endsWith('/players')) {
      return new Response(JSON.stringify([...byId.values()]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return inner(input, init);
  };
}

test('importing the saved league and week pages gives the same snapshot as the fetch route', async (t) => {
  // The fetch route below is handed its own fetch; the global one must never be called.
  const calls = forbidFetch(t);
  for (const leagueId of [PUBLIC_LEAGUE_ID, ROLLING_LEAGUE_ID]) {
    const fetched = mkdtempSync(join(tmpdir(), 'pressbox-espn-fetched-'));
    const root = leagueFolder(leagueId);
    try {
      // The fetch route, through a client on the fake API.
      const client = createClient({ leagueId, season: SEASON, dataDir: fetched, fetch: fetchWithFullPlayerList(leagueId) });
      const fetchProvider = espnProvider.forClient(client);
      const fetchCtx = await fetchProvider.openLeague();
      const fetchStore = createStore({ dataDir: fetched });
      await captureWeek({ provider: fetchProvider, store: fetchStore, ...fetchCtx, week: SCORED_WEEK });

      // The import route, from the same pages saved to files, with fetch forbidden.
      const pages = savePages(root, await savedPages(leagueId));
      const config = configFor(root);
      assert.equal(config.league.route, 'import');
      const imported = importSavedFiles(config, { store: storeOf(config), files: asFiles(pages), week: SCORED_WEEK });
      assert.equal(imported.transactionsUnavailable, false);
      const ctx = await openLeague(config, { store: storeOf(config) });
      const result = await captureWeek({ ...ctx, week: SCORED_WEEK });
      assert.equal(result.kept, false);
      assert.deepEqual(calls, []);

      assert.deepEqual(ctx.league, fetchCtx.league);
      assert.deepEqual(ctx.teams, fetchCtx.teams);
      const fromFetch = fetchStore.loadSnapshot(String(SEASON), SCORED_WEEK);
      const fromImport = ctx.store.loadSnapshot(String(SEASON), SCORED_WEEK);
      assert.ok(fromImport.analysis.games.length > 0);
      assert.deepEqual(withoutSavedAt(fromImport), withoutSavedAt(fromFetch));

      // The raw bundle is saved under the league folder's data/, tagged espn, as fetchWeek's is.
      const raw = ctx.store.loadRaw(String(SEASON), SCORED_WEEK);
      assert.equal(raw.provider, 'espn');
      assert.ok(result.rawPath.startsWith(join(root, 'data')));
      assert.ok(ctx.store.importedLeaguePath(String(SEASON)).startsWith(join(root, 'data')));
    } finally {
      rmSync(fetched, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// --- Nothing calls fetch ------------------------------------------------------------

test('under ESPN_ROUTE=import, openLeague, fetchWeek, currentWeek and a capture never call fetch', async (t) => {
  const root = leagueFolder(PUBLIC_LEAGUE_ID, ['ESPN_ROUTE=import']);
  try {
    const pages = savePages(root, await savedPages());
    const calls = forbidFetch(t);
    const config = configFor(root);
    const provider = espnProvider.fromConfig(config, { store: storeOf(config) });

    // Before anything is imported: refusals that name the import, never a request.
    await assert.rejects(provider.openLeague(), (e) => e instanceof EspnImportError && /import-espn/.test(e.message));
    await assert.rejects(provider.currentWeek(), /has not been imported/);
    await assert.rejects(provider.fetchWeek(SCORED_WEEK), (e) => {
      const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [SCORED_WEEK] });
      return (
        /Week 4 has not been imported/.test(e.message) &&
        e.message.includes(links.weeks[0].matchups) &&
        e.message.includes(links.weeks[0].transactions) &&
        e.message.includes(`import-espn --week ${SCORED_WEEK}`)
      );
    });

    provider.importFiles({ files: asFiles(pages), week: SCORED_WEEK });
    const opened = await provider.openLeague();
    assert.equal(opened.league.currentWeek, SCORED_WEEK + 1);
    assert.equal(opened.league.lastScoredWeek, SCORED_WEEK);
    assert.deepEqual(await provider.currentWeek(), { week: SCORED_WEEK + 1, source: 'ESPN (the latest saved page)' });
    const week = await provider.fetchWeek(SCORED_WEEK);
    assert.deepEqual(Object.keys(week), ['importedAt', 'leagueId', 'week', 'matchups', 'transactions']);
    // A week not imported is refused, not fetched.
    await assert.rejects(provider.fetchWeek(SCORED_WEEK + 1), /Week 5 has not been imported/);

    // A caller that wraps "the client" again still gets the import instance.
    const rewrapped = espnProvider.forClient(provider.client, { league: opened.league });
    assert.equal(rewrapped.route, 'import');
    assert.deepEqual(await rewrapped.currentWeek({ league: { currentWeek: null } }), {
      week: SCORED_WEEK + 1,
      source: 'ESPN (the latest saved page)',
    });

    const ctx = await openLeague(config, { store: storeOf(config) });
    await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.deepEqual(calls, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('import works with no cookies set, and never reads cookies left in .env', async (t) => {
  const cookies = [`ESPN_S2=${FIXTURE_COOKIES.espn_s2}`, `ESPN_SWID=${FIXTURE_COOKIES.SWID}`];
  for (const extra of [[], cookies]) {
    const root = leagueFolder(PRIVATE_LEAGUE_ID, extra);
    try {
      // The private fixture league answers its pages only with cookies, as a signed-in browser would have them.
      const fetch = createFakeEspnFetch();
      const links = espnImportLinks({ leagueId: PRIVATE_LEAGUE_ID, season: SEASON, weeks: [SCORED_WEEK] });
      const cookie = `espn_s2=${FIXTURE_COOKIES.espn_s2}; SWID=${FIXTURE_COOKIES.SWID}`;
      const text = async (url) => (await fetch(url, { headers: { cookie } })).text();
      const pages = savePages(root, {
        league: await text(links.league),
        matchups: await text(links.weeks[0].matchups),
        transactions: await text(links.weeks[0].transactions),
      });

      const calls = forbidFetch(t);
      const config = configFor(root);
      assert.deepEqual(config.league.secrets, {});
      importSavedFiles(config, { store: storeOf(config), files: asFiles(pages), week: SCORED_WEEK });
      const ctx = await openLeague(config, { store: storeOf(config) });
      const result = await captureWeek({ ...ctx, week: SCORED_WEEK });
      assert.equal(result.analysis.games.length, 6);
      assert.deepEqual(calls, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// --- Refusals ---------------------------------------------------------------------

test('a file for another league, a non-object, a prototype key, a wrong shape or an oversized file is refused, naming the file', async () => {
  const root = leagueFolder();
  try {
    const config = configFor(root);
    const provider = espnProvider.fromConfig(config, { store: storeOf(config) });
    const pages = await savedPages();
    const refuses = (name, text, pattern, week = SCORED_WEEK) => {
      const file = join(root, name);
      assert.throws(
        () => provider.importFiles({ files: [{ file, text }], week }),
        (e) => e instanceof EspnImportError && e.message.includes(file) && pattern.test(e.message),
        name,
      );
    };

    // Another league's page, and one with no league ID at all.
    refuses('other-league.json', (await savedPages(ROLLING_LEAGUE_ID)).league, /another ESPN league/);
    const noId = JSON.parse(pages.league);
    delete noId.id;
    refuses('no-id.json', JSON.stringify(noId), /names no league ID/);
    // The league ID found is not echoed.
    assert.throws(
      () => provider.importFiles({ files: [{ file: 'x.json', text: JSON.stringify({ ...noId, id: 4242424242 }) }] }),
      (e) => !e.message.includes('4242424242'),
    );
    // Another season.
    refuses('old-season.json', JSON.stringify({ ...JSON.parse(pages.league), seasonId: SEASON - 1 }), /2025 season/);

    // Not a JSON object.
    refuses('list.json', '[1, 2, 3]', /must hold a JSON object.*it holds a list/);
    refuses('null.json', 'null', /must hold a JSON object/);
    refuses('page.html', '<html><body>ESPN</body></html>', /is not JSON/);

    // Prototype keys, at the top or deep inside.
    refuses('proto.json', pages.league.replace('{', '{"__proto__":{"polluted":true},'), /key named "__proto__"/);
    refuses('constructor.json', pages.league.replace('"settings":{', '"settings":{"constructor":{},'), /key named "constructor"/);
    refuses('prototype.json', pages.matchups.replace('"schedule":[', '"prototype":1,"schedule":['), /key named "prototype"/);
    assert.equal({}.polluted, undefined);

    // A wrong shape: the guard's message, with the file named in front.
    const broken = JSON.parse(pages.league);
    delete broken.settings.size;
    refuses('broken.json', JSON.stringify(broken), /settings\.size is missing/);
    refuses('neither.json', JSON.stringify({ id: Number(PUBLIC_LEAGUE_ID), seasonId: SEASON }), /not one of the ESPN pages/);

    // Too large: refused before it is parsed.
    refuses('huge.json', ' '.repeat(MAX_IMPORT_BYTES + 1), /larger than 20 MB/);
    assert.throws(() => parseSavedFile(`"${'é'.repeat(MAX_IMPORT_BYTES / 2)}"`, { file: 'wide.json' }), /wide\.json is larger/);

    // Nothing was saved by any refused import.
    for (const kind of ['import', 'raw']) assert.ok(!existsSync(join(config.dataDir, kind)), `${kind}/ was written`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the week comes from the operator, and the saved page must agree with it', async () => {
  const root = leagueFolder();
  try {
    const provider = espnProvider.fromConfig(configFor(root), { store: storeOf(configFor(root)) });
    const pages = await savedPages();
    const files = (week, kinds = ['league', 'matchups']) =>
      kinds.map((kind) => ({ file: join(root, `${kind}.json`), text: pages[kind] }));

    // A week page with no --week: ESPN's body does not say which week was asked for.
    assert.throws(() => provider.importFiles({ files: files(null) }), /must be given: add --week/);
    // Week 20 is in none of the league's matchup periods.
    assert.throws(() => provider.importFiles({ files: files(20), week: 20 }), /week 20 is in none of this league's matchup periods/);
    // Week 3's lineups were not saved: the page holds week 4's.
    assert.throws(() => provider.importFiles({ files: files(3), week: 3 }), /does not hold the lineups for week 3/);
    // Week 4's transactions imported as week 3's.
    assert.throws(
      () => provider.importFiles({ files: [{ file: join(root, 'transactions.json'), text: pages.transactions }], week: 3 }),
      /not the transactions address for week 3/,
    );
    // Two league pages at once.
    assert.throws(() => provider.importFiles({ files: [...files(4, ['league']), ...files(4, ['league'])] }), /are both the league address/);
    // A week before any league page.
    assert.throws(() => provider.importFiles({ files: files(4, ['matchups']), week: 4 }), /league page has not been imported/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Transactions and players -------------------------------------------------------

test('a week imported without its transactions page has transactions unavailable, never empty', async (t) => {
  const root = leagueFolder();
  try {
    const pages = await savedPages();
    forbidFetch(t);
    const config = configFor(root);
    const imported = importSavedFiles(config, { store: storeOf(config),
      files: [
        { file: 'league.json', text: pages.league },
        { file: 'matchups.json', text: pages.matchups },
      ],
      week: SCORED_WEEK,
    });
    assert.equal(imported.transactionsUnavailable, true);
    const ctx = await openLeague(config, { store: storeOf(config) });
    const captured = await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.equal(captured.transactionsUnavailable, true);
    assert.deepEqual(captured.transactions, []);
    assert.equal(ctx.store.loadRaw(String(SEASON), SCORED_WEEK).transactions, null);

    // The prompt says the moves are unknown, not that there were none.
    const context = buildContext({
      task: 'recap',
      config,
      league: ctx.league,
      teams: ctx.teams,
      players: ctx.players,
      week: SCORED_WEEK,
      weekAnalysis: captured.analysis,
      transactions: captured.transactions,
      transactionsUnavailable: captured.transactionsUnavailable,
    });
    const entry = context.unavailable.find((u) => u.field === 'transactions');
    assert.match(entry.why, /not in the league data on file/);
    assert.match(entry.instruction, /do not say the week was quiet/);
    assert.ok(!context.unavailable.some((u) => /No completed transactions were found/.test(u.why)));

    // Importing the transactions page later fills them in, keeping the saved matchups.
    importSavedFiles(config, { store: storeOf(config), files: [{ file: 'transactions.json', text: pages.transactions }], week: SCORED_WEEK });
    const again = await captureWeek({ ...(await openLeague(config, { store: storeOf(config) })), week: SCORED_WEEK });
    assert.equal(again.transactionsUnavailable, undefined);
    assert.equal(again.transactions.length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a player met only in a transaction has his name unavailable, never his ESPN ID", async () => {
  const root = leagueFolder();
  try {
    const pages = await savedPages();
    const config = configFor(root);
    importSavedFiles(config, { store: storeOf(config),
      files: Object.entries(pages).map(([kind, text]) => ({ file: `${kind}.json`, text })),
      week: SCORED_WEEK,
    });
    const ctx = await openLeague(config, { store: storeOf(config) });
    const captured = await captureWeek({ ...ctx, week: SCORED_WEEK });

    // The fixture's free agents (9001111, 9001112) are named only in its transactions.
    for (const id of ['9001111', '9001112']) {
      assert.equal(ctx.players[id].nameUnavailable, true);
      assert.equal(ctx.players[id].name, NAME_UNAVAILABLE);
    }
    const lines = captured.transactions.flatMap((txn) => txn.moves);
    assert.ok(lines.some((line) => line.includes(NAME_UNAVAILABLE)));
    for (const line of lines) assert.ok(!/\b9\d{6}\b/.test(line), `a raw ESPN ID reached: ${line}`);

    // Rostered players are named from the saved rosters and lineups.
    const rostered = LEAGUE_BY_ID[PUBLIC_LEAGUE_ID].league.views.mRoster.teams[0].roster.entries[0].playerPoolEntry.player;
    assert.equal(ctx.players[String(rostered.id)].name, rostered.fullName);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the newest saved record of a player wins, and the league page wins a tie', () => {
  const player = (fullName, proTeamId) => ({ id: 77, fullName, defaultPositionId: 4, eligibleSlots: [4, 20], proTeamId });
  const league = { scoringPeriodId: 5, teams: [{ roster: { entries: [{ playerPoolEntry: { player: player('Older Name', 1) } }] } }] };
  const week = (period, name) => ({
    matchups: {
      scoringPeriodId: period,
      schedule: [{ home: { rosterForCurrentScoringPeriod: { entries: [{ playerPoolEntry: { player: player(name, 2) } }] } } }],
    },
    transactions: null,
  });
  assert.equal(importedPlayers({ league, bundles: [week(7, 'Newest Name')] })['77'].name, 'Newest Name');
  assert.equal(importedPlayers({ league, bundles: [week(3, 'Stale Name')] })['77'].name, 'Older Name');
  assert.equal(importedPlayers({ league, bundles: [week(5, 'Same Period')] })['77'].name, 'Older Name');
});

// --- Settling ----------------------------------------------------------------------------

test('a week saved while still being played stays unsettled until a later save shows the period has moved on', async (t) => {
  const root = leagueFolder();
  try {
    const pages = await savedPages();
    // Saved during week 4: every page says the current scoring period is 4.
    const during = (text) => JSON.stringify({ ...JSON.parse(text), scoringPeriodId: SCORED_WEEK });
    forbidFetch(t);
    const config = configFor(root);
    importSavedFiles(config, { store: storeOf(config),
      files: [
        { file: 'league.json', text: during(pages.league) },
        { file: 'matchups.json', text: during(pages.matchups) },
        { file: 'transactions.json', text: during(pages.transactions) },
      ],
      week: SCORED_WEEK,
    });
    let ctx = await openLeague(config, { store: storeOf(config) });
    assert.equal(ctx.league.currentWeek, SCORED_WEEK);
    assert.equal(ctx.league.lastScoredWeek, SCORED_WEEK - 1);
    await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.equal(ctx.store.loadSnapshot(String(SEASON), SCORED_WEEK).settled, false);

    // A later save of the league page shows period 5: week 4 is now settled.
    importSavedFiles(config, { store: storeOf(config), files: [{ file: 'league.json', text: pages.league }] });
    ctx = await openLeague(config, { store: storeOf(config) });
    assert.equal(ctx.league.lastScoredWeek, SCORED_WEEK);
    const result = await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.equal(result.kept, false);
    assert.equal(ctx.store.loadSnapshot(String(SEASON), SCORED_WEEK).settled, true);

    // Re-importing an older page never un-settles it. That page is now behind
    // what an earlier save showed, so editions refuse it; opened to report on
    // it, the season has still not moved backwards.
    importSavedFiles(config, { store: storeOf(config), files: [{ file: 'league.json', text: during(pages.league) }] });
    await assert.rejects(openLeague(config, { store: storeOf(config) }), /an earlier save of the league page showed scoring period 5/);
    ctx = await openLeague(config, { store: storeOf(config), allowStaleLeague: true });
    assert.equal(ctx.league.lastScoredWeek, SCORED_WEEK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- The command ---------------------------------------------------------------------------

/** Runs the CLI with a fetch that fails loudly, so any network call shows. */
function runCli(root, args) {
  const preload = join(root, 'no-fetch.mjs');
  writeFileSync(preload, "globalThis.fetch = async (url) => { throw new Error('fetch was called: ' + url); };\n");
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  return spawnSync(process.execPath, ['--import', preload, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

test('import-espn imports the saved pages and a recap is built from them, with nothing fetched', async () => {
  const root = leagueFolder(PUBLIC_LEAGUE_ID, ['LEAGUE_FORMAT=redraft']);
  try {
    const pages = savePages(root, await savedPages());

    const usage = runCli(root, ['import-espn']);
    assert.notEqual(usage.status, 0);
    assert.ok(usage.stderr.includes(espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON }).league));

    const imported = runCli(root, ['import-espn', '--week', String(SCORED_WEEK), pages.league, pages.matchups, pages.transactions]);
    assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`);
    assert.match(imported.stdout, /nothing was requested from ESPN/);
    assert.match(imported.stdout, /Week 4 saved/);
    assert.match(imported.stdout, /scores are in/);

    const recap = runCli(root, ['recap', '--week', String(SCORED_WEEK)]);
    assert.equal(recap.status, 0, `${recap.stdout}\n${recap.stderr}`);
    assert.ok(!`${recap.stdout}${recap.stderr}`.includes('fetch was called'));

    // A week not imported is refused with the addresses, not fetched.
    const preview = runCli(root, ['preview', '--week', String(SCORED_WEEK + 1)]);
    assert.notEqual(preview.status, 0);
    assert.match(preview.stderr, /Week 5 has not been imported/);
    assert.ok(!preview.stderr.includes('fetch was called'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('import-espn refuses a file inside the package folder, and a Sleeper or fetch-route folder', async () => {
  const root = leagueFolder();
  try {
    const inside = runCli(root, ['import-espn', join(PACKAGE_ROOT, 'package.json')]);
    assert.notEqual(inside.status, 0);
    assert.match(inside.stderr, /inside the Fantasy Pressbox package folder/);
    assert.ok(inside.stderr.includes(join(PACKAGE_ROOT, 'package.json')));

    writeFileSync(join(root, '.env'), `LEAGUE_PROVIDER=espn\nESPN_ROUTE=fetch\nESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}\nLEAGUE_SEASON=${SEASON}\n`);
    const fetchRoute = runCli(root, ['import-espn', 'league.json']);
    assert.notEqual(fetchRoute.status, 0);
    assert.match(fetchRoute.stderr, /ESPN_ROUTE is fetch/);

    writeFileSync(join(root, '.env'), 'SLEEPER_LEAGUE_ID=1234567890\n');
    const sleeper = runCli(root, ['import-espn', 'league.json']);
    assert.notEqual(sleeper.status, 0);
    assert.match(sleeper.stderr, /Sleeper league/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the transactions command refuses a week whose transactions were not imported', async () => {
  const root = leagueFolder(PUBLIC_LEAGUE_ID, ['LEAGUE_FORMAT=redraft']);
  try {
    const pages = savePages(root, await savedPages());
    const imported = runCli(root, ['import-espn', '--week', String(SCORED_WEEK), pages.league, pages.matchups]);
    assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`);
    assert.match(imported.stdout, /moves\s+unavailable/);

    const result = runCli(root, ['transactions', '--week', String(SCORED_WEEK)]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /transactions are not on file/);
    assert.ok(!/no completed transactions/.test(result.stdout));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Docs ----------------------------------------------------------------------------------

test('docs/espn-data.md labels the private-league browser visit as unverified', () => {
  const doc = readFileSync(join(PACKAGE_ROOT, 'docs', 'espn-data.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## Importing saved files'));
  assert.ok(section.length > 0 && doc.includes('## Importing saved files'));
  assert.match(section, /private league[^\n|]*\|\s*\*\*Unverified\.?\*\*/i);
});
