import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { LEAGUE_VIEWS, leagueViewsUrl } from '../src/espn/urls.mjs';
import { loadEnvFile } from '../src/lib/env.mjs';
import {
  ESPN_ROUTE_CHOICES,
  defaultFormatType,
  espnFormatChoices,
  extractEspnLeague,
} from '../src/init.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  SEASON,
} from './fixtures/mock-espn-league.mjs';

// Setting up an ESPN league (setup.mjs, with src/init.mjs's decisions). Every
// league, ID, cookie and page here is an invented fixture; nothing is a real
// league, and nothing touches the network.

/* --------------------------------------------------------------- answers */

test('an ESPN league ID is read from a bare ID or from leagueId= in a pasted address', () => {
  assert.deepEqual(extractEspnLeague('1234567'), { leagueId: '1234567', season: '' });
  assert.deepEqual(extractEspnLeague(' 42 '), { leagueId: '42', season: '' });
  assert.deepEqual(extractEspnLeague(undefined), { leagueId: '', season: '' });
  assert.deepEqual(extractEspnLeague('my league'), { leagueId: '', season: '' });
});

test('an address with several numbers gives the league ID and the season, not the others', () => {
  const address = 'https://fantasy.espn.com/football/team?seasonId=2026&teamId=7&leagueId=987654321&week=12';
  assert.deepEqual(extractEspnLeague(address), { leagueId: '987654321', season: '2026' });
  // Sleeper's \d{6,} would take 1700000000 here.
  assert.deepEqual(extractEspnLeague('https://fantasy.espn.com/football/league?x=1700000000&leagueId=55'), {
    leagueId: '55',
    season: '',
  });
  // No leagueId= means no league, however many numbers the address carries.
  assert.deepEqual(extractEspnLeague('https://fantasy.espn.com/football/team?seasonId=2026&teamId=7'), {
    leagueId: '',
    season: '',
  });
});

test('ESPN offers dynasty and redraft only, and says a keeper league counts as redraft', () => {
  const choices = espnFormatChoices({ detectedType: 'redraft', currentType: 'guillotine' });
  assert.deepEqual(choices.map((choice) => choice.value), ['dynasty', 'redraft']);
  assert.match(choices.find((choice) => choice.value === 'redraft').label, /keeper league counts as redraft/);
  assert.doesNotMatch(choices.map((choice) => choice.label).join('\n'), /uillotine|chopped/);
  // A guillotine declaration left from another folder is not offered back.
  assert.equal(
    defaultFormatType({ detectedType: 'redraft', existing: 'guillotine', formats: ['dynasty', 'redraft'] }),
    'redraft',
  );
});

test('import is the first and default ESPN route; fetch is the opt-in', () => {
  assert.deepEqual(ESPN_ROUTE_CHOICES.map((choice) => choice.value), ['import', 'fetch']);
});

/* -------------------------------------------------------- setup, end to end */

const SETUP = join(PACKAGE_ROOT, 'setup.mjs');
const THROWING_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'throwing-fetch.mjs');
const FAKE_ESPN_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');

