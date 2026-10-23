/**
 * A backward-looking edition saves the earlier weeks that are not on disk
 * before it builds (captureEarlierWeeks in src/pipeline.mjs), so a skipped
 * week is not silently left out of the strength window, rivalry records,
 * player histories, the guillotine ledger or the FAAB market.
 *
 * Decision: the edition captures the missing weeks itself, through catch-up's
 * loop, rather than stopping to name `catch-up`. Sleeper returns past weeks'
 * matchups and transactions accurately, a settled week is never fetched again,
 * and every snapshot written is flagged `backfilled` so its team names (today's)
 * are never read as the names that week went by. On ESPN's import route nothing
 * is fetched: the edition names the pages still to save.
 *
 * Every league here is invented, and nothing touches the network.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { captureEarlierWeeks, captureWeek, openLeague, settledWeeks, weeksWithoutSettledSnapshot } from '../src/pipeline.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { normalizePlayers } from '../src/sleeper/normalize.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { createTeamIdentity } from '../src/teamIdentity.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { installFakeSleeper, LEAGUE_ID, SEASON } from './fixtures/full-season-league.mjs';

/* --------------------------------------------------------- the pipeline */

const PLAYERS = normalizePlayers({
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF', injury_status: null },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL', injury_status: null },
});

const TEAMS = [
  { rosterId: 1, ownerId: 'o1', name: 'Punt Intended', manager: 'm1', record: { wins: 2, losses: 2, ties: 0 }, playerIds: ['qb'] },
  { rosterId: 2, ownerId: 'o2', name: 'Pick Six Appeal', manager: 'm2', record: { wins: 2, losses: 2, ties: 0 }, playerIds: ['rb'] },
];

const matchups = (week) => [
  { roster_id: 1, matchup_id: 1, points: 100 + week, starters: ['qb'], starters_points: [100 + week], players: ['qb'], players_points: { qb: 100 + week } },
  { roster_id: 2, matchup_id: 1, points: 90 + week, starters: ['rb'], starters_points: [90 + week], players: ['rb'], players_points: { rb: 90 + week } },
];

/** A Sleeper stand-in that lists the weeks it was asked for. */
function stubClient() {
  const asked = [];
  return {
    asked,
    matchups: async (week) => {
      asked.push(week);
      return matchups(week);
    },
    transactions: async () => [],
  };
}

const league = (lastScoredWeek) => ({
  id: '123',
  season: SEASON,
  startingSlots: ['QB', 'RB'],
  format: { type: 'redraft', source: 'declared' },
  lastScoredWeek,
});

const contextOf = (store, lastScored, teams = TEAMS) => {
  const client = stubClient();
  return { client, ctx: { client, store, league: league(lastScored), teams, players: PLAYERS } };
};

/** Weeks 1-4 captured after week 4, then week 6 captured after week 6: week 5 was skipped. */
async function skippedWeekFive() {
  const store = createMemoryStore();
  for (let week = 1; week <= 4; week += 1) await captureWeek({ ...contextOf(store, 4).ctx, week });
  await captureWeek({ ...contextOf(store, 6).ctx, week: 6 });
  return store;
}

test('weeks 1-4 and 6 on disk: week 5 is the only week without a settled snapshot', async () => {
  const store = await skippedWeekFive();
  assert.deepEqual(weeksWithoutSettledSnapshot({ store, league: league(6), throughWeek: 5 }), [5]);
});

test('before an edition about week 6, week 5 is captured, flagged backfilled, and enters the strength window', async () => {
  const store = await skippedWeekFive();
  const { client, ctx } = contextOf(store, 6);
  assert.deepEqual(
    settledWeeks({ ...ctx, throughWeek: 6 }).map((entry) => entry.week),
    [1, 2, 3, 4, 6],
  );
  const result = await captureEarlierWeeks({ ...ctx, week: 6 });
  assert.deepEqual(result.missing, [5]);
  assert.deepEqual(result.unsaved, []);
  // Settled weeks already on disk are not fetched again.
  assert.deepEqual(client.asked, [5]);
  assert.equal(store.loadSnapshot(SEASON, 5).backfilled, true);
  assert.equal(store.loadSnapshot(SEASON, 6).backfilled, undefined, 'an ordinary capture is not flagged');
  assert.deepEqual(
    settledWeeks({ ...ctx, throughWeek: 6 }).map((entry) => entry.week),
    [1, 2, 3, 4, 5, 6],
  );
});

