import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  SCORED_WEEK,
  SEASON,
} from './fixtures/mock-espn-league.mjs';

// doctor on an ESPN league, on the invented fixtures only
// (tests/fixtures/mock-espn-league.mjs). The cookies below are fixture values.

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');
const COOKIE_VALUES = Object.values(FIXTURE_COOKIES);
const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID', 'SLEEPER_SEASON', 'ESPN_LEAGUE_ID', 'ESPN_S2', 'ESPN_SWID', 'ESPN_ROUTE',
  'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'FANTASY_WEEK', 'DATA_DIR', 'OUTPUT_DIR',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', WORKSPACE_ENV_VAR,
];
const COOKIE_LINES = [`ESPN_S2=${FIXTURE_COOKIES.espn_s2}`, `ESPN_SWID=${FIXTURE_COOKIES.SWID}`];

function folder(lines) {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-espn-doctor-'));
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
  return root;
}

const fetchLines = (id, extra = []) => [
  'LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${id}`, `LEAGUE_SEASON=${SEASON}`, 'ESPN_ROUTE=fetch',
  'LEAGUE_FORMAT=redraft', ...extra,
];

/** Runs the CLI. `preload` is source for a module that installs the fetch. */
function run(root, preload, args = ['doctor']) {
  const file = join(root, 'preload.mjs');
  writeFileSync(file, preload);
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  return spawnSync(process.execPath, ['--import', file, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

const FAKE =
  `import { createFakeEspnFetch } from ${JSON.stringify(FAKE_FETCH)};\n` +
  'globalThis.fetch = createFakeEspnFetch();\n';
const NO_FETCH = "globalThis.fetch = async (url) => { throw new Error('fetch was called: ' + url); };\n";
// The fake API, with the league's settings block dropped from every league response.
const BROKEN_SHAPE =
  `import { createFakeEspnFetch } from ${JSON.stringify(FAKE_FETCH)};\n` +
  'const real = createFakeEspnFetch();\n' +
  'globalThis.fetch = async (input, init) => {\n' +
  '  const response = await real(input, init);\n' +
  "  if (!String(input).includes('/leagues/')) return response;\n" +
  '  const body = await response.json();\n' +
  '  delete body.settings;\n' +
  '  return new Response(JSON.stringify(body), { status: 200 });\n' +
  '};\n';

const output = (result) => `${result.stdout}\n${result.stderr}`;
function assertNoCookieValue(result) {
  for (const value of COOKIE_VALUES) assert.ok(!output(result).includes(value), 'a cookie value was printed');
}

test('fetch route, public league: route, reminder, league facts, cookies missing', () => {
  const root = folder(fetchLines(PUBLIC_LEAGUE_ID));
  try {
    const result = run(root, FAKE);
    const out = output(result);
    assert.equal(result.status, 0, out);
    assert.match(out, /Provider\s+ESPN — experimental/);
    assert.match(out, /ESPN route\s+fetch — automated access you opted into under ESPN's terms of use \(Disney Terms of Use §2\.B\(x\)\)/);
    assert.match(out, /ESPN cookies\s+ESPN_S2 missing, ESPN_SWID missing/);
    assert.match(out, /League\s+\S.*\(2026\)/);
    assert.match(out, /Teams\s+\d+/);
    assert.match(out, /Format\s+/);
    assert.match(out, /Everything looks good/);
    assertNoCookieValue(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetch route, private league with cookies: both cookies present, no value printed', () => {
  const root = folder(fetchLines(PRIVATE_LEAGUE_ID, COOKIE_LINES));
  try {
    const result = run(root, FAKE);
    const out = output(result);
    assert.equal(result.status, 0, out);
    assert.match(out, /ESPN cookies\s+ESPN_S2 present, ESPN_SWID present/);
    assert.match(out, /Everything looks good/);
    assertNoCookieValue(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetch route, private league without cookies: explains the 401 and where to find the cookies', () => {
  const root = folder(fetchLines(PRIVATE_LEAGUE_ID));
  try {
    const result = run(root, FAKE);
    const out = output(result);
    assert.equal(result.status, 1, out);
    assert.match(out, /private league: add ESPN_S2 and ESPN_SWID to \.env \(or refresh them if they worked before\)/);
    assert.match(out, /developer tools/);
    assert.match(out, /ESPN cookies\s+ESPN_S2 missing, ESPN_SWID missing/);
    assert.ok(!/Everything looks good/.test(out));
    assertNoCookieValue(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetch route, wrong cookies on a private league: the same explanation, no value printed', () => {
  const root = folder(fetchLines(PRIVATE_LEAGUE_ID, ['ESPN_S2=wrong-fixture-s2', 'ESPN_SWID={wrong-fixture-swid}']));
  try {
    const result = run(root, FAKE);
    const out = output(result);
    assert.equal(result.status, 1, out);
    assert.match(out, /private league: add ESPN_S2 and ESPN_SWID to \.env/);
    assert.match(out, /ESPN_S2 present, ESPN_SWID present/);
    assert.ok(!out.includes('wrong-fixture-s2') && !out.includes('wrong-fixture-swid'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetch route, a response that does not match the documented shape: names the view and field', () => {
  const root = folder(fetchLines(PUBLIC_LEAGUE_ID));
  try {
    const result = run(root, BROKEN_SHAPE);
    const out = output(result);
    assert.equal(result.status, 1, out);
    assert.match(out, /ESPN's \w+ response does not match the documented shape: \S*settings\S*/);
    assert.match(out, /ESPN may have changed its API/);
    assert.match(out, /docs\/espn-data\.md/);
    assert.ok(!/Everything looks good/.test(out));
    assertNoCookieValue(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('import route: no request is made, the addresses and imported weeks are printed, no cookie line', async () => {
  const root = folder([
    'LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`,
    'LEAGUE_FORMAT=redraft', ...COOKIE_LINES,
  ]);
  try {
    const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, weeks: [SCORED_WEEK] });
    const fetch = createFakeEspnFetch();
    const text = async (url) => (await fetch(url)).text();
    writeFileSync(join(root, 'league.json'), await text(links.league));
    writeFileSync(join(root, 'matchups.json'), await text(links.weeks[0].matchups));
    writeFileSync(join(root, 'transactions.json'), await text(links.weeks[0].transactions));
    const imports = [
      [join(root, 'league.json')],
      ['--week', String(SCORED_WEEK), join(root, 'matchups.json'), join(root, 'transactions.json')],
    ];
    for (const files of imports) {
      const imported = run(root, NO_FETCH, ['import-espn', ...files]);
      assert.equal(imported.status, 0, output(imported));
    }

    const result = run(root, NO_FETCH);
    const out = output(result);
    assert.equal(result.status, 0, out);
    assert.ok(!out.includes('fetch was called'));
    assert.match(out, /ESPN route\s+import — doctor never contacts ESPN/);
    assert.ok(!/Contacting/.test(out));
    assert.ok(!/ESPN cookies/.test(out));
    assert.match(out, new RegExp(`Imported weeks\\s+${SCORED_WEEK}\\b`));
    assert.ok(out.includes(links.league));
    assert.ok(out.includes(links.weeks[0].matchups));
    assert.ok(out.includes(links.weeks[0].transactions));
    assert.match(out, /personal use/);
    assert.match(out, /unverified/);
    assertNoCookieValue(result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Sleeper league gets none of the ESPN lines, and its errors pass through unchanged', () => {
  // The fake Sleeper answers 404 for everything, so doctor fails at its first
  // request: enough to show the ESPN-only lines are gated on the provider and
  // that a Sleeper error is not rewritten as an ESPN explanation.
  const root = folder(['SLEEPER_LEAGUE_ID=111']);
  try {
    const result = run(root, "globalThis.fetch = async () => new Response('null', { status: 404 });\n");
    const out = output(result);
    assert.equal(result.status, 1, out);
    assert.match(out, /Contacting Sleeper\.\.\./);
    assert.ok(!/Provider\s+|ESPN route|ESPN cookies|private league:|ESPN may have changed/.test(out), out);
    assert.match(result.stderr, /Error: /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('import route with nothing imported: no request, the addresses to save', () => {
  const root = folder(['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`]);
  try {
    const result = run(root, NO_FETCH);
    const out = output(result);
    assert.equal(result.status, 1, out);
    assert.ok(!out.includes('fetch was called'));
    assert.ok(out.includes(espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON }).league));
    assert.match(out, /Imported weeks\s+none yet/);
    assert.match(out, /personal use under ESPN's terms/);
    assert.match(out, /private league's page shows on a plain signed-in visit is unverified/);
    assert.ok(!/^Error: /m.test(result.stderr), result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