const tempDir = (prefix = 'pressbox-init-espn-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

/**
 * Runs setup with piped answers. `preload` replaces the global fetch:
 * throwing-fetch (any request fails and is logged) or the stand-in ESPN.
 * The first answer given is the platform's: '2' is ESPN, '' the default.
 */
function runSetup(answers, { workspace, preload, log = null, platform = '2' }) {
  const env = { ...process.env, HOME: tempDir('pressbox-home-') };
  for (const key of [
    'SLEEPER_LEAGUE_ID', 'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'ESPN_LEAGUE_ID', 'ESPN_ROUTE',
    'ESPN_S2', 'ESPN_SWID', 'DATA_DIR', 'OUTPUT_DIR', 'AI_PROVIDER', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
  ]) {
    delete env[key];
  }
  env[WORKSPACE_ENV_VAR] = workspace;
  if (preload === FAKE_ESPN_FETCH) {
    env.FAKE_ESPN_INSTALL = '1';
    if (log) env.FAKE_ESPN_LOG = log;
  } else if (log) {
    env.THROWING_FETCH_LOG = log;
  }
  return spawnSync(process.execPath, ['--import', preload, SETUP], {
    cwd: workspace,
    env,
    encoding: 'utf8',
    input: `${[platform, ...answers].join('\n')}\n`,
  });
}

/** An empty request log, and its path. */
function emptyLog() {
  const log = join(tempDir(), 'requests.log');
  writeFileSync(log, '');
  return log;
}

/** The page ESPN's league address answers with: what a user would save from a browser. Invented data. */
async function savedLeaguePage(leagueId) {
  const response = await createFakeEspnFetch()(leagueViewsUrl({ leagueId, season: SEASON, views: LEAGUE_VIEWS }), {
    headers: { cookie: `espn_s2=${FIXTURE_COOKIES.espn_s2}; SWID=${FIXTURE_COOKIES.SWID}` },
  });
  return response.text();
}

// After the league is confirmed: display name, format, scoring matches,
// writing provider, tone, longest post. '' takes each default.
const TAIL = ['', '', '', '', '', ''];

test('import route: setup makes no request, asks for no cookie, and writes ESPN_ROUTE=import', async () => {
  const workspace = tempDir();
  const page = join(workspace, 'league-page.json');
  writeFileSync(page, await savedLeaguePage(PUBLIC_LEAGUE_ID));
  const log = emptyLog();
  const address = `https://fantasy.espn.com/football/league?leagueId=${PUBLIC_LEAGUE_ID}&seasonId=${SEASON}&teamId=3`;

  // route: import (default); the address; the season it names; the saved file; is this your league
  const result = runSetup(['', address, '', page, '', ...TAIL], { workspace, preload: THROWING_FETCH, log });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(log, 'utf8'), '', 'setup made no request');

  assert.ok(result.stdout.includes(`/leagues/${PUBLIC_LEAGUE_ID}?view=mSettings`), 'the address to open is printed');
  assert.match(result.stdout, /Found "[^"]+" — 12 teams, 2026 season/);
  assert.match(result.stdout, /experimental/);
  assert.match(result.stdout, /Reception/, 'the scoring summary is shown back');
  assert.doesNotMatch(result.stdout, /espn_s2 cookie|SWID cookie|developer tools/);
  assert.match(result.stdout, /import-espn/);

  const env = loadEnvFile(join(workspace, '.env'));
  assert.equal(env.LEAGUE_PROVIDER, 'espn');
  assert.equal(env.ESPN_LEAGUE_ID, PUBLIC_LEAGUE_ID);
  assert.equal(env.ESPN_ROUTE, 'import');
  assert.equal(env.LEAGUE_SEASON, String(SEASON));
  assert.ok(!env.ESPN_S2 && !env.ESPN_SWID && !env.SLEEPER_LEAGUE_ID);

  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.league.provider, 'espn');
  assert.equal(config.league.route, 'import');
  assert.equal(config.league.id, PUBLIC_LEAGUE_ID);
  assert.deepEqual(config.league.secrets, {});
  assert.match(result.stdout, /The league folder loads/);
});

test('import route: a page for another league is refused, and giving up writes nothing', async () => {
  const workspace = tempDir();
  const page = join(workspace, 'league-page.json');
  writeFileSync(page, await savedLeaguePage(PRIVATE_LEAGUE_ID));
  const result = runSetup(['', PUBLIC_LEAGUE_ID, String(SEASON), page, 'n'], { workspace, preload: THROWING_FETCH });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /is for another ESPN league/);
  assert.equal(existsSync(join(workspace, '.env')), false);
});

test('fetch route: the terms notice is shown, and anything but an explicit yes falls back to import', () => {
  const workspace = tempDir();
  const log = emptyLog();
  // fetch; Enter at the notice (the default is no); then the import route's questions, given up.
  const result = runSetup(['2', '', PUBLIC_LEAGUE_ID, String(SEASON), join(workspace, 'missing.json'), 'n'], {
    workspace,
    preload: FAKE_ESPN_FETCH,
    log,
  });
  assert.match(result.stdout, /Terms of Use \(section 2\.B\(x\)\)/);
  assert.match(result.stdout, /bar automated access/);
  assert.match(result.stdout, /at your own risk/);
  assert.match(result.stdout, /are passwords/);
  assert.match(result.stdout, /setup will use Import/);
  assert.equal(readFileSync(log, 'utf8'), '', 'nothing was fetched');
  assert.equal(existsSync(join(workspace, '.env')), false);
});

test('fetch route, public league: confirmed with ESPN, and no cookie is asked for or written', () => {
  const workspace = tempDir();
  const log = emptyLog();
  // fetch; yes; id; season; public (default); is this your league
  const result = runSetup(['2', 'y', PUBLIC_LEAGUE_ID, String(SEASON), '', '', ...TAIL], {
    workspace,
    preload: FAKE_ESPN_FETCH,
    log,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Terms of Use/);
  assert.match(result.stdout, /Found "[^"]+" — 12 teams, 2026 season/);
  assert.match(result.stdout, /experimental/);
  assert.match(result.stdout, /Reception/);
  assert.doesNotMatch(result.stdout, /developer tools/);
  assert.match(readFileSync(log, 'utf8'), /lm-api-reads\.fantasy\.espn\.com/, 'the league was looked up with ESPN');

  const env = loadEnvFile(join(workspace, '.env'));
  assert.equal(env.LEAGUE_PROVIDER, 'espn');
  assert.equal(env.ESPN_ROUTE, 'fetch');
  assert.equal(env.ESPN_LEAGUE_ID, PUBLIC_LEAGUE_ID);
  assert.ok(!env.ESPN_S2 && !env.ESPN_SWID);
  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.league.route, 'fetch');
  assert.deepEqual(config.league.secrets, {});
});

