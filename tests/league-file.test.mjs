/**
 * The league file (src/leagueFile.mjs) and the commands that write and read it
 * (export-league, import-league in src/cli.mjs).
 *
 * Every league here is invented: the four-team Sleeper league the fake API
 * serves (tests/fixtures/fake-sleeper-api-fetch.mjs, league
 * 000000000000000000) and the twelve-team ESPN fixture league
 * (tests/fixtures/mock-espn-league.mjs). Every key and cookie is made up.
 * Nothing touches the network.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

import { PACKAGE_ROOT, WORKSPACE_ENV_VAR, loadConfig } from '../src/config.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import {
  LEAGUE_FILE_HISTORY_KINDS,
  LEAGUE_FILE_KIND,
  LEAGUE_FILE_SCHEMA_VERSION,
  LeagueFileError,
  leagueFileFromWorkspace,
  newLeagueFile,
  parseLeagueFile,
  readsLeagueFolderPath,
  serializeLeagueFile,
  storeDataFromLeagueFile,
  stripEspnPersonalData,
  workspaceFromLeagueFile,
} from '../src/leagueFile.mjs';
import { LEAGUE_JSON_LIMITS } from '../src/lib/safeInput.mjs';
import { parseYaml, stringifyYaml } from '../src/lib/yaml.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../src/version.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { FIXTURE_COOKIES, PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON as ESPN_SEASON } from './fixtures/mock-espn-league.mjs';

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_SLEEPER_API = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-sleeper-api-fetch.mjs');
const THROWING_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'throwing-fetch.mjs');

/** Every key a run could take from this shell instead of the league folder. */
const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID', 'SLEEPER_SEASON', 'SLEEPER_POST_MAX_LENGTH', 'POST_MAX_LENGTH', 'ESPN_LEAGUE_ID',
  'ESPN_S2', 'ESPN_SWID', 'ESPN_ROUTE', 'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'LEAGUE_DISPLAY_NAME',
  'FANTASY_WEEK', 'DATA_DIR', 'OUTPUT_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AI_PROVIDER', 'AI_MODEL',
  'PRESSBOX_TONE', 'INCLUDE_EMOJI', 'DEBUG', WORKSPACE_ENV_VAR,
];

/** Invented secrets: none of these values may ever reach a league file. */
const SECRETS = {
  ANTHROPIC_API_KEY: 'sk-ant-invented-key-not-real-0001',
  OPENAI_API_KEY: 'sk-invented-openai-key-not-real-0002',
  ESPN_S2: 'INVENTED-ESPN-S2-COOKIE-VALUE-0003',
  ESPN_SWID: '{0E5A1F2B-3C4D-4E5F-8A9B-0C1D2E3F4A5B}',
  AI_PROVIDER: 'anthropic',
  AI_MODEL: 'invented-model-name-0004',
};

/** A braced GUID: the shape of an ESPN member ID and of the SWID cookie. */
const BRACED_GUID = /\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}/i;

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

function tempDir(prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  folders.push(root);
  return root;
}

function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  return { ...env, ...extra };
}

/**
 * Runs the CLI on the league folder `root` (from inside it, or from its
 * parent when it does not exist yet) with `preload` replacing fetch, taking
 * nothing from this shell.
 */
function runCli(root, args, { preload = THROWING_FETCH, env = {} } = {}) {
  const result = spawnSync(process.execPath, ['--import', preload, CLI, ...args, '--workspace', root], {
    cwd: existsSync(root) ? root : dirname(root),
    env: cleanEnv(env),
    encoding: 'utf8',
  });
  return { ...result, said: `${result.stdout}\n${result.stderr}` };
}

function ok(result) {
  assert.equal(result.status, 0, result.said);
  return result;
}

/** Every file under `dir` as `{ relativePath: text }`, leaving out `skip` folders. */
function filesIn(dir, { skip = [] } = {}) {
  const out = {};
  const walk = (at) => {
    if (!existsSync(at)) return;
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      const rel = relative(dir, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (!skip.includes(rel)) walk(path);
      } else {
        out[rel] = readFileSync(path, 'utf8');
      }
    }
  };
  walk(dir);
  return out;
}

