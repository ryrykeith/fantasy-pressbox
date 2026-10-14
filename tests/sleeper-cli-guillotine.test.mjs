import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';

// A Sleeper guillotine league through the CLI, end to end, against the fake
// Sleeper API (tests/fixtures/fake-sleeper-api-fetch.mjs). Invented data only;
// nothing touches the network. Guards the regression where a command opened
// the league without the bye-week table, so `grade` threw in a guillotine
// league whenever it captured the week.

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_API = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-sleeper-api-fetch.mjs');
const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID', 'SLEEPER_SEASON', 'SLEEPER_POST_MAX_LENGTH', 'POST_MAX_LENGTH', 'ESPN_LEAGUE_ID',
  'ESPN_S2', 'ESPN_SWID', 'ESPN_ROUTE', 'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'FANTASY_WEEK',
  'DATA_DIR', 'OUTPUT_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', WORKSPACE_ENV_VAR,
];

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

function guillotineFolder() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-sleeper-guillotine-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=guillotine\n`);
  return root;
}

function runCli(root, args) {
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  env.FAKE_SLEEPER_API_LOG = join(root, 'network.log');
  const result = spawnSync(process.execPath, ['--import', FAKE_API, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  return { ...result, said: `${result.stdout}\n${result.stderr}` };
}

test('grade --week 1 in a guillotine league opens with the bye-week table and exits 0', () => {
  const root = guillotineFolder();
  const result = runCli(root, ['grade', '--week', '1']);
  assert.equal(result.status, 0, result.said);
  assert.doesNotMatch(result.said, /bye-week table/);

  // It reached the week's matchups, so captureWeek (the step that needs the table) ran.
  const log = readFileSync(join(root, 'network.log'), 'utf8');
  assert.match(log, /\/matchups\/1$/m);
});