test('nothing missing: nothing is fetched', async () => {
  const store = await skippedWeekFive();
  const { client, ctx } = contextOf(store, 6);
  const result = await captureEarlierWeeks({ ...ctx, week: 5 });
  assert.deepEqual(result, { missing: [], weeks: [], unsaved: [] });
  assert.deepEqual(client.asked, []);
});

test('an import route is never asked for a week: the weeks without saved pages come back unsaved', async () => {
  const store = await skippedWeekFive();
  const provider = {
    name: 'stub',
    displayName: 'Stub',
    capabilities: { lastScoredWeek: true },
    savedPages: () => ({ weeks: [1, 2, 3, 4, 6].map((week) => ({ week })) }),
    fetchWeek: async (week) => {
      throw new Error(`fetchWeek was called for week ${week}`);
    },
  };
  const ctx = { provider, store, league: league(8), teams: TEAMS, players: PLAYERS };
  const result = await captureEarlierWeeks({ ...ctx, week: 8 });
  assert.deepEqual(result.missing, [5, 7]);
  assert.deepEqual(result.unsaved, [5, 7]);
  assert.equal(store.loadSnapshot(SEASON, 5), null);
});

/* ------------------------------------------------ published team names */

test("a backfilled snapshot's team names are not read as the names that week went by", async () => {
  const store = createMemoryStore();
  // Weeks 1 and 2 were played while roster 1 was "user4817"; week 1 was captured then.
  const then = [{ ...TEAMS[0], name: 'user4817' }, TEAMS[1]];
  await captureWeek({ ...contextOf(store, 1, then).ctx, week: 1 });
  // Week 2 was skipped, and backfilled after roster 1 renamed and roster 2 took "user4817".
  const atBackfill = [{ ...TEAMS[0], name: 'Punt Intended' }, { ...TEAMS[1], name: 'user4817' }];
  await captureEarlierWeeks({ ...contextOf(store, 3, atBackfill).ctx, week: 3 });
  assert.equal(store.loadSnapshot(SEASON, 2).backfilled, true);
  // Roster 2 has since renamed again, so no team goes by "user4817" now.
  const now = [atBackfill[0], { ...TEAMS[1], name: 'Pick Six Appeal' }];

  const history = store.loadTeamNameHistory(SEASON);
  assert.ok(history.filter((entry) => entry.week === 2).every((entry) => entry.backfilled === true));
  const identity = createTeamIdentity({ teams: now, history });
  // The week 2 ranking said "user4817", and meant roster 1. The backfilled
  // week 2 snapshot says roster 2 held that name, but only at the backfill.
  assert.equal(identity.rosterIdFor('user4817', { week: 2 }), 1);
});

test('createTeamIdentity ignores backfilled entries in the history it is given', () => {
  const identity = createTeamIdentity({
    teams: TEAMS,
    history: [{ week: 2, rosterId: 2, name: 'Old Name', backfilled: true }],
  });
  assert.equal(identity.rosterIdFor('Old Name', { week: 2 }), null);
  assert.deepEqual(identity.lookup('Old Name'), { status: 'unknown' });
});

/* ------------------------------------------------------------- the edition */

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** The full-season fake Sleeper league, logging every matchups address it is asked for. */
function fakeSleeper() {
  installFakeSleeper();
  const inner = globalThis.fetch;
  const weeksAsked = [];
  globalThis.fetch = async (url) => {
    const match = /\/matchups\/(\d+)$/.exec(String(url));
    if (match) weeksAsked.push(Number(match[1]));
    if (!String(url).startsWith('https://api.sleeper.app/')) throw new Error(`not the Sleeper API: ${url}`);
    return inner(url);
  };
  return weeksAsked;
}

