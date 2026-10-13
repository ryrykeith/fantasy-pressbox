import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR, parseEspnRoute } from '../src/config.mjs';
import {
  FIXTURE_COOKIES,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  SCORED_WEEK,
  SEASON,
} from './fixtures/mock-espn-league.mjs';

// Invented fixture cookies only (tests/fixtures/mock-espn-league.mjs).

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');
const COOKIE_VALUES = Object.values(FIXTURE_COOKIES);
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
  'DATA_DIR',
  'OUTPUT_DIR',
  'ANTHROPIC_API_KEY',
  WORKSPACE_ENV_VAR,
];

function workspace(lines) {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-espn-secrets-'));
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
  return root;
}

/** loadConfig over an .env, with the real environment held empty of league keys. */
function load(lines) {
  const root = workspace(lines);
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return loadConfig({ workspaceRoot: root });
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
    rmSync(root, { recursive: true, force: true });
  }
}

const base = (id = PRIVATE_LEAGUE_ID) => ['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${id}`, `LEAGUE_SEASON=${SEASON}`];
const cookies = [`ESPN_S2=${FIXTURE_COOKIES.espn_s2}`, `ESPN_SWID=${FIXTURE_COOKIES.SWID}`];

test('ESPN_ROUTE defaults to import, and parses import and fetch', () => {
  assert.equal(load(base()).league.route, 'import');
  assert.equal(load([...base(), 'ESPN_ROUTE=import']).league.route, 'import');
  assert.equal(load([...base(), 'ESPN_ROUTE=fetch']).league.route, 'fetch');
  assert.equal(load([...base(), 'ESPN_ROUTE=FETCH']).league.route, 'fetch');
});

test('a misspelt ESPN_ROUTE is refused, listing the valid values', () => {
  assert.throws(
    () => load([...base(), 'ESPN_ROUTE=fech']),
    (error) => {
      assert.match(error.message, /"fech"/);
      assert.match(error.message, /import, fetch/);
      return true;
    },
  );
  assert.throws(() => parseEspnRoute('scrape'), /import, fetch/);
});

test('under the import route the cookies are never read, even when set', () => {
  for (const route of [[], ['ESPN_ROUTE=import']]) {
    const config = load([...base(), ...route, ...cookies]);
    assert.deepEqual(config.league.secrets, {});
    const text = JSON.stringify(config);
    for (const value of COOKIE_VALUES) assert.ok(!text.includes(value));
  }
});

test('under the import route one cookie alone is not an error, because it is not read', () => {
  assert.deepEqual(load([...base(), cookies[0]]).league.secrets, {});
});

test('on the fetch route both cookies land in config.league.secrets, and not in process.env', () => {
  const config = load([...base(), 'ESPN_ROUTE=fetch', ...cookies]);
  assert.deepEqual(config.league.secrets, { ESPN_S2: FIXTURE_COOKIES.espn_s2, ESPN_SWID: FIXTURE_COOKIES.SWID });
  assert.equal(process.env.ESPN_S2, undefined);
  assert.equal(process.env.ESPN_SWID, undefined);
});

test('on the fetch route one cookie alone is refused, naming the missing key and no value', () => {
  assert.throws(
    () => load([...base(), 'ESPN_ROUTE=fetch', cookies[0]]),
    (error) => {
      assert.match(error.message, /ESPN_SWID is missing/);
      assert.ok(!error.message.includes(FIXTURE_COOKIES.espn_s2));
      return true;
    },
  );
  assert.throws(
    () => load([...base(), 'ESPN_ROUTE=fetch', cookies[1]]),
    (error) => {
      assert.match(error.message, /ESPN_S2 is missing/);
      assert.ok(!error.message.includes(FIXTURE_COOKIES.SWID));
      return true;
    },
  );
});

test('a public ESPN league needs no cookies, on either route', () => {
  for (const route of [[], ['ESPN_ROUTE=fetch']]) {
    assert.deepEqual(load([...base(PUBLIC_LEAGUE_ID), ...route]).league.secrets, {});
  }
});

test('a Sleeper league carries no route and no secrets, whatever else .env holds', () => {
  const config = load(['SLEEPER_LEAGUE_ID=123', 'ESPN_ROUTE=fetch', ...cookies]);
  assert.equal(config.league.route, null);
  assert.deepEqual(config.league.secrets, {});
});

/* ------------------------------------------------------------- the leak test */

function filesUnder(dir) {
  try {
    return readdirSync(dir, { recursive: true })
      .map((name) => join(dir, name))
      .filter((path) => statSync(path).isFile());
  } catch {
    return [];
  }
}

function runCli(root, args) {
  const env = { ...process.env, FAKE_ESPN_INSTALL: '1' };
  for (const key of ENV_KEYS) delete env[key];
  return spawnSync(process.execPath, ['--import', FAKE_FETCH, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

test('a full ESPN capture and edition on the fetch route leaves no cookie in data/, output/, stdout or stderr', () => {
  const root = workspace([...base(), 'ESPN_ROUTE=fetch', 'LEAGUE_FORMAT=redraft', ...cookies]);
  try {
    const results = ['fetch', 'preview', 'recap'].map((command) => runCli(root, [command, '--week', String(SCORED_WEEK)]));
    // The capture and an edition must have worked, or the search below proves nothing.
    for (const result of results) assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(filesUnder(join(root, 'data')).length > 0, 'the capture wrote nothing');
    assert.ok(filesUnder(join(root, 'output')).length > 0, 'no edition was written');

    for (const result of results) {
      for (const value of COOKIE_VALUES) {
        assert.ok(!result.stdout.includes(value), 'a cookie value reached stdout');
        assert.ok(!result.stderr.includes(value), 'a cookie value reached stderr');
      }
    }
    for (const path of [...filesUnder(join(root, 'data')), ...filesUnder(join(root, 'output'))]) {
      const text = readFileSync(path, 'utf8');
      for (const value of COOKIE_VALUES) assert.ok(!text.includes(value), `a cookie value reached ${path}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wrong cookies on a private league are refused without echoing either value', () => {
  const wrong = ['WRONG-S2-FIXTURE', 'WRONG-SWID-FIXTURE'];
  const root = workspace([...base(), 'ESPN_ROUTE=fetch', `ESPN_S2=${wrong[0]}`, `ESPN_SWID=${wrong[1]}`]);
  try {
    const result = runCli(root, ['fetch', '--week', String(SCORED_WEEK)]);
    assert.notEqual(result.status, 0);
    const said = `${result.stdout}\n${result.stderr}`;
    for (const value of wrong) assert.ok(!said.includes(value));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
