import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { EspnStaleLeagueError, leaguePageFreshness } from '../src/espn/import.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { importSavedFiles, openLeague } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

/** The file store for a league folder's config, as the CLI makes it. */
const storeOf = (config) => createStore({ dataDir: config.dataDir });
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON } from './fixtures/mock-espn-league.mjs';

// A stale league page on ESPN_ROUTE=import (owner decision 2026-10-13: refuse).
// The operator imports the league page early, then only each week's two pages.
// The league page holds the standings, records, points-for and rosters, so a
// league page saved at period 3 beside a week-5 page saved at period 6 would
// put week 5's scores next to week-2 standings. Every edition refuses instead.
//
// Everything runs on the invented fixtures (tests/fixtures/mock-espn-league.mjs).

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

const STALE_PERIOD = 3;
const WEEK = SCORED_WEEK + 1; // 5
const WEEK_SAVED_AT = WEEK + 1; // 6

const LINKS = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [WEEK] });

function writeEnv(root, extra = []) {
  const lines = ['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`, 'LEAGUE_FORMAT=redraft', ...extra];
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
}

function leagueFolder(extra = []) {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-espn-stale-'));
  writeEnv(root, extra);
  return root;
}

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

/**
 * The fixture's week-4 pages moved to week 5: every period-4 stat, matchup
 * period and transaction becomes week 5's, and the page is saved at `savedAt`.
 */
function asWeek(text, { from = SCORED_WEEK, to = WEEK, savedAt = WEEK_SAVED_AT } = {}) {
  const body = JSON.parse(text, (key, value) =>
    (key === 'scoringPeriodId' || key === 'matchupPeriodId') && value === from ? to : value,
  );
  return JSON.stringify({ ...body, scoringPeriodId: savedAt });
}

const savedAtPeriod = (text, period) => JSON.stringify({ ...JSON.parse(text), scoringPeriodId: period });

/** The pages a person would save: the fake API's answers at the import addresses. */
async function fixturePages() {
  const fetch = createFakeEspnFetch();
  const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [SCORED_WEEK] });
  const text = async (url) => (await fetch(url)).text();
  const league = await text(links.league);
  const matchups = await text(links.weeks[0].matchups);
  const transactions = await text(links.weeks[0].transactions);
  return {
    staleLeague: savedAtPeriod(league, STALE_PERIOD),
    freshLeague: savedAtPeriod(league, WEEK_SAVED_AT),
    matchups: asWeek(matchups),
    transactions: asWeek(transactions),
  };
}

function save(root, name, text) {
  const path = join(root, name);
  writeFileSync(path, text);
  return path;
}

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

/** A league page saved at period 3, then week 5's two pages saved at period 6. */
async function importStale(root) {
  const pages = await fixturePages();
  const league = save(root, 'league-early.json', pages.staleLeague);
  const first = runCli(root, ['import-espn', league]);
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  const matchups = save(root, 'week5-matchups.json', pages.matchups);
  const transactions = save(root, 'week5-transactions.json', pages.transactions);
  const weekly = runCli(root, ['import-espn', '--week', String(WEEK), matchups, transactions]);
  assert.equal(weekly.status, 0, `${weekly.stdout}\n${weekly.stderr}`);
  return { pages, weekly };
}

// --- The check ---------------------------------------------------------------------

test('leaguePageFreshness: a league page behind a week page is stale, and says which page is newer', () => {
  const bundle = (week, matchups, transactions = null) => ({
    week,
    matchups: { scoringPeriodId: matchups },
    transactions: transactions === null ? null : { scoringPeriodId: transactions },
  });
  assert.deepEqual(leaguePageFreshness({ league: { scoringPeriodId: 3 }, bundles: [bundle(2, 3), bundle(5, 6)] }), {
    leaguePeriod: 3,
    latestPeriod: 6,
    stale: true,
    latestFrom: { kind: 'week', week: 5 },
  });
  // Saved in the same sitting as the week pages: current.
  assert.equal(leaguePageFreshness({ league: { scoringPeriodId: 6 }, bundles: [bundle(5, 6, 6)] }).stale, false);
  // A transactions page alone can be the newest.
  assert.equal(leaguePageFreshness({ league: { scoringPeriodId: 6 }, bundles: [bundle(5, 6, 7)] }).stale, true);
  // An older league page saved over a newer one.
  assert.deepEqual(leaguePageFreshness({ league: { scoringPeriodId: 4 }, bundles: [], seen: 5 }).latestFrom, { kind: 'league' });
  assert.equal(leaguePageFreshness({ league: { scoringPeriodId: 4 } }).stale, false);
});

// --- Editions refuse ----------------------------------------------------------------

