import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { createClient } from '../src/espn/client.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { captureWeek, isSettledSnapshot } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { MULTI_WEEK_LEAGUE_ID, PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON } from './fixtures/mock-espn-league.mjs';

// An ESPN matchup period that covers more than one NFL week (the
// MULTI_WEEK_LEAGUE_ID fixture: period 4 covers weeks 4 and 5) has no single
// week's score. normalizeWeek gives every roster a null score and marks the
// week with `multiWeekMatchup`. These tests hold captureWeek to never turn
// those nulls into zeros, and every edition that reads the week's analysis to
// refuse the week, naming the reason (docs/plans/espn-football.md, decision 12).

const MULTI_WEEK = SCORED_WEEK; // 4, the first week of the two-week period
const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');

function tempDir(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

async function openFixture(leagueId, dataDir) {
  const client = createClient({ leagueId, season: SEASON, fetch: createFakeEspnFetch() });
  const provider = espnProvider.forClient(client);
  const ctx = await provider.openLeague();
  return { provider, store: createStore({ dataDir }), ...ctx };
}

test('captureWeek on a multi-week ESPN week saves no analysis, so no team is given 0 points for a null score', async () => {
  const dataDir = tempDir('pressbox-espn-multiweek-');
  try {
    const ctx = await openFixture(MULTI_WEEK_LEAGUE_ID, dataDir);
    const result = await captureWeek({ ...ctx, week: MULTI_WEEK });

    assert.equal(result.analysis, null);
    assert.equal(result.played, false);
    assert.deepEqual(result.multiWeekMatchup, { matchupPeriod: 4, weeks: [4, 5] });
    // The raw bundle is still saved: it is the record of what ESPN said.
    assert.ok(existsSync(result.rawPath));

    const snapshot = ctx.store.loadSnapshot(String(SEASON), MULTI_WEEK);
    assert.ok(!('analysis' in snapshot), 'no analysis is saved for a week with no single score');
    assert.deepEqual(snapshot.multiWeekMatchup, { matchupPeriod: 4, weeks: [4, 5] });
    assert.equal(snapshot.played, false);
    // Nothing anywhere in the snapshot holds a team's week at 0 points.
    assert.ok(!JSON.stringify(snapshot).includes('"teamWeeks"'));
    // The team names are kept, as every snapshot keeps them.
    assert.equal(snapshot.teams.length, ctx.teams.length);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a settled multi-week snapshot read back still says it is multi-week, with no analysis', async () => {
  const dataDir = tempDir('pressbox-espn-multiweek-settled-');
  try {
    const ctx = await openFixture(MULTI_WEEK_LEAGUE_ID, dataDir);
    await captureWeek({ ...ctx, week: MULTI_WEEK });
    const stored = ctx.store.loadSnapshot(String(SEASON), MULTI_WEEK);
    // ESPN has scored week 4, so this capture is the week's record.
    assert.equal(ctx.league.lastScoredWeek, MULTI_WEEK);
    assert.equal(isSettledSnapshot(stored, ctx.league), true);

    const again = await captureWeek({ ...ctx, week: MULTI_WEEK });
    assert.equal(again.kept, true);
    assert.equal(again.analysis, null);
    assert.deepEqual(again.multiWeekMatchup, { matchupPeriod: 4, weeks: [4, 5] });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a single-week ESPN week is analyzed as before and carries no multi-week marker', async () => {
  const dataDir = tempDir('pressbox-espn-singleweek-');
  try {
    const ctx = await openFixture(PUBLIC_LEAGUE_ID, dataDir);
    const result = await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.equal(result.analysis.games.length, 6);
    assert.ok(!('multiWeekMatchup' in result));
    const snapshot = ctx.store.loadSnapshot(String(SEASON), SCORED_WEEK);
    assert.ok(snapshot.analysis);
    assert.ok(!('multiWeekMatchup' in snapshot));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------- editions, through the CLI */

/** An ESPN league folder for the multi-week fixture, on the fetch route (the fake API answers it). */
function espnWorkspace() {
  const root = tempDir('pressbox-espn-multiweek-cli-');
  writeFileSync(
    join(root, '.env'),
    `LEAGUE_PROVIDER=espn\nESPN_ROUTE=fetch\nESPN_LEAGUE_ID=${MULTI_WEEK_LEAGUE_ID}\nLEAGUE_SEASON=${SEASON}\nLEAGUE_FORMAT=redraft\n`,
  );
  return root;
}

/** Runs the CLI against the fake ESPN API, with no league taken from this shell. */
function runCli(args, root) {
  const env = { ...process.env, FAKE_ESPN_INSTALL: '1' };
  for (const key of [
    'SLEEPER_LEAGUE_ID',
    'SLEEPER_SEASON',
    'ESPN_LEAGUE_ID',
    'ESPN_S2',
    'ESPN_SWID',
    'ESPN_ROUTE',
    'LEAGUE_PROVIDER',
    'LEAGUE_SEASON',
    'LEAGUE_FORMAT',
    'DATA_DIR',
    'OUTPUT_DIR',
    'ANTHROPIC_API_KEY',
    WORKSPACE_ENV_VAR,
  ]) {
    delete env[key];
  }
  return spawnSync(process.execPath, ['--import', FAKE_FETCH, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

function assertRefusesMultiWeek(result, root) {
  assert.notEqual(result.status, 0, `expected a refusal, got:\n${result.stdout}\n${result.stderr}`);
  const said = `${result.stdout}\n${result.stderr}`;
  assert.match(said, /matchup period 4/);
  assert.match(said, /weeks 4 and 5/);
  assert.match(said, /more than one NFL week/);
  // No edition was written.
  const output = join(root, 'output');
  assert.deepEqual(existsSync(output) ? readdirSync(output, { recursive: true }) : [], []);
}

// preview, recap, rankings (weekly and postseason both run as `rankings`) and
// grade read the captured week's analysis. chop-recap and survival-rankings do
// too, but a guillotine league is refused on ESPN before a week is captured.
for (const command of ['preview', 'recap', 'rankings', 'grade']) {
  test(`${command} refuses a multi-week ESPN week, naming the reason`, () => {
    const root = espnWorkspace();
    try {
      const result = runCli([command, '--week', String(MULTI_WEEK)], root);
      assertRefusesMultiWeek(result, root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('fetch saves a multi-week week and says it has no single score, not that every score is zero', () => {
  const root = espnWorkspace();
  try {
    const result = runCli(['fetch', '--week', String(MULTI_WEEK)], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /multi-week matchup period/);
    assert.match(result.stdout, /matchup period 4, which covers NFL weeks 4 and 5/);
    assert.doesNotMatch(result.stdout, /all scores are zero/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('transactions does not read the week\'s analysis, and does not refuse a multi-week week for it', () => {
  const root = espnWorkspace();
  try {
    const result = runCli(['transactions', '--week', String(MULTI_WEEK)], root);
    const said = `${result.stdout}\n${result.stderr}`;
    assert.doesNotMatch(said, /more than one NFL week/);
    const snapshot = JSON.parse(readFileSync(join(root, 'data', 'snapshots', String(SEASON), `week-${MULTI_WEEK}.json`), 'utf8'));
    assert.ok(!('analysis' in snapshot));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