/** The settings a run of a folder sees: everything loadConfig resolves that a league file carries. */
function settingsOf(root) {
  const config = loadConfig({ workspaceRoot: root });
  return {
    league: { provider: config.league.provider, id: config.league.id, season: config.league.season, route: config.league.route },
    week: config.week,
    leagueDisplayName: config.leagueDisplayName,
    leagueFormat: config.leagueFormat,
    editorial: config.editorial,
    rankings: config.rankings,
    guillotine: config.guillotine,
    rookieDraft: config.rookieDraft,
  };
}

/* --------------------------------------------------------- the package side */

test('the version core names is the one package.json declares', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.equal(PACKAGE_NAME, manifest.name);
  assert.equal(PACKAGE_VERSION, manifest.version);
});

test('stringifyYaml writes what parseYaml reads back as the same value', () => {
  const values = [
    parseYaml(readFileSync(join(PACKAGE_ROOT, 'config', 'prospects.example.yml'), 'utf8')),
    {
      order: [
        { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
        { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
      ],
      rounds: 'linear',
      tank_watch: { start_week: 8 },
    },
    { eliminations: { 1: 'Bye Week Blues', 2: "It's #2: a name", 3: '"Quoted" # name' } },
    {
      'odd key: here': 'yes',
      numbers: [1, -2, 0.35, 12.5],
      flags: { on: true, off: false, none: null },
      banned_phrases: ['no', 'true', '42', 'with # hash', '  padded  '],
      nested: { list: [{ name: 'a', inner: { deep: 'x' }, tags: ['t1', 't2'] }] },
    },
  ];
  for (const value of values) assert.deepEqual(parseYaml(stringifyYaml(value)), value);
  assert.throws(() => stringifyYaml({ text: 'two\nlines' }), /text: a line break/);
  assert.throws(() => stringifyYaml({ text: `It's "both"` }), /text: a text holding both kinds of quote/);
  assert.throws(() => stringifyYaml({ list: [[1]] }), /list\.0: a list inside a list/);
  assert.throws(() => stringifyYaml({ small: 1e-9 }), /small: the number 1e-9/);
});

test('a new league file is valid, reads back unchanged, and holds every kind of history per season', () => {
  const file = newLeagueFile({ surface: 'cli', leagueId: FAKE_LEAGUE_ID, writtenAt: '2026-10-12T18:00:00.000Z' });
  assert.equal(file.schemaVersion, LEAGUE_FILE_SCHEMA_VERSION);
  assert.equal(file.kind, LEAGUE_FILE_KIND);
  assert.deepEqual(file.writtenBy, { package: PACKAGE_NAME, version: PACKAGE_VERSION, surface: 'cli' });
  assert.deepEqual(parseLeagueFile(serializeLeagueFile(file)), file);
  assert.equal(newLeagueFile({ surface: 'web' }).league.leagueId, null);

  const withSeason = { ...file, seasons: { 2026: { rankings: {} } } };
  assert.deepEqual(Object.keys(parseLeagueFile(JSON.stringify(withSeason)).seasons['2026']), LEAGUE_FILE_HISTORY_KINDS);
});

/** A refusal: a LeagueFileError naming `field`, its message matching `pattern`. */
function refused(fn, field, pattern = /./) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof LeagueFileError, `${error.name}: ${error.message}`);
    assert.equal(error.field, field, error.message);
    assert.match(error.message, pattern);
    if (field) assert.ok(error.message.includes(field), `the message names ${field}: ${error.message}`);
    return true;
  });
}