test('on the import route every edition refuses a league page older than the latest week page', async () => {
  const root = leagueFolder();
  try {
    await importStale(root);
    for (const command of ['preview', 'recap', 'rankings', 'preseason-rankings', 'transactions', 'fetch']) {
      const result = runCli(root, [command, '--week', String(WEEK)]);
      const out = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0, `${command} did not refuse:\n${out}`);
      assert.match(result.stderr, /league page \(standings and rosters\) was saved at scoring period 3/, command);
      assert.match(result.stderr, /latest week page \(week 5\) at scoring period 6/, command);
      assert.match(result.stderr, /Save the league page again/, command);
      assert.ok(result.stderr.includes(LINKS.league), `${command} does not name the league address`);
      assert.match(result.stderr, /import-espn <the saved files>/, command);
      assert.ok(!out.includes('fetch was called'), command);
    }
    // In process, the refusal is its own error.
    await assert.rejects(openLeague(configFor(root), { store: storeOf(configFor(root)) }), EspnStaleLeagueError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("import-espn reports a stale league page and prints the week's full set of addresses", async () => {
  const root = leagueFolder();
  try {
    const { weekly } = await importStale(root);
    assert.match(weekly.stdout, /The league page is out of date/);
    assert.match(weekly.stdout, /saved at scoring period 3/);
    assert.match(weekly.stdout, /latest week page \(week 5\) at scoring period 6/);
    for (const address of [LINKS.league, LINKS.weeks[0].matchups, LINKS.weeks[0].transactions]) {
      assert.ok(weekly.stdout.includes(address), `missing ${address}`);
    }
    assert.match(weekly.stdout, /import-espn --week 5 <the saved files>/);
    // Nothing is captured from the stale page.
    assert.ok(!/Week 5 saved/.test(weekly.stdout));
    assert.ok(!weekly.stdout.includes('fetch was called'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doctor on the import route shows each saved page\'s period and flags a stale league page', async () => {
  const root = leagueFolder();
  try {
    const { pages } = await importStale(root);
    const stale = runCli(root, ['doctor']);
    assert.equal(stale.status, 1, `${stale.stdout}\n${stale.stderr}`);
    assert.match(stale.stdout, /league page: scoring period 3 ✗ behind the latest saved page \(scoring period 6\)/);
    assert.match(stale.stdout, /week 5: matchups scoring period 6, transactions scoring period 6/);
    assert.ok(stale.stdout.includes(LINKS.league));
    assert.ok(!/Everything looks good/.test(stale.stdout));

    const imported = runCli(root, ['import-espn', save(root, 'league-now.json', pages.freshLeague)]);
    assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`);
    const fresh = runCli(root, ['doctor']);
    assert.equal(fresh.status, 0, `${fresh.stdout}\n${fresh.stderr}`);
    assert.match(fresh.stdout, /league page: scoring period 6 ✓/);
    assert.match(fresh.stdout, /Everything looks good/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('saving the league page again clears the refusal', async () => {
  const root = leagueFolder();
  try {
    const { pages } = await importStale(root);
    assert.notEqual(runCli(root, ['recap', '--week', String(WEEK)]).status, 0);

    const imported = runCli(root, ['import-espn', save(root, 'league-now.json', pages.freshLeague)]);
    assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`);
    assert.ok(!/out of date/.test(imported.stdout));

    const recap = runCli(root, ['recap', '--week', String(WEEK)]);
    assert.equal(recap.status, 0, `${recap.stdout}\n${recap.stderr}`);
    assert.ok(!`${recap.stdout}${recap.stderr}`.includes('fetch was called'));
    const ctx = await openLeague(configFor(root), { store: storeOf(configFor(root)) });
    assert.equal(ctx.league.lastScoredWeek, WEEK);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the fetch route is unaffected: it reads the league live, whatever was imported', async (t) => {
  const root = leagueFolder();
  try {
    const pages = await fixturePages();
    const config = configFor(root);
    importSavedFiles(config, { store: storeOf(config), files: [{ file: 'league.json', text: pages.staleLeague }] });
    importSavedFiles(config, { store: storeOf(config),
      files: [
        { file: 'matchups.json', text: pages.matchups },
        { file: 'transactions.json', text: pages.transactions },
      ],
      week: WEEK,
    });
    await assert.rejects(openLeague(config, { store: storeOf(config) }), EspnStaleLeagueError);

    writeEnv(root, ['ESPN_ROUTE=fetch']);
    const real = globalThis.fetch;
    globalThis.fetch = createFakeEspnFetch();
    t.after(() => {
      globalThis.fetch = real;
    });
    const ctx = await openLeague(configFor(root), { store: storeOf(configFor(root)) });
    assert.equal(ctx.league.currentWeek, SCORED_WEEK + 1);
    assert.equal(ctx.provider.savedPages, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
