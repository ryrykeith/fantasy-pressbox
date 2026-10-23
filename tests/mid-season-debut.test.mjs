/**
 * A league that starts coverage mid-season (the operator's second league began
 * in week 7) gets a first edition that says so, a strength rating that admits
 * a short sample, and a doctor that names `catch-up` for the weeks not on disk.
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
import { describeInspection, inspectLeague } from '../src/inspect.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { installFakeSleeper, LEAGUE_ID, SEASON } from './fixtures/full-season-league.mjs';

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** A rankings edition for `week` against an empty store: nothing recorded, nothing on disk. */
async function firstRankings(week) {
  const saved = globalThis.fetch;
  installFakeSleeper();
  try {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-debut-')));
    folders.push(root);
    writeFileSync(
      join(root, '.env'),
      `SLEEPER_LEAGUE_ID=${LEAGUE_ID}\nLEAGUE_SEASON=${SEASON}\nLEAGUE_FORMAT=redraft\nLEAGUE_FIRST_SEASON=2026\n`,
    );
    const config = loadConfig({ workspaceRoot: root });
    const { context } = await prepareEdition({
      task: 'rankings',
      week,
      settings: { ...config, playerCache: createMemoryPlayerCache() },
      store: createMemoryStore(),
      assets: loadDiskAssets({ promptsDir: config.promptsDir }),
      log: { say() {}, warn() {} },
    });
    return context;
  } finally {
    globalThis.fetch = saved;
  }
}

const entry = (context, field) => context.unavailable.find((item) => item.field === field);

test('a week 6 ranking with nothing recorded is a mid-season debut', async () => {
  const note = entry(await firstRankings(6), 'previousRankings');
  assert.match(note.why, /first Fantasy Pressbox edition for this league, and it arrives 5 weeks into the season/);
  assert.match(note.instruction, /Print no movement arrows/);
  assert.match(note.instruction, /arriving 5 weeks into the season, and introduce the publication/);
  assert.match(note.instruction, /judge the season so far from the records, points scored and the weeks on file/);
});

test('a week 2 ranking says one week, not "1 weeks"', async () => {
  const note = entry(await firstRankings(2), 'previousRankings');
  assert.match(note.why, /arrives 1 week into the season/);
});

test('a week 1 ranking keeps the existing first-edition note', async () => {
  const note = entry(await firstRankings(1), 'previousRankings');
  assert.doesNotMatch(note.why, /into the season/);
  assert.match(note.instruction, /there is nothing to move from/);
});

test('a strength window shorter than lineup_weeks carries a note naming how many weeks it holds', async () => {
  const context = await firstRankings(2);
  const { weeks, lineupWeeks } = context.strength.window;
  assert.ok(weeks.length < lineupWeeks, JSON.stringify(context.strength.window));
  const note = entry(context, 'strengthWindow');
  assert.match(note.why, new RegExp(`last ${lineupWeeks} weeks, but only ${weeks.length} weeks are on file`));
  assert.match(note.instruction, new RegExp(`${weeks.length}-week sample`));
});

test('a full strength window carries no strengthWindow note', async () => {
  const context = await firstRankings(6);
  assert.equal(context.strength.window.weeks.length, context.strength.window.lineupWeeks);
  assert.equal(entry(context, 'strengthWindow'), undefined);
});

/* ------------------------------------------------------------------ doctor */

const TEAMS = [{ rosterId: 1, name: 'Punt Intended' }];
const snapshot = (week, extra = {}) => ({
  week,
  season: SEASON,
  savedAt: `2026-10-0${week}T08:00:00.000Z`,
  played: true,
  settled: true,
  league: { name: 'Mid Table Lounge', detectedFormat: 'redraft' },
  teams: TEAMS,
  analysis: { week, teamWeeks: [] },
  ...extra,
});

function inspected(weeksOnDisk, currentWeek) {
  const store = createMemoryStore();
  for (const week of weeksOnDisk) store.saveSnapshot(SEASON, week, snapshot(week));
  const live = {
    league: { id: LEAGUE_ID, name: 'Mid Table Lounge', season: SEASON, format: { type: 'redraft', detectedType: 'redraft' } },
    week: currentWeek,
    source: 'Sleeper',
  };
  const report = inspectLeague({ store, provider: 'sleeper', leagueId: LEAGUE_ID, season: SEASON, live });
  return { report, lines: describeInspection(report).next.join('\n') };
}

test('doctor on a mid-season league with completed weeks missing names catch-up', () => {
  const { report, lines } = inspected([], 7);
  assert.deepEqual(report.missingWeeks, [1, 2, 3, 4, 5, 6]);
  assert.match(lines, /weeks 1, 2, 3, 4, 5 and 6 are not on disk/);
  assert.match(lines, /fantasy-pressbox catch-up/);
});

test('doctor names only the weeks that are missing, and a backfill-pending week counts', () => {
  const store = createMemoryStore();
  store.saveSnapshot(SEASON, 1, snapshot(1));
  store.saveSnapshot(SEASON, 2, snapshot(2, { settled: false }));
  store.saveSnapshot(SEASON, 3, snapshot(3));
  const live = { league: { id: LEAGUE_ID, name: 'x', season: SEASON, format: { type: 'redraft' } }, week: 4, source: 'Sleeper' };
  const report = inspectLeague({ store, provider: 'sleeper', leagueId: LEAGUE_ID, season: SEASON, live });
  assert.deepEqual(report.missingWeeks, [2]);
  assert.match(describeInspection(report).next.join('\n'), /week 2 is not on disk/);
});

test('doctor says nothing about catch-up when every completed week is on disk, or in week 1', () => {
  assert.doesNotMatch(inspected([1, 2, 3], 4).lines, /catch-up/);
  assert.doesNotMatch(inspected([], 1).lines, /catch-up/);
});