test('parseLeagueFile refuses unknown keys, a newer schemaVersion and malformed history, naming the field', () => {
  const file = newLeagueFile({ surface: 'cli', leagueId: FAKE_LEAGUE_ID });
  const read = (value) => () => parseLeagueFile(JSON.stringify(value), { name: 'league.json' });
  const season = (kinds) => ({ ...file, seasons: { 2026: kinds } });
  const ranking = { season: '2026', label: 'week-3', week: 3, rankings: [] };

  refused(read({ ...file, schemaVersion: LEAGUE_FILE_SCHEMA_VERSION + 1 }), 'schemaVersion', /newer version.*Update the package/s);
  refused(read({ ...file, schemaVersion: 0 }), 'schemaVersion', /no version of Fantasy Pressbox wrote/);
  refused(read({ ...file, kind: 'something.else' }), 'kind', /not a Fantasy Pressbox league file/);
  refused(read({ ...file, apiKey: 'x' }), 'apiKey', /not part of a league file/);
  refused(read({ ...file, settings: { ...file.settings, aiModel: 'x' } }), 'settings.aiModel', /not part of a league file/);
  refused(read({ ...file, league: { ...file.league, leagueId: 'abc' } }), 'league.leagueId');
  refused(read({ ...file, settings: { ...file.settings, week: 40 } }), 'settings.week', /0 to 25/);
  refused(read({ ...file, settings: { ...file.settings, format: 'dynsty' } }), 'settings.format', /not a league format/);
  refused(read({ ...file, settings: { ...file.settings, espnRoute: 'import' } }), 'settings.espnRoute', /only for an ESPN league/);
  refused(read({ ...file, settings: { ...file.settings, rankEmoji: { mode: 'sparkly' } } }), 'settings.rankEmoji.mode');
  refused(
    read({ ...file, settings: { ...file.settings, editorial: { output: { include_emoji: false } } } }),
    'settings.editorial.output.include_emoji',
    /its own setting/,
  );
  refused(
    read({ ...file, settings: { ...file.settings, rankings: { weights: { redraft: { starting_lineup: 2 } } } } }),
    'settings',
    /settings are refused/,
  );
  refused(read({ ...file, seasons: { 26: {} } }), 'seasons.26', /not a season/);
  refused(read(season({ scores: {} })), 'seasons.2026.scores', /not part of a league file/);
  refused(read(season({ rankings: { 'week-3': { ...ranking, rankings: 'first' } } })), 'seasons.2026.rankings.week-3.rankings', /must be a list/);
  refused(read(season({ rankings: { 'top-ten': ranking } })), 'seasons.2026.rankings.top-ten', /week-<n>, preseason or final/);
  refused(read(season({ snapshots: { 'week-30': {} } })), 'seasons.2026.snapshots.week-30', /weeks run 0 to 25/);
  refused(read(season({ snapshots: { 'week-3': { week: 4 } } })), 'seasons.2026.snapshots.week-3.week');
  refused(read(season({ predictions: { 'week-3': [] } })), 'seasons.2026.predictions.week-3', /must be a table/);
  refused(read(season({ editions: { 'week-3-rankings': { week: 3, task: 'rankings' } } })), 'seasons.2026.editions.week-3-rankings.text');
  refused(
    read(season({ editions: { 'week-3-limerick': { week: 3, task: 'limerick', text: '' } } })),
    'seasons.2026.editions.week-3-limerick',
    /not an edition/,
  );
  refused(read(season({ import: { league: { provider: 'yahoo', body: {} } } })), 'seasons.2026.import.league.provider');

  // Not JSON, and a prototype key, are refused before any field is looked at.
  assert.throws(() => parseLeagueFile('{ nope', { name: 'league.json' }), /league.json is not JSON/);
  assert.throws(
    () => parseLeagueFile(serializeLeagueFile(file).replace('"settings":{', '"settings":{"__proto__":{},'), { name: 'league.json' }),
    /league\.json.*__proto__/,
  );
});

test('a value shaped like an ESPN member ID is never written, wherever it is', () => {
  const file = newLeagueFile({ surface: 'cli', leagueId: FAKE_LEAGUE_ID });
  const holding = { ...file, settings: { ...file.settings, displayName: `League ${SECRETS.ESPN_SWID}` } };
  refused(() => serializeLeagueFile(holding), 'settings.displayName', /ESPN member ID/);
});

