/**
 * The status report (src/inspect.mjs) that doctor prints and the website shows.
 *
 * Every league here is invented: the fake league ID 000000000000000000, the
 * four-team cast, and ESPN pages built by hand (a scoring period and a week
 * each). Nothing touches the network or the disk.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';

import { describeInspection, inspectLeague, inspectLeagueFile } from '../src/inspect.mjs';
import { newLeagueFile, validateLeagueFile } from '../src/leagueFile.mjs';
import { weeklyEditions } from '../src/options.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';

const ID = '000000000000000000';
const OTHER_ID = '111111111111111111';
const SEASON = '2026';
const CLI_BY = { package: 'fantasy-pressbox', version: '0.2.0', surface: 'cli' };

const TEAMS = [{ rosterId: 1, name: 'Punt Intended' }, { rosterId: 2, name: 'Lowered Expectations' }];
const ranking = (week) => ({
  season: SEASON,
  label: `week-${week}`,
  week,
  publishedAt: `2026-09-${String(10 + week).padStart(2, '0')}T12:00:00.000Z`,
  rankings: TEAMS.map((team, index) => ({ rank: index + 1, team: team.name, rosterId: team.rosterId })),
});
const predictions = (week) => ({
  season: SEASON,
  week,
  savedAt: `2026-09-${String(8 + week).padStart(2, '0')}T12:00:00.000Z`,
  predictions: [{ team_a: 'Punt Intended', team_b: 'Lowered Expectations', predicted_winner: 'Punt Intended' }],
});
const snapshot = (week, extra = {}) => ({
  week,
  season: SEASON,
  savedAt: `2026-09-${String(10 + week).padStart(2, '0')}T08:00:00.000Z`,
  played: true,
  settled: true,
  league: { name: 'Mid Table Lounge', detectedFormat: 'redraft' },
  teams: TEAMS,
  analysis: { week, teamWeeks: [] },
  ...extra,
});

/** A store holding the given weeks of each kind. */
function storeWith({ snapshots = [], predictionWeeks = [], rankingWeeks = [], editions = [] } = {}) {
  const store = createMemoryStore();
  for (const week of snapshots) store.saveSnapshot(SEASON, week, snapshot(week));
  for (const week of predictionWeeks) store.savePredictions(SEASON, week, predictions(week).predictions);
  for (const week of rankingWeeks) store.saveRankings(SEASON, `week-${week}`, ranking(week));
  for (const { week, task, writtenBy } of editions) {
    store.saveEdition(SEASON, week, task, { text: 'the whole reply', from: 'pasted', writtenBy });
  }
  return store;
}

const base = { provider: 'sleeper', leagueId: ID, season: SEASON };

test('a new league: nothing captured, nothing guessed', () => {
  const report = inspectLeague({ ...base, store: createMemoryStore() });
  assert.equal(report.week, null);
  assert.deepEqual(report.coverage, []);
  assert.equal(report.lastWeek, null);
  assert.equal(report.gradable.gradable, false);
  assert.deepEqual(report.thisWeek, { week: null, missing: [] });
  assert.deepEqual(report.problems.map((p) => p.code), ['no-week']);
  assert.equal(report.league.name, null);
  assert.match(describeInspection(report).week.join('\n'), /not known/);
});

test('a new league, online: the provider decides the week and nothing is recorded yet', () => {
  const live = { league: { id: ID, name: 'Mid Table Lounge', season: SEASON, format: { type: 'redraft', detectedType: 'redraft' } }, week: 1, source: 'Sleeper' };
  const report = inspectLeague({ ...base, store: createMemoryStore(), live });
  assert.deepEqual(report.week, { number: 1, live: true, source: 'Sleeper', capturedAt: null });
  assert.equal(report.league.name, 'Mid Table Lounge');
  assert.equal(report.lastWeek, null, 'week 1 has no week before it');
  assert.deepEqual(report.thisWeek.missing, [
    { task: 'preview', when: 'before-games' },
    { task: 'rankings', when: 'after-games' },
  ]);
  assert.deepEqual(report.problems, []);
});