function settingsFor() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-earlier-weeks-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${LEAGUE_ID}\nLEAGUE_SEASON=${SEASON}\nLEAGUE_FORMAT=redraft\nLEAGUE_FIRST_SEASON=2026\n`);
  const config = loadConfig({ workspaceRoot: root });
  return { config, settings: { ...config, playerCache: createMemoryPlayerCache() } };
}

test('a rankings run with weeks 1-4 and 6 on disk captures week 5 first, and its strength window includes it', async () => {
  const saved = globalThis.fetch;
  const weeksAsked = fakeSleeper();
  try {
    const { config, settings } = settingsFor();
    const assets = loadDiskAssets({ promptsDir: config.promptsDir });
    const store = createMemoryStore();
    const ctx = await openLeague(settings, { store, assets });
    for (const week of [1, 2, 3, 4, 6]) await captureWeek({ ...ctx, week });
    weeksAsked.length = 0;

    const said = [];
    const prepared = await prepareEdition({
      task: 'rankings',
      week: 6,
      settings,
      store,
      assets,
      log: { say: (line) => said.push(line), warn() {} },
    });
    assert.deepEqual(weeksAsked, [5], 'week 5 fetched once; weeks 1-4 and 6 are settled and never fetched');
    assert.equal(store.loadSnapshot(SEASON, 5).backfilled, true);
    assert.ok(said.some((line) => /^Saved week 5 first: it was not on disk\./.test(line)), said.join('\n'));
    assert.ok(prepared.context.strength.window.weeks.includes(5), JSON.stringify(prepared.context.strength.window));
  } finally {
    globalThis.fetch = saved;
  }
});

test('an edition with every earlier week settled fetches only its own week and says nothing about catching up', async () => {
  const saved = globalThis.fetch;
  const weeksAsked = fakeSleeper();
  try {
    const { config, settings } = settingsFor();
    const assets = loadDiskAssets({ promptsDir: config.promptsDir });
    const store = createMemoryStore();
    const ctx = await openLeague(settings, { store, assets });
    for (const week of [1, 2]) await captureWeek({ ...ctx, week });
    weeksAsked.length = 0;

    const said = [];
    await prepareEdition({ task: 'recap', week: 3, settings, store, assets, log: { say: (line) => said.push(line), warn() {} } });
    assert.deepEqual(weeksAsked, [3]);
    assert.ok(!said.some((line) => /first: /.test(line)));
  } finally {
    globalThis.fetch = saved;
  }
});

/* ----------------------------------------------------- ESPN's import route */

test('on the ESPN import route the edition names the missing pages and fetches nothing', async () => {
  // Built here rather than through the CLI: the import route's provider reads
  // only the store, so a stand-in league page and week pages are enough.
  const { createFakeEspnFetch } = await import('./fixtures/fake-espn-fetch.mjs');
  const { PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON: ESPN_SEASON } = await import('./fixtures/mock-espn-league.mjs');
  const { importSavedFiles } = await import('../src/pipeline.mjs');
  const saved = globalThis.fetch;
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-earlier-weeks-espn-')));
  folders.push(root);
  writeFileSync(
    join(root, '.env'),
    `LEAGUE_PROVIDER=espn\nESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}\nLEAGUE_SEASON=${ESPN_SEASON}\nLEAGUE_FORMAT=redraft\nLEAGUE_FIRST_SEASON=${ESPN_SEASON}\n`,
  );
  const config = loadConfig({ workspaceRoot: root });
  const settings = { ...config, playerCache: createMemoryPlayerCache() };
  const store = createMemoryStore();
  const espnFetch = createFakeEspnFetch();
  const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: ESPN_SEASON, weeks: [SCORED_WEEK] });
  const page = async (url) => (await espnFetch(url)).text();
  importSavedFiles(settings, {
    store,
    week: SCORED_WEEK,
    files: [
      { name: 'league.json', text: await page(links.league) },
      { name: 'matchups.json', text: await page(links.weeks[0].matchups) },
      { name: 'transactions.json', text: await page(links.weeks[0].transactions) },
    ],
  });

  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    throw new Error(`fetch was called: ${url}`);
  };
  try {
    const warnings = [];
    await prepareEdition({
      task: 'recap',
      week: SCORED_WEEK,
      settings,
      store,
      assets: loadDiskAssets({ promptsDir: config.promptsDir }),
      log: { say() {}, warn: (line) => warnings.push(line) },
    });
    const notice = warnings.find((line) => line.startsWith('No pages are saved for'));
    assert.ok(notice, warnings.join('\n'));
    const earlier = Array.from({ length: SCORED_WEEK - 1 }, (_, index) => index + 1);
    const missing = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: ESPN_SEASON, weeks: earlier });
    for (const { matchups, transactions } of missing.weeks) {
      assert.ok(notice.includes(matchups) && notice.includes(transactions), notice);
    }
    assert.match(notice, /Nothing was requested from ESPN/);
    assert.deepEqual(requested.filter((url) => !url.includes('fantasycalc')), []);
    for (const week of earlier) assert.equal(store.loadSnapshot(ESPN_SEASON, week), null);
  } finally {
    globalThis.fetch = saved;
  }
});