test('saved ESPN pages lose their members, owners, first and last names and every braced GUID', () => {
  const guid = '{11111111-2222-4333-8444-555555555555}';
  const page = {
    provider: 'espn',
    body: {
      members: [{ id: guid, displayName: 'someone', firstName: 'Real', lastName: 'Person' }],
      teams: [{ id: 1, name: 'Invented Team', owners: [guid], primaryOwner: guid, owner: { firstName: 'Real', lastName: 'Person' } }],
      transactions: [{ id: 'abc', memberId: guid, items: [{ playerId: 1 }] }],
      status: { creator: guid, notes: ['keep me', guid] },
      players: [{ id: 9, fullName: 'Kept Name' }],
    },
  };
  const stripped = stripEspnPersonalData(page);
  assert.deepEqual(stripped, {
    provider: 'espn',
    body: {
      members: [],
      teams: [{ id: 1, name: 'Invented Team', owners: [] }],
      transactions: [{ id: 'abc', items: [{ playerId: 1 }] }],
      status: { notes: ['keep me'] },
      players: [{ id: 9, fullName: 'Kept Name' }],
    },
  });
  assert.equal(page.body.members.length, 1, 'the page given is not changed');
});

/* ---------------------------------------------------------- folder mapping */

test('a folder is read through its allowlist: other .env lines are dropped, other files are skipped unread', () => {
  const env = [
    `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}`,
    ...Object.entries(SECRETS).map(([key, value]) => `${key}=${value}`),
    'DATA_DIR=elsewhere',
    'OUTPUT_DIR=posts',
    'DEBUG=true',
    'LEAGUE_DISPLAY_NAME="Taco Tuesday League"',
    'POST_MAX_LENGTH=700',
    'INCLUDE_EMOJI=false',
  ].join('\n');
  const { leagueFile, skipped, ignoredEnvKeys } = leagueFileFromWorkspace(
    [
      { path: '.env', text: env },
      { path: 'config/guillotine.yml', text: 'eliminations:\n  1: "Bye Week Blues"\n' },
      { path: 'data/rankings/2026/week-3.json', text: JSON.stringify({ week: 3, rankings: [] }) },
      { path: 'data/cache/players-nfl.json', text: '{ "not": "read" }' },
      { path: 'data/raw/2026/notes.json', text: '{}' },
      { path: 'output/2026-week03-rankings-prompt.md', text: 'prompt' },
      { path: '../outside/.env', text: 'x' },
      { path: '/etc/passwd', text: 'x' },
      { path: 'data\\raw\\2026\\week-1.json', text: '{}' },
    ],
    { surface: 'web' },
  );
  assert.deepEqual(ignoredEnvKeys, [...Object.keys(SECRETS), 'DATA_DIR', 'OUTPUT_DIR', 'DEBUG']);
  assert.deepEqual(skipped, [
    '../outside/.env',
    '/etc/passwd',
    'data/cache/players-nfl.json',
    'data/raw/2026/notes.json',
    'data\\raw\\2026\\week-1.json',
    'output/2026-week03-rankings-prompt.md',
  ]);
  const text = serializeLeagueFile(leagueFile);
  for (const value of Object.values(SECRETS)) assert.ok(!text.includes(value), value);
  for (const key of ['DATA_DIR', 'OUTPUT_DIR', 'DEBUG', 'elsewhere', 'posts']) assert.ok(!text.includes(key), key);
  assert.equal(leagueFile.settings.displayName, 'Taco Tuesday League');
  assert.equal(leagueFile.settings.maxChars, 700);
  assert.deepEqual(leagueFile.settings.rankEmoji, { mode: 'none' });
  assert.deepEqual(leagueFile.settings.declared.eliminations, { 1: 'Bye Week Blues' });
  assert.deepEqual(Object.keys(leagueFile.seasons['2026'].rankings), ['week-3']);

  assert.ok(readsLeagueFolderPath('data/tank-watch/2026/week-9.json'));
  assert.ok(readsLeagueFolderPath('data/editions/2026/week-3-rankings.json'));
  assert.ok(!readsLeagueFolderPath('data/cache/players-nfl.json'));
  assert.ok(!readsLeagueFolderPath('config/prospects.example.yml'));
});