test('fetch route, private league: a 401 is explained, then the cookies are taken masked and kept only in .env', () => {
  const workspace = tempDir();
  // Called public, ESPN answers 401: explained, and given up.
  const refused = runSetup(['2', 'y', PRIVATE_LEAGUE_ID, String(SEASON), '', 'n'], {
    workspace,
    preload: FAKE_ESPN_FETCH,
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /401/);
  assert.match(refused.stdout, /either the league is\s+private, or the cookies are wrong/);
  assert.equal(existsSync(join(workspace, '.env')), false);

  // fetch; yes; id; season; private; the two cookies; is this your league
  const ok = runSetup(
    ['2', 'y', PRIVATE_LEAGUE_ID, String(SEASON), '2', FIXTURE_COOKIES.espn_s2, FIXTURE_COOKIES.SWID, '', ...TAIL],
    { workspace, preload: FAKE_ESPN_FETCH },
  );
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /developer tools/);

  const env = loadEnvFile(join(workspace, '.env'));
  assert.equal(env.ESPN_S2, FIXTURE_COOKIES.espn_s2);
  assert.equal(env.ESPN_SWID, FIXTURE_COOKIES.SWID);
  assert.equal(env.ESPN_ROUTE, 'fetch');
  const config = loadConfig({ workspaceRoot: workspace });
  assert.deepEqual(config.league.secrets, { ESPN_S2: FIXTURE_COOKIES.espn_s2, ESPN_SWID: FIXTURE_COOKIES.SWID });

  for (const text of [refused.stdout, refused.stderr, ok.stdout, ok.stderr]) {
    assert.ok(!text.includes(FIXTURE_COOKIES.espn_s2), 'espn_s2 was printed');
    assert.ok(!text.includes(FIXTURE_COOKIES.SWID), 'SWID was printed');
  }
});

test('guillotine is not offered for an ESPN league', async () => {
  const workspace = tempDir();
  const page = join(workspace, 'league-page.json');
  writeFileSync(page, await savedLeaguePage(PUBLIC_LEAGUE_ID));
  const result = runSetup(['', PUBLIC_LEAGUE_ID, String(SEASON), page, '', ...TAIL], {
    workspace,
    preload: THROWING_FETCH,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Dynasty/);
  assert.doesNotMatch(result.stdout, /\d\) Guillotine/);
  assert.notEqual(loadEnvFile(join(workspace, '.env')).LEAGUE_FORMAT, 'guillotine');
  assert.equal(existsSync(join(workspace, 'config', 'guillotine.yml')), false);
});

test('an ESPN dynasty league gets no rookie draft questions and is not pointed at the prospect board', async () => {
  const workspace = tempDir();
  const page = join(workspace, 'league-page.json');
  writeFileSync(page, await savedLeaguePage(PUBLIC_LEAGUE_ID));
  // route; id; season; file; is this your league; name; format: 1 (dynasty); scoring; provider; tone; length
  const result = runSetup(['', PUBLIC_LEAGUE_ID, String(SEASON), page, '', '', '1', '', '', '', ''], {
    workspace,
    preload: THROWING_FETCH,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(loadEnvFile(join(workspace, '.env')).LEAGUE_FORMAT, 'dynasty');
  assert.doesNotMatch(result.stdout, /rookie draft ordered|prospects\.example\.yml/);
  assert.equal(existsSync(join(workspace, 'config', 'rookie-draft.yml')), false);
});

test("a second ESPN run offers the first run's answers and backs up .env; a different league is refused without asking", async () => {
  const workspace = tempDir();
  const page = join(workspace, 'league-page.json');
  writeFileSync(page, await savedLeaguePage(PUBLIC_LEAGUE_ID));
  const first = runSetup(['', PUBLIC_LEAGUE_ID, String(SEASON), page, '', ...TAIL], {
    workspace,
    preload: THROWING_FETCH,
  });
  assert.equal(first.status, 0, first.stdout + first.stderr);

  // The platform, route, league and season are all the defaults now.
  const again = runSetup(['', '', '', page, '', ...TAIL, 'y'], { workspace, preload: THROWING_FETCH, platform: '' });
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.ok(again.stdout.includes(`[${PUBLIC_LEAGUE_ID}]`));
  assert.ok(existsSync(join(workspace, '.env.backup')));

  // A different league in the same folder is not taken over without asking.
  const rolling = join(tempDir(), 'rolling.json');
  writeFileSync(rolling, await savedLeaguePage(ROLLING_LEAGUE_ID));
  const before = readFileSync(join(workspace, '.env'), 'utf8');
  const refused = runSetup(['', ROLLING_LEAGUE_ID, String(SEASON), rolling, '', 'n'], {
    workspace,
    preload: THROWING_FETCH,
    platform: '',
  });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.ok(refused.stdout.includes(`already holds a different league (espn ID ${PUBLIC_LEAGUE_ID})`));
  assert.equal(readFileSync(join(workspace, '.env'), 'utf8'), before);
});
