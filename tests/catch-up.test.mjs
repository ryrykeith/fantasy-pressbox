/**
 * `catch-up` saves every completed week that has no settled snapshot, in
 * ascending order (catchUpWeeks in src/pipeline.mjs).
 *
 * A stand-in Sleeper client records which weeks it was asked for, so "fetched
 * nothing" and "in ascending order" are checked, not assumed. Nothing touches
 * the network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { captureWeek, catchUpWeeks, lastCompletedWeek } from '../src/pipeline.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { normalizePlayers } from '../src/sleeper/normalize.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { PUBLIC_LEAGUE_ID, SEASON } from './fixtures/mock-espn-league.mjs';

const PLAYERS = normalizePlayers({
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF', injury_status: null },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL', injury_status: null },
});

const matchups = (points) => [
  { roster_id: 1, matchup_id: 1, points: points[0], starters: ['qb'], starters_points: [points[0]], players: ['qb'], players_points: { qb: points[0] } },
  { roster_id: 2, matchup_id: 1, points: points[1], starters: ['rb'], starters_points: [points[1]], players: ['rb'], players_points: { rb: points[1] } },
];

const TEAMS = [
  { rosterId: 1, ownerId: 'o1', name: 'Punt Intended', manager: 'm1', record: { wins: 2, losses: 2, ties: 0 }, playerIds: ['qb'] },
  { rosterId: 2, ownerId: 'o2', name: 'Pick Six Appeal', manager: 'm2', record: { wins: 2, losses: 2, ties: 0 }, playerIds: ['rb'] },
];

/** A Sleeper stand-in that lists the weeks it was asked for, in order. */
function stubClient(playedThrough) {
  const asked = [];
  return {
    asked,
    matchups: async (week) => {
      asked.push(week);
      return matchups(week <= playedThrough ? [100 + week, 90 + week] : [0, 0]);
    },
    transactions: async () => [],
  };
}

const league = (lastScoredWeek) => ({
  id: '123',
  season: '2026',
  startingSlots: ['QB', 'RB'],
  format: { type: 'redraft', source: 'declared' },
  lastScoredWeek,
});

/** The context catchUpWeeks takes: what openLeague returns, over a stub client. */
function context({ store = createMemoryStore(), lastScored, through = null, playedThrough = lastScored } = {}) {
  const client = stubClient(playedThrough);
  return { client, store, ctx: { client, store, league: league(lastScored), teams: TEAMS, players: PLAYERS, through } };
}

const summary = ({ weeks }) => weeks.map(({ week, status }) => `${week}:${status}`);

test('weeks 1-4 saved and week 6 completed: saves 5 and 6, and fetches 1-4 never', async () => {
  const store = createMemoryStore();
  for (let week = 1; week <= 4; week += 1) {
    await captureWeek({ ...context({ store, lastScored: 4 }).ctx, week });
  }
  const { client, ctx } = context({ store, lastScored: 6 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(summary(result), ['1:settled', '2:settled', '3:settled', '4:settled', '5:saved', '6:saved']);
  assert.deepEqual(client.asked, [5, 6]);
  assert.ok(store.loadSnapshot('2026', 5) && store.loadSnapshot('2026', 6));
});

test('an empty folder mid-season saves week 1 through the last completed week, ascending', async () => {
  const { client, ctx, store } = context({ lastScored: 4 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(summary(result), ['1:saved', '2:saved', '3:saved', '4:saved']);
  assert.deepEqual(client.asked, [1, 2, 3, 4]);
  assert.equal(result.lastCompleted, 4);
  // The snapshots say they were written after the fact, and are settled records.
  for (let week = 1; week <= 4; week += 1) {
    const snapshot = store.loadSnapshot('2026', week);
    assert.equal(snapshot.backfilled, true);
    assert.equal(snapshot.settled, true);
  }
});

test('--through N stops at week N', async () => {
  const { client, ctx, store } = context({ lastScored: 6, through: 2 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(summary(result), ['1:saved', '2:saved']);
  assert.deepEqual(client.asked, [1, 2]);
  assert.equal(store.loadSnapshot('2026', 3), null);
});

test('a week asked for beyond the last completed one is reported, not fetched', async () => {
  const { client, ctx } = context({ lastScored: 2, through: 4 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(summary(result), ['1:saved', '2:saved', '3:not-completed', '4:not-completed']);
  assert.deepEqual(client.asked, [1, 2]);
});

test('a completed week with no scores is saved and reported as not played', async () => {
  const { ctx } = context({ lastScored: 2, playedThrough: 1 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(summary(result), ['1:saved', '2:not-played']);
});

test('a second run fetches nothing: every week is already settled', async () => {
  const store = createMemoryStore();
  await catchUpWeeks(context({ store, lastScored: 3 }).ctx);
  const again = context({ store, lastScored: 3 });
  const result = await catchUpWeeks(again.ctx);
  assert.deepEqual(summary(result), ['1:settled', '2:settled', '3:settled']);
  assert.deepEqual(again.client.asked, []);
});

test('onWeek hears each week as it finishes, in order', async () => {
  const heard = [];
  const { ctx } = context({ lastScored: 3 });
  await catchUpWeeks({ ...ctx, onWeek: ({ week }) => heard.push(week) });
  assert.deepEqual(heard, [1, 2, 3]);
});

test('before the season starts nothing is completed and nothing is fetched', async () => {
  const { client, ctx } = context({ lastScored: 0 });
  const result = await catchUpWeeks(ctx);
  assert.deepEqual(result.weeks, []);
  assert.deepEqual(client.asked, []);
});

test("a provider with no last scored week is asked for its current week, minus one", async () => {
  const provider = {
    name: 'stub',
    displayName: 'Stub',
    capabilities: { lastScoredWeek: false },
    currentWeek: async () => ({ week: 5, source: 'stub' }),
  };
  assert.equal(await lastCompletedWeek({ provider, league: league(null) }), 4);
});

/* ---------------------------------------------------- ESPN's import route */

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');

test('on the ESPN import route it lists the missing weeks and their pages, and fetches nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-catch-up-'));
  try {
    writeFileSync(
      join(root, '.env'),
      `${['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`, 'LEAGUE_FORMAT=redraft'].join('\n')}\n`,
    );
    const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [] });
    const leaguePage = await (await createFakeEspnFetch()(links.league)).text();
    writeFileSync(join(root, 'league.json'), leaguePage);
    const preload = join(root, 'preload.mjs');
    writeFileSync(preload, "globalThis.fetch = async (url) => { throw new Error('fetch was called: ' + url); };\n");
    const env = { ...process.env };
    for (const key of ['LEAGUE_PROVIDER', 'ESPN_LEAGUE_ID', 'ESPN_ROUTE', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'FANTASY_WEEK', WORKSPACE_ENV_VAR]) {
      delete env[key];
    }
    const run = (args) =>
      spawnSync(process.execPath, ['--import', preload, CLI, ...args, '--workspace', root], { cwd: root, env, encoding: 'utf8' });

    const imported = run(['import-espn', join(root, 'league.json')]);
    assert.equal(imported.status, 0, imported.stdout + imported.stderr);

    const result = run(['catch-up']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Weeks without saved pages: 1, 2, 3, 4\./);
    assert.match(result.stdout, /Nothing was requested from ESPN/);
    const week4 = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [4] }).weeks[0];
    assert.ok(result.stdout.includes(week4.matchups), 'the week 4 matchups address is listed');
    assert.ok(result.stdout.includes(week4.transactions), 'the week 4 transactions address is listed');
    assert.doesNotMatch(result.stdout + result.stderr, /fetch was called/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