test('a folder with a file that cannot be read is refused whole, naming the file and the field', () => {
  const env = { path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n` };
  const from = (...entries) => () => leagueFileFromWorkspace([env, ...entries], { surface: 'cli' });
  assert.throws(from({ path: 'data/rankings/2026/week-3.json', text: '{ "rankings": 3 }' }), (error) => {
    assert.equal(error.message, 'Could not read data/rankings/2026/week-3.json: rankings must be a list');
    return true;
  });
  assert.throws(from({ path: 'data/snapshots/2026/week-2.json', text: '{ broken' }), /data\/snapshots\/2026\/week-2\.json: it is not JSON/);
  assert.throws(from({ path: 'data/raw/2026/week-2.json', text: '{ "__proto__": {} }' }), /data\/raw\/2026\/week-2\.json.*__proto__/);
  assert.throws(from({ path: 'config/rookie-draft.yml', text: 'order:\n  - teams: everyone\n' }), /rookie-draft/);
  assert.throws(() => leagueFileFromWorkspace([{ path: 'config/rankings.yml', text: '' }], { surface: 'cli' }), /no \.env/);
});

/* -------------------------------------------- the round trip, through the CLI */

/** A reply pasted back from a chat: posts, then the JSON block. */
const reply = (posts, block) => [...posts.flatMap((post) => [post, '%%%']).slice(0, -1), '```json', JSON.stringify(block, null, 2), '```', ''].join('\n');

test('a Sleeper league folder exported and imported again has identical data/ files and the same settings', () => {
  const root = tempDir('pressbox-league-file-sleeper-');
  writeFileSync(
    join(root, '.env'),
    [
      `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}`,
      'LEAGUE_FORMAT=redraft',
      'LEAGUE_DISPLAY_NAME="Invented Week Data League"',
      'PRESSBOX_TONE=deadpan',
      'SLEEPER_POST_MAX_LENGTH=800',
      ...Object.entries(SECRETS).map(([key, value]) => `${key}=${value}`),
      'DATA_DIR=./history',
      'OUTPUT_DIR=./posts',
      'DEBUG=false',
      '',
    ].join('\n'),
  );
  mkdirSync(join(root, 'config'));
  writeFileSync(
    join(root, 'config', 'editorial.yml'),
    'roast_intensity: high\nranking_emoji:\n  1: "👑"\n  2: "🍌"\nbanned_phrases:\n  - "it is what it is"\n',
  );
  writeFileSync(
    join(root, 'config', 'rookie-draft.yml'),
    'order:\n  - teams: non_playoff\n    sort: max_points_for\n    direction: ascending\n  - teams: playoff\n    sort: max_points_for\n    direction: ascending\nrounds: linear\ntank_watch:\n  start_week: 8\n',
  );
  writeFileSync(join(root, 'config', 'prospects.2027.yml'), readFileSync(join(PACKAGE_ROOT, 'config', 'prospects.example.yml'), 'utf8'));

  // Two weeks of history: the weeks captured, a ranking and a preview recorded from pasted replies.
  const sleeper = { preload: FAKE_SLEEPER_API };
  ok(runCli(root, ['rankings', '--week', '1'], sleeper));
  const teams = JSON.parse(readFileSync(join(root, 'history', 'snapshots', '2026', 'week-1.json'), 'utf8')).teams.map((t) => t.name);
  const rankingsReply = reply(['Week 1 rankings, post one.', 'Post two.'], teams.map((team, i) => ({ rank: i + 1, team })));
  writeFileSync(join(root, 'rankings-reply.txt'), rankingsReply);
  ok(runCli(root, ['record', join(root, 'rankings-reply.txt'), '--task', 'rankings', '--week', '1'], sleeper));
  ok(runCli(root, ['preview', '--week', '2'], sleeper));
  const previewReply = reply(['Week 2 preview.'], [
    { week: 2, team_a: teams[0], team_b: teams[1], predicted_winner: teams[0] },
    { week: 2, team_a: teams[2], team_b: teams[3], predicted_winner: teams[3] },
  ]);
  writeFileSync(join(root, 'preview-reply.txt'), previewReply);
  ok(runCli(root, ['record', join(root, 'preview-reply.txt'), '--task', 'preview', '--week', '2'], sleeper));

  // record keeps the whole reply beside what its block filed.
  const edition = JSON.parse(readFileSync(join(root, 'history', 'editions', '2026', 'week-1-rankings.json'), 'utf8'));
  assert.equal(edition.text, rankingsReply);
  assert.deepEqual([edition.season, edition.week, edition.task, edition.from], ['2026', 1, 'rankings', 'pasted']);
  assert.ok(existsSync(join(root, 'history', 'rankings', '2026', 'week-1.json')));
  assert.equal(JSON.parse(readFileSync(join(root, 'history', 'editions', '2026', 'week-2-preview.json'), 'utf8')).text, previewReply);
  assert.ok(existsSync(join(root, 'history', 'predictions', '2026', 'week-2.json')));

  const exportPath = join(root, 'league.json');
  const exported = ok(runCli(root, ['export-league', exportPath]));
  assert.match(exported.said, /League file written to/);
  assert.match(exported.said, /Left out of the file from \.env: ANTHROPIC_API_KEY, OPENAI_API_KEY, ESPN_S2, ESPN_SWID, AI_PROVIDER, AI_MODEL, DATA_DIR, OUTPUT_DIR, DEBUG/);
  assert.match(exported.said, /Not read: .*data\/cache\//);

  // No secret, and no setting a league file never holds.
  const text = readFileSync(exportPath, 'utf8');
  for (const [key, value] of Object.entries(SECRETS)) assert.ok(!text.includes(value), `${key}'s value reached the file`);
  for (const key of [...Object.keys(SECRETS), 'DATA_DIR', 'OUTPUT_DIR', 'DEBUG', './history', './posts']) {
    assert.ok(!text.includes(key), `${key} reached the file`);
  }
  const file = parseLeagueFile(text);
  assert.deepEqual(file.writtenBy, { package: PACKAGE_NAME, version: PACKAGE_VERSION, surface: 'cli' });
  assert.deepEqual(file.settings.rankEmoji, { mode: 'custom', table: { 1: '👑', 2: '🍌' } });
  assert.equal(file.settings.roastIntensity, 'high');
  assert.equal(file.settings.tone, 'deadpan');

  // Imported into a new folder: the same data/ files, byte for byte, and the same settings.
  const copy = join(tempDir('pressbox-league-file-import-'), 'rebuilt');
  const imported = ok(runCli(copy, ['import-league', exportPath]));
  assert.match(imported.said, /Imported the Sleeper league 000000000000000000/);
  assert.deepEqual(filesIn(join(copy, 'data')), filesIn(join(root, 'history'), { skip: ['cache'] }));
  assert.deepEqual(settingsOf(copy), settingsOf(root));
  assert.ok(!readFileSync(join(copy, '.env'), 'utf8').includes('API_KEY'));

  // Exported again, the rebuilt folder writes the same file but for when it was written.
  ok(runCli(copy, ['export-league', join(copy, 'again.json')]));
  const undated = (json) => ({ ...JSON.parse(json), writtenAt: null });
  assert.deepEqual(undated(readFileSync(join(copy, 'again.json'), 'utf8')), undated(text));

  // The history reads the same from a memory store built from the file.
  const store = createMemoryStore(storeDataFromLeagueFile(file));
  assert.deepEqual(store.loadPreviousRankings('2026', 2).rankings.map((entry) => entry.team), teams);
  assert.equal(store.loadEdition('2026', 2, 'preview').text, previewReply);

  // An import never writes over a league.
  const again = runCli(copy, ['import-league', exportPath]);
  assert.notEqual(again.status, 0);
  assert.match(again.said, /already a league folder/);
  const partial = tempDir('pressbox-league-file-partial-');
  mkdirSync(join(partial, 'data', 'rankings', '2026'), { recursive: true });
  writeFileSync(join(partial, 'data', 'rankings', '2026', 'week-1.json'), '{}\n');
  const over = runCli(partial, ['import-league', exportPath]);
  assert.notEqual(over.status, 0);
  assert.match(over.said, /already holds data\/rankings\/2026\/week-1\.json/);
  assert.equal(readFileSync(join(partial, 'data', 'rankings', '2026', 'week-1.json'), 'utf8'), '{}\n');
  assert.ok(!existsSync(join(partial, '.env')));
});