test('offline, mid-season, last week recorded: the last captured week with its date, not live', () => {
  const store = storeWith({
    snapshots: [2, 3, 4],
    predictionWeeks: [3],
    rankingWeeks: [3],
    editions: [{ week: 3, task: 'preview', writtenBy: CLI_BY }],
  });
  const report = inspectLeague({ ...base, store, declaredFormat: null });
  assert.deepEqual(report.week, {
    number: 4,
    live: false,
    source: 'last captured',
    capturedAt: '2026-09-14T08:00:00.000Z',
  });
  assert.equal(report.lastWeek, 3);
  const byTask = Object.fromEntries(report.coverage.map((entry) => [entry.task, entry]));
  assert.equal(byTask.preview.recorded, true);
  assert.deepEqual(byTask.preview.writtenBy, CLI_BY);
  assert.equal(byTask.preview.fullReply, true);
  assert.equal(byTask.rankings.recorded, true);
  assert.equal(byTask.rankings.writtenBy, null, 'a ranking filed without its reply names no writer');
  assert.equal(report.gradable.gradable, true);
  assert.deepEqual(report.thisWeek, {
    week: 4,
    missing: [
      { task: 'preview', when: 'before-games' },
      { task: 'rankings', when: 'after-games' },
    ],
  });

  const lines = describeInspection(report);
  assert.match(lines.week.join('\n'), /Last captured\s+week 4, 2026-09-14 \(not live\)/);
  assert.match(lines.coverage.join('\n'), /preview\s+recorded \d{4}-\d\d-\d\d by cli 0\.2\.0/);
  assert.match(lines.coverage.join('\n'), /can be graded/);
  assert.match(lines.next.join('\n'), /week 4: preview, rankings/);
});

test('mid-season with last week missing: reported as not recorded and not gradable', () => {
  const store = storeWith({ snapshots: [2, 3, 4], rankingWeeks: [2] });
  const report = inspectLeague({ ...base, store });
  assert.equal(report.lastWeek, 3);
  assert.ok(report.coverage.every((entry) => entry.recorded === false));
  assert.deepEqual(report.gradable, { gradable: false, reason: 'no predictions were recorded for week 3' });
  assert.match(describeInspection(report).coverage.join('\n'), /preview\s+not recorded/);
});

test('predictions recorded but the week is not settled are not gradable', () => {
  const store = storeWith({ snapshots: [2, 3], predictionWeeks: [2] });
  store.saveSnapshot(SEASON, 2, snapshot(2, { settled: false }));
  const report = inspectLeague({ ...base, store });
  assert.equal(report.lastWeek, 2);
  assert.deepEqual(report.gradable, { gradable: false, reason: 'week 2 is not settled yet' });
});

test('a declared week is reported as declared, never as live', () => {
  const report = inspectLeague({ ...base, store: storeWith({ snapshots: [2] }), weekOverride: 7 });
  assert.deepEqual(report.week, { number: 7, live: false, source: 'declared', capturedAt: null });
});

test('format: the declaration wins, and the detected one is still shown', () => {
  const store = storeWith({ snapshots: [2] });
  const report = inspectLeague({ ...base, store, declaredFormat: 'dynasty' });
  assert.deepEqual(report.format, { declared: 'dynasty', detected: 'redraft', effective: 'dynasty', winner: 'declared' });
  const detectedOnly = inspectLeague({ ...base, store });
  assert.equal(detectedOnly.format.winner, 'detected');
});

test('a guillotine league is reported against its own editions', () => {
  const store = storeWith({ snapshots: [3] });
  const report = inspectLeague({ ...base, store, declaredFormat: 'guillotine' });
  assert.deepEqual(report.thisWeek.missing.map((m) => m.task), ['survival-preview', 'survival-rankings']);
  assert.deepEqual(
    weeklyEditions('guillotine').map((e) => e.task),
    ['survival-preview', 'chop-recap', 'survival-rankings'],
  );
});

test('a provider that names another league is a mismatch', () => {
  const live = { league: { id: OTHER_ID, name: 'Someone Else', season: SEASON }, week: 3, source: 'Sleeper' };
  const report = inspectLeague({ ...base, store: storeWith({ snapshots: [2] }), live });
  const mismatch = report.problems.find((p) => p.code === 'league-mismatch');
  assert.ok(mismatch);
  assert.match(mismatch.message, new RegExp(`${ID}.*${OTHER_ID}`));
});

test('a league file reports from its own history', () => {
  const file = validateLeagueFile({
    ...newLeagueFile({ provider: 'sleeper', leagueId: ID, surface: 'web', writtenAt: '2026-09-20T00:00:00.000Z' }),
    seasons: {
      [SEASON]: {
        snapshots: { 'week-3': snapshot(3) },
        predictions: { 'week-2': predictions(2) },
      },
    },
  });
  const report = inspectLeagueFile(file);
  assert.equal(report.season, SEASON);
  assert.equal(report.week.number, 3);
  assert.equal(report.week.live, false);
  assert.equal(report.league.name, 'Mid Table Lounge');
  assert.equal(report.lastWeek, 2);
});

/* ------------------------------------------------------------------ ESPN */

const ESPN = { provider: 'espn', leagueId: ID, season: SEASON, espnRoute: 'import', declaredFormat: 'redraft' };

