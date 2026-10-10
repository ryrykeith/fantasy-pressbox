import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { loadEnvFile } from '../src/lib/env.mjs';
import { parseDeclaredDraftOrder } from '../src/rookieDraft.mjs';
import {
  DRAFT_ORDER_PRESETS,
  ROUND_ORDER_CHOICES,
  defaultFormatType,
  defaultLeagueFolder,
  expandHome,
  extractLeagueId,
  formatChoices,
  parseStartWeekAnswer,
  presetForOrder,
  readRookieDraftConfig,
  renderEnv,
  renderRookieDraftConfig,
} from '../src/init.mjs';

// init: what it asks, how an answer is read, and the league folder it writes.
// The answers are read with the config loader's own parsers, so nothing init
// writes can fail at load; the end-to-end runs drive setup.mjs against a
// stand-in Sleeper (tests/fixtures/fake-sleeper-fetch.mjs).

function tempDir(prefix = 'pressbox-init-') {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/* --------------------------------------------------------------- answers */

test('a league ID is picked out of a pasted Sleeper address', () => {
  assert.equal(extractLeagueId('https://sleeper.com/leagues/1234567890123456789/team'), '1234567890123456789');
  assert.equal(extractLeagueId(' 1234567890 '), '1234567890');
  assert.equal(extractLeagueId('my league'), '');
  assert.equal(extractLeagueId(undefined), '');
});

test('the league folder is offered under ~/leagues, named after the league', () => {
  assert.equal(defaultLeagueFolder({ home: '/h', leagueName: 'Fantasy Island: Dynasty!' }), join('/h', 'leagues', 'fantasy-island-dynasty'));
  assert.equal(defaultLeagueFolder({ home: '/h', leagueName: 'Café Ligue' }), join('/h', 'leagues', 'cafe-ligue'));
  assert.equal(defaultLeagueFolder({ home: '/h', leagueName: '🏈🏈' }), join('/h', 'leagues', 'my-league'));
});

test('a typed ~ means the home folder, as in a shell', () => {
  assert.equal(expandHome('~/leagues/x', '/h'), join('/h', 'leagues', 'x'));
  assert.equal(expandHome('~', '/h'), '/h');
  assert.equal(expandHome('/abs/x', '/h'), '/abs/x');
});

test('every format is offered, guillotine under the names a chopped league knows it by', () => {
  const choices = formatChoices({ detectedType: 'redraft' });
  assert.deepEqual(choices.map((choice) => choice.value), ['dynasty', 'redraft', 'guillotine']);
  const guillotine = choices.find((choice) => choice.value === 'guillotine').label;
  assert.match(guillotine, /chopped/);
  assert.match(guillotine, /lowest scorer each week is eliminated/);
  assert.match(choices.find((choice) => choice.value === 'redraft').label, /what Sleeper reports/);
});

test('Sleeper never marks guillotine as its reading; a declared one is marked current', () => {
  const choices = formatChoices({ detectedType: 'redraft', currentType: 'guillotine' });
  const guillotine = choices.find((choice) => choice.value === 'guillotine').label;
  assert.match(guillotine, /\(current\)/);
  assert.doesNotMatch(guillotine, /what Sleeper reports/);
});

test('the format offered first is the declared one, else Sleeper\'s reading', () => {
  assert.equal(defaultFormatType({ detectedType: 'redraft', existing: 'Guillotine' }), 'guillotine');
  assert.equal(defaultFormatType({ detectedType: 'dynasty', existing: '' }), 'dynasty');
  assert.equal(defaultFormatType({ detectedType: 'dynasty', existing: undefined }), 'dynasty');
  // A declaration that no longer parses is replaced, not offered.
  assert.equal(defaultFormatType({ detectedType: 'redraft', existing: 'dynastee' }), 'redraft');
});

test('every draft order preset is a rule the config loader accepts and can project', () => {
  for (const preset of DRAFT_ORDER_PRESETS) {
    const rule = parseDeclaredDraftOrder(preset.order);
    assert.ok(rule.groups.every((group) => group.sort !== 'lottery'), preset.key);
    assert.equal(presetForOrder(rule), preset);
  }
});

test("the first preset is the operator's league: non-playoff teams first, each group by max points-for", () => {
  assert.deepEqual(DRAFT_ORDER_PRESETS[0].order, [
    { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
    { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
  ]);
});

test('a rule that is none of the presets matches no preset', () => {
  const rule = parseDeclaredDraftOrder([{ teams: 'all', sort: 'record', direction: 'descending' }]);
  assert.equal(presetForOrder(rule), null);
  assert.equal(presetForOrder(null), null);
});

test('the later-rounds choices are linear, snake, or left undeclared', () => {
  assert.deepEqual(ROUND_ORDER_CHOICES.map((choice) => choice.value), ['linear', 'snake', null]);
});

test('a tank watch start week is read by the loader\'s own parser', () => {
  assert.equal(parseStartWeekAnswer(''), null);
  assert.equal(parseStartWeekAnswer('  '), null);
  assert.equal(parseStartWeekAnswer('8'), 8);
  assert.throws(() => parseStartWeekAnswer('eight'), /tank watch start week is "eight"/);
  assert.throws(() => parseStartWeekAnswer('0'), /week number from 1/);
  assert.throws(() => parseStartWeekAnswer('7.5'), /week number/);
});

/* --------------------------------------------------- the files it writes */

test('a rookie-draft.yml written from a preset reads back as exactly that rule', () => {
  const text = renderRookieDraftConfig({
    leagueName: 'Test League',
    order: DRAFT_ORDER_PRESETS[0].order,
    rounds: 'linear',
    startWeek: 8,
  });
  assert.match(text, /Test League/);
  const read = readRookieDraftConfig(text);
  assert.deepEqual(read.order, parseDeclaredDraftOrder(DRAFT_ORDER_PRESETS[0].order));
  assert.equal(read.rounds, 'linear');
  assert.equal(read.startWeek, 8);
});

test('with nothing declared, rookie-draft.yml declares nothing and still loads', () => {
  const text = renderRookieDraftConfig({});
  assert.deepEqual(readRookieDraftConfig(text), { order: null, rounds: null, startWeek: null });
  assert.match(text, /# order:/, 'an example is left in a comment');
});

test('init refuses to render a setting the loader would refuse', () => {
  assert.throws(() => renderRookieDraftConfig({ rounds: 'zigzag' }), /linear .* or snake/);
  assert.throws(() => renderRookieDraftConfig({ startWeek: 0 }), /start_week/);
  assert.throws(
    () => renderRookieDraftConfig({ order: [{ teams: 'non_playoff', sort: 'record', direction: 'ascending' }] }),
    /no group for playoff/,
  );
});

test('the rendered file loads through loadConfig itself', () => {
  const root = tempDir();
  writeFileSync(join(root, '.env'), 'SLEEPER_LEAGUE_ID=1\n');
  mkdirSync(join(root, 'config'));
  writeFileSync(
    join(root, 'config', 'rookie-draft.yml'),
    renderRookieDraftConfig({ order: DRAFT_ORDER_PRESETS[3].order, rounds: 'snake', startWeek: 9 }),
  );
  const config = loadConfig({ workspaceRoot: root });
  assert.deepEqual(config.rookieDraft.order, parseDeclaredDraftOrder(DRAFT_ORDER_PRESETS[3].order));
  assert.equal(config.rookieDraft.rounds, 'snake');
  assert.equal(config.rookieDraft.tankWatch.startWeek, 9);
});

test('.env is filled in where .env.example names each key, and extra keys are appended', () => {
  const text = renderEnv('# league\nSLEEPER_LEAGUE_ID=\n# format\nLEAGUE_FORMAT=\n', {
    SLEEPER_LEAGUE_ID: '42',
    LEAGUE_FORMAT: 'guillotine',
    EXTRA: 'x',
  });
  assert.equal(text, '# league\nSLEEPER_LEAGUE_ID=42\n# format\nLEAGUE_FORMAT=guillotine\n\nEXTRA=x\n');
});

test('every package file setup reads ships in the published package', () => {
  const { files } = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  for (const file of ['setup.mjs', '.env.example', 'config/guillotine.yml', 'config/prospects.example.yml']) {
    assert.ok(files.includes(file), `${file} is missing from "files" in package.json`);
  }
});

/* -------------------------------------------------------- setup, end to end */

const SETUP = join(PACKAGE_ROOT, 'setup.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-sleeper-fetch.mjs');
const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');

const DYNASTY_ID = '111111111111';
const REDRAFT_ID = '222222222222';

const LEAGUES = {
  [DYNASTY_ID]: {
    league_id: DYNASTY_ID,
    name: 'Test Dynasty League',
    season: '2026',
    settings: { type: 2, num_teams: 12, playoff_teams: 6, playoff_week_start: 15 },
    scoring_settings: { rec: 1, bonus_rec_te: 0.5, pass_td: 4 },
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN'],
  },
  [REDRAFT_ID]: {
    league_id: REDRAFT_ID,
    name: 'Office Chop',
    season: '2026',
    settings: { type: 0, num_teams: 18, playoff_teams: 0 },
    scoring_settings: { rec: 0.5, pass_td: 4 },
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'],
  },
};

/**
 * Runs setup with piped answers, one per line, against the stand-in Sleeper.
 * No league, workspace or key is taken from this shell, and HOME is a temp
 * folder so the offered ~/leagues folder lands somewhere disposable.
 */
function runSetup(answers, { workspace, home = tempDir('pressbox-home-'), log } = {}) {
  const env = { ...process.env };
  for (const key of ['SLEEPER_LEAGUE_ID', 'LEAGUE_FORMAT', 'DATA_DIR', 'OUTPUT_DIR', 'AI_PROVIDER', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', WORKSPACE_ENV_VAR]) {
    delete env[key];
  }
  if (workspace) env[WORKSPACE_ENV_VAR] = workspace;
  env.HOME = home;
  env.FAKE_SLEEPER_LEAGUES = JSON.stringify(LEAGUES);
  if (log) env.FAKE_SLEEPER_LOG = log;
  const result = spawnSync(process.execPath, ['--import', FAKE_FETCH, SETUP], {
    cwd: workspace ?? PACKAGE_ROOT,
    env,
    encoding: 'utf8',
    input: `${answers.join('\n')}\n`,
  });
  return { ...result, home };
}

// Answer scripts, in the order setup asks. '' takes the offered default.
const dynastyAnswers = ({ id = DYNASTY_ID, order = '', rounds = '1', startWeek = '8' } = {}) => [
  id, // league ID
  '', // is this your league? yes
  '', // display name: the league's
  '', // format: Sleeper's reading, dynasty
  '', // scoring matches
  order, // draft order: the first preset
  rounds, // rounds: linear
  startWeek, // tank watch start week
  '', // provider: paste it myself
  '', // tone
  '', // max post length
];

test('a dynasty league gets a folder that loads, with its declared format and draft rule', () => {
  const workspace = tempDir();
  const result = runSetup(dynastyAnswers(), { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Found "Test Dynasty League" — 12 teams, 2026 season/);

  const env = loadEnvFile(join(workspace, '.env'));
  assert.equal(env.SLEEPER_LEAGUE_ID, DYNASTY_ID);
  assert.equal(env.LEAGUE_FORMAT, 'dynasty');
  assert.ok(existsSync(join(workspace, 'data')) && existsSync(join(workspace, 'output')));

  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.leagueFormat, 'dynasty');
  assert.deepEqual(config.rookieDraft.order, parseDeclaredDraftOrder(DRAFT_ORDER_PRESETS[0].order));
  assert.equal(config.rookieDraft.rounds, 'linear');
  assert.equal(config.rookieDraft.tankWatch.startWeek, 8);
  assert.match(result.stdout, /The league folder loads/);
});

test('setup ends with the commands to run next, written for the league folder', () => {
  const workspace = tempDir();
  const result = runSetup(dynastyAnswers(), { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /You're on the air/);
  assert.match(result.stdout, / doctor\n/);
  assert.match(result.stdout, /record <reply file> --task rankings/);
  // Run from a league folder outside the clone, the short form would not resolve.
  assert.doesNotMatch(result.stdout, /node src\/cli\.mjs/);
});

test('the scoring Sleeper reports is shown back for confirmation', () => {
  const result = runSetup(dynastyAnswers(), { workspace: tempDir() });
  assert.match(result.stdout, /Reception\s+full PPR/);
  assert.match(result.stdout, /TE \+0\.5/);
  assert.match(result.stdout, /Superflex\s+yes/);
  assert.match(result.stdout, /Does that match your league\?/);
});

test('a dynasty league is pointed at the example board, and no prospect board is written', () => {
  const workspace = tempDir();
  const result = runSetup(dynastyAnswers(), { workspace });
  assert.match(result.stdout, /prospects\.example\.yml/);
  assert.ok(result.stdout.includes(join(workspace, 'config', 'prospects.2027.yml')));
  assert.deepEqual(readdirSync(join(workspace, 'config')), ['rookie-draft.yml']);
});

test('an invalid tank watch week is refused at the question and asked again', () => {
  const workspace = tempDir();
  const answers = dynastyAnswers({ startWeek: 'eight' });
  answers.splice(8, 0, '9'); // the second try at the start week
  const result = runSetup(answers, { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tank watch start week is "eight"/);
  assert.equal(loadConfig({ workspaceRoot: workspace }).rookieDraft.tankWatch.startWeek, 9);
});

test('"something else" leaves the draft rule undeclared, and the folder still loads', () => {
  const workspace = tempDir();
  const result = runSetup(dynastyAnswers({ order: String(DRAFT_ORDER_PRESETS.length + 1), rounds: '3', startWeek: '' }), { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.rookieDraft.order, null);
  assert.equal(config.rookieDraft.rounds, null);
});

test('a chopped league can be declared guillotine, and gets the empty ledger to fill in', () => {
  const workspace = tempDir();
  const result = runSetup(
    [REDRAFT_ID, '', '', '3', '', '', '', ''], // id, yes, name, guillotine, scoring, provider, tone, length
    { workspace },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Sleeper's settings say this is a redraft league/);
  assert.equal(loadEnvFile(join(workspace, '.env')).LEAGUE_FORMAT, 'guillotine');
  assert.equal(
    readFileSync(join(workspace, 'config', 'guillotine.yml'), 'utf8'),
    readFileSync(join(PACKAGE_ROOT, 'config', 'guillotine.yml'), 'utf8'),
  );
  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.leagueFormat, 'guillotine');
  assert.deepEqual(config.guillotine.eliminations, []);
  assert.match(result.stdout, /survival-preview/);
  assert.equal(existsSync(join(workspace, 'config', 'rookie-draft.yml')), false);
});

test('a redraft league writes no league config files at all', () => {
  const workspace = tempDir();
  const result = runSetup([REDRAFT_ID, '', '', '', '', '', '', ''], { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(loadEnvFile(join(workspace, '.env')).LEAGUE_FORMAT, 'redraft');
  assert.equal(existsSync(join(workspace, 'config')), false);
});

test('an unknown league ID is refused at entry, and giving up writes nothing', () => {
  const workspace = tempDir();
  const result = runSetup(['999999999999', 'n'], { workspace });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Sleeper has no league with ID "999999999999"/);
  assert.deepEqual(readdirSync(workspace), []);
});

test('the provider and key go into the workspace .env, ready for --generate', () => {
  const workspace = tempDir();
  const answers = dynastyAnswers();
  answers.splice(8, 1, '2', 'sk-ant-test-key', ''); // Claude, a key, the default model
  const result = runSetup(answers, { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = loadConfig({ workspaceRoot: workspace });
  assert.equal(config.ai.provider, 'anthropic');
  assert.equal(config.ai.anthropicKey, 'sk-ant-test-key');
  assert.ok(config.ai.model);
  assert.equal(readFileSync(join(workspace, 'config', 'rookie-draft.yml'), 'utf8').includes('sk-ant'), false);
});

/* ------------------------------------------------------------- running twice */

test('a second run offers the first run\'s answers, and replaces nothing when told not to', () => {
  const workspace = tempDir();
  assert.equal(runSetup(dynastyAnswers(), { workspace }).status, 0);
  const envBefore = readFileSync(join(workspace, '.env'), 'utf8');
  const draftBefore = readFileSync(join(workspace, 'config', 'rookie-draft.yml'), 'utf8');

  // The league ID is the default now; the draft settings are offered to keep.
  const result = runSetup(['', '', '', '', '', '', '', '', '', 'n'], { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[111111111111\]/);
  assert.match(result.stdout, /Keep these rookie draft settings\?/);
  assert.match(result.stdout, /Replace the settings in/);
  assert.match(result.stdout, /Nothing was written/);
  assert.equal(readFileSync(join(workspace, '.env'), 'utf8'), envBefore);
  assert.equal(readFileSync(join(workspace, 'config', 'rookie-draft.yml'), 'utf8'), draftBefore);
  assert.equal(existsSync(join(workspace, '.env.backup')), false);
});

test('a second run that changes the draft rule backs up both files first', () => {
  const workspace = tempDir();
  assert.equal(runSetup(dynastyAnswers(), { workspace }).status, 0);
  const draftBefore = readFileSync(join(workspace, 'config', 'rookie-draft.yml'), 'utf8');

  // Don't keep the settings; choose every team by record, snake, keep the
  // offered start week; confirm.
  const result = runSetup(['', '', '', '', '', 'n', '4', '2', '', '', '', '', 'y'], { workspace });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(workspace, 'config', 'rookie-draft.yml.backup'), 'utf8'), draftBefore);
  assert.ok(existsSync(join(workspace, '.env.backup')));
  const config = loadConfig({ workspaceRoot: workspace });
  assert.deepEqual(config.rookieDraft.order, parseDeclaredDraftOrder(DRAFT_ORDER_PRESETS[3].order));
  assert.equal(config.rookieDraft.rounds, 'snake');
  assert.equal(config.rookieDraft.tankWatch.startWeek, 8);
});

test('a folder holding a different league is not taken over without asking', () => {
  const workspace = tempDir();
  writeFileSync(join(workspace, '.env'), `SLEEPER_LEAGUE_ID=${REDRAFT_ID}\n`);
  const result = runSetup([DYNASTY_ID, '', 'n'], { workspace });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /already holds a different league \(ID 222222222222\)/);
  assert.equal(readFileSync(join(workspace, '.env'), 'utf8'), `SLEEPER_LEAGUE_ID=${REDRAFT_ID}\n`);
});

/* -------------------------------------------------- started in the package */

test('started in the package, setup writes the league to its own folder and nothing into the package', () => {
  const home = tempDir('pressbox-home-');
  const packageFiles = readdirSync(PACKAGE_ROOT).sort();
  const packageConfig = readdirSync(join(PACKAGE_ROOT, 'config')).map((file) => [
    file,
    readFileSync(join(PACKAGE_ROOT, 'config', file), 'utf8'),
  ]);
  const packageEnv = existsSync(join(PACKAGE_ROOT, '.env')) ? readFileSync(join(PACKAGE_ROOT, '.env'), 'utf8') : null;

  // A checkout that still holds its operator's league is told about migrate first.
  const preamble = packageEnv === null ? [] : ['y'];
  const answers = [...preamble, ...dynastyAnswers()];
  answers.splice(preamble.length + 2, 0, ''); // after "is this your league": take the offered folder
  const result = runSetup(answers, { workspace: PACKAGE_ROOT, home });
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const league = join(home, 'leagues', 'test-dynasty-league');
  assert.equal(loadEnvFile(join(league, '.env')).SLEEPER_LEAGUE_ID, DYNASTY_ID);
  assert.ok(existsSync(join(league, 'config', 'rookie-draft.yml')));
  assert.ok(result.stdout.includes(`${CLI} doctor`), 'the next steps name the CLI by its full path');

  assert.deepEqual(readdirSync(PACKAGE_ROOT).sort(), packageFiles);
  for (const [file, body] of packageConfig) {
    assert.equal(readFileSync(join(PACKAGE_ROOT, 'config', file), 'utf8'), body, file);
  }
  assert.equal(existsSync(join(PACKAGE_ROOT, '.env')) ? readFileSync(join(PACKAGE_ROOT, '.env'), 'utf8') : null, packageEnv);
});

test('a league folder inside the package is refused and asked for again', () => {
  const home = tempDir('pressbox-home-');
  const preamble = existsSync(join(PACKAGE_ROOT, '.env')) ? ['y'] : [];
  const answers = [...preamble, ...dynastyAnswers()];
  const outside = join(home, 'elsewhere');
  answers.splice(preamble.length + 2, 0, join(PACKAGE_ROOT, 'leagues', 'x'), outside);
  const result = runSetup(answers, { workspace: PACKAGE_ROOT, home });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /inside the Fantasy Pressbox folder/);
  assert.equal(existsSync(join(PACKAGE_ROOT, 'leagues')), false);
  assert.equal(loadEnvFile(join(outside, '.env')).SLEEPER_LEAGUE_ID, DYNASTY_ID);
});