test('an ESPN league file holds no member ID, owner or real name, and the rebuilt folder builds the same recap', async () => {
  const root = tempDir('pressbox-league-file-espn-');
  writeFileSync(
    join(root, '.env'),
    [
      'LEAGUE_PROVIDER=espn',
      `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`,
      `LEAGUE_SEASON=${ESPN_SEASON}`,
      'LEAGUE_FORMAT=redraft',
      `ESPN_S2=${SECRETS.ESPN_S2}`,
      `ESPN_SWID=${SECRETS.ESPN_SWID}`,
      `ANTHROPIC_API_KEY=${SECRETS.ANTHROPIC_API_KEY}`,
      '',
    ].join('\n'),
  );

  // The pages a person would save, with the fixture's member IDs in ESPN's braced
  // GUID form, a primaryOwner on each team, and each member's real name.
  const memberGuid = (n) => `{000000${n}-AAAA-4BBB-8CCC-DDDDEEEEFFFF}`;
  const people = (text) =>
    text
      .replace(/\{FIXTURE-MEMBER-(\d+)\}/g, (_, n) => memberGuid(n))
      .replace(/"owners":\["(\{[^"]+\})"\]/g, '"owners":["$1"],"primaryOwner":"$1"');
  const fetch = createFakeEspnFetch();
  const links = espnImportLinks({ leagueId: PUBLIC_LEAGUE_ID, season: ESPN_SEASON, weeks: [SCORED_WEEK] });
  const saved = [];
  for (const [kind, url] of [['league', links.league], ['matchups', links.weeks[0].matchups], ['transactions', links.weeks[0].transactions]]) {
    const path = join(root, `saved-${kind}.json`);
    writeFileSync(path, people(await (await fetch(url)).text()));
    saved.push(path);
  }
  const page = readFileSync(saved[0], 'utf8');
  assert.match(page, BRACED_GUID, 'the saved page holds member IDs');
  assert.match(page, /"primaryOwner"/);
  assert.match(page, /Firstname1/);
  ok(runCli(root, ['import-espn', '--week', String(SCORED_WEEK), ...saved]));
  ok(runCli(root, ['recap', '--week', String(SCORED_WEEK)]));
  const recap = `${ESPN_SEASON}-week0${SCORED_WEEK}-recap-prompt.md`;
  assert.match(readFileSync(join(root, 'data', 'import', String(ESPN_SEASON), 'league.json'), 'utf8'), BRACED_GUID);

  const exportPath = join(root, 'espn-league.json');
  ok(runCli(root, ['export-league', exportPath]));
  const text = readFileSync(exportPath, 'utf8');
  assert.doesNotMatch(text, BRACED_GUID);
  assert.doesNotMatch(text, /Firstname|Lastname|"firstName"|"lastName"|"primaryOwner"|"memberId"|FIXTURE-MEMBER/);
  for (const value of [SECRETS.ESPN_S2, SECRETS.ESPN_SWID, SECRETS.ANTHROPIC_API_KEY, ...Object.values(FIXTURE_COOKIES)]) {
    assert.ok(!text.includes(value), `${value} reached the file`);
  }
  const file = parseLeagueFile(text);
  const league = file.seasons[String(ESPN_SEASON)].import.league;
  assert.deepEqual(league.body.members, []);
  assert.ok(league.body.teams.every((team) => Array.isArray(team.owners) && team.owners.length === 0));

  const copy = tempDir('pressbox-league-file-espn-import-');
  ok(runCli(copy, ['import-league', exportPath]));
  ok(runCli(copy, ['recap', '--week', String(SCORED_WEEK)]));
  const undated = (prompt) => prompt.replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "…"');
  assert.equal(undated(readFileSync(join(copy, 'output', recap), 'utf8')), undated(readFileSync(join(root, 'output', recap), 'utf8')));
});