function espnStore({ leaguePeriod = null, weeks = [], seen = null } = {}) {
  const store = createMemoryStore();
  if (leaguePeriod !== null) {
    store.saveImportedLeague(SEASON, {
      provider: 'espn',
      importedAt: '2026-09-30T10:00:00.000Z',
      leagueId: ID,
      seenScoringPeriod: seen ?? leaguePeriod,
      body: { scoringPeriodId: leaguePeriod },
    });
  }
  for (const { week, period } of weeks) {
    store.saveRaw(SEASON, week, {
      provider: 'espn',
      week,
      leagueId: ID,
      importedAt: '2026-09-30T10:05:00.000Z',
      matchups: { scoringPeriodId: period },
      transactions: null,
    });
  }
  return store;
}

test('ESPN import, nothing imported: no week, no guess, and it says so', () => {
  const report = inspectLeague({ ...ESPN, store: espnStore() });
  assert.equal(report.week, null);
  assert.equal(report.espn.route, 'import');
  assert.equal(report.espn.imported, false);
  assert.deepEqual(report.problems.map((p) => p.code), ['nothing-imported']);
  assert.match(describeInspection(report).espn.join('\n'), /nothing imported yet/);
});

test('ESPN import, a week imported: the active week is from the saved pages, marked not live', () => {
  const report = inspectLeague({ ...ESPN, store: espnStore({ leaguePeriod: 3, weeks: [{ week: 3, period: 3 }] }) });
  assert.deepEqual(report.week, {
    number: 3,
    live: false,
    source: 'saved pages',
    capturedAt: '2026-09-30T10:00:00.000Z',
  });
  assert.equal(report.espn.stale, false);
  assert.deepEqual(report.espn.weeks.map((w) => [w.week, w.matchupsPeriod, w.transactionsPeriod]), [[3, 3, null]]);
  assert.deepEqual(report.problems, []);
  const text = describeInspection(report);
  assert.match(text.week.join('\n'), /Current week\s+3 \(from the saved pages, not live/);
  assert.match(text.espn.join('\n'), /league page scoring period 3; weeks 3/);
});

test('ESPN import, a stale league page: reported, with both periods, not hidden', () => {
  const store = espnStore({ leaguePeriod: 2, weeks: [{ week: 5, period: 6 }] });
  const report = inspectLeague({ ...ESPN, store });
  assert.equal(report.espn.stale, true);
  assert.equal(report.week.number, 6, 'the latest saved page still decides the week');
  assert.equal(report.week.live, false);
  const stale = report.problems.find((p) => p.code === 'stale-league-page');
  assert.ok(stale);
  assert.match(stale.message, /scoring period 2.*scoring period 6/);
  assert.match(describeInspection(report).espn.join('\n'), /✗ behind the latest saved page \(scoring period 6\)/);
});

test('ESPN import: a saved league page for another league is a mismatch', () => {
  const store = espnStore({ leaguePeriod: 3, weeks: [{ week: 3, period: 3 }] });
  const record = store.loadImportedLeague(SEASON);
  store.saveImportedLeague(SEASON, { ...record, leagueId: OTHER_ID });
  const report = inspectLeague({ ...ESPN, store });
  assert.ok(report.problems.some((p) => p.code === 'league-mismatch'));
});

/* ---------------------------------------------------------------- doctor */

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_SLEEPER_API = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-sleeper-api-fetch.mjs');
const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** A league folder: a .env, plus `files` ({ relative path: JSON value }). */
function leagueFolder(files = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-inspect-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${ID}\nSLEEPER_SEASON=${SEASON}\n`);
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(value));
  }
  return root;
}

function doctor(root) {
  const env = { ...process.env };
  for (const key of ['SLEEPER_LEAGUE_ID', 'SLEEPER_SEASON', 'FANTASY_WEEK', 'LEAGUE_FORMAT', WORKSPACE_ENV_VAR]) {
    delete env[key];
  }
  const result = spawnSync(process.execPath, ['--import', FAKE_SLEEPER_API, CLI, 'doctor', '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  return { ...result, said: `${result.stdout}\n${result.stderr}` };
}

test('doctor prints the status report for a league folder', () => {
  const root = leagueFolder({
    'data/snapshots/2026/week-2.json': snapshot(2),
    'data/predictions/2026/week-2.json': predictions(2),
  });
  const result = doctor(root);
  assert.equal(result.status, 0, result.said);
  assert.match(result.said, /Current week\s+\d+ \(from /, 'online, the week is the provider\'s');
  assert.match(result.said, /Last week\s+week \d+/);
  assert.match(result.said, /Grading\s+cannot grade: no predictions were recorded for week 1/);
  // The fake league is in week 2, and week 2's preview was recorded above.
  assert.match(result.said, /Not yet recorded\s+week 2: rankings\n/);
});