/** A league file whose serialized text is exactly `bytes` long, padded through rankings entries of ordinary-sized strings. */
function leagueFileOfSize(bytes) {
  const file = newLeagueFile({ surface: 'cli', leagueId: FAKE_LEAGUE_ID });
  const rankings = {};
  file.seasons = { 2026: { rankings } };
  const entries = 10;
  for (let week = 1; week <= entries; week += 1) {
    rankings[`week-${week}`] = { season: '2026', label: `week-${week}`, week, rankings: [] };
  }
  // Serializing fills in defaults, so the written text is longer than the object stringified.
  const written = Buffer.byteLength(serializeLeagueFile(file));
  const need = bytes - written;
  // m strings cost their characters, two quotes each and a comma between neighbours in a list.
  const overhead = (m) => 3 * m - Math.min(m, entries);
  let count = 1;
  while (need - overhead(count) > 90_000 * count) count += 1;
  let chars = need - overhead(count);
  for (let i = 0; i < count; i += 1) {
    const length = Math.min(90_000, chars);
    chars -= length;
    rankings[`week-${(i % entries) + 1}`].rankings.push('x'.repeat(length));
  }
  return file;
}

const LIMIT = LEAGUE_JSON_LIMITS.maxBytes;

test('serializeLeagueFile reads back text at the byte limit and refuses text over it, naming size and limit', () => {
  const atLimit = serializeLeagueFile(leagueFileOfSize(LIMIT));
  assert.equal(Buffer.byteLength(atLimit), LIMIT);
  assert.equal(parseLeagueFile(atLimit, { name: 'league.json' }).seasons['2026'].rankings['week-1'].week, 1);

  refused(() => serializeLeagueFile(leagueFileOfSize(LIMIT + 1)), '', /would be 20\.0 MB, over the 20\.0 MB a league file may be\. It was not written/);
  refused(() => serializeLeagueFile(leagueFileOfSize(LIMIT + 5 * 1024 * 1024)), '', /would be 25\.0 MB, over the 20\.0 MB/);
});

test('export-league exits non-zero and writes no file when the league file would be over the limit', () => {
  const root = tempDir('export-over-limit');
  mkdirSync(join(root, 'data', 'rankings', '2026'), { recursive: true });
  writeFileSync(join(root, '.env'), `LEAGUE_PROVIDER=sleeper\nSLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n`);
  // Each file is under the 20 MB a single file is read at; together they are not.
  const chunk = 'x'.repeat(90_000);
  for (let week = 1; week <= 9; week += 1) {
    const entry = { season: '2026', label: `week-${week}`, week, rankings: Array.from({ length: 30 }, () => chunk) };
    writeFileSync(join(root, 'data', 'rankings', '2026', `week-${week}.json`), JSON.stringify(entry));
  }
  const target = join(root, 'league.json');
  const result = runCli(root, ['export-league', target]);
  assert.notEqual(result.status, 0, result.said);
  assert.match(result.said, /would be \d+\.\d MB, over the 20\.0 MB a league file may be/);
  assert.ok(!existsSync(target));
});
