/**
 * The edition descriptors (src/options.mjs) and the shared edition steps
 * (src/edition.mjs).
 *
 * OPTIONS and EDITIONS are what the command line builds its `--help` and its
 * parser from, and what the website builds its controls from. These tests keep
 * the two surfaces honest: no flag the descriptors do not describe, no edition
 * `--help` leaves out, and core steps the browser can load.
 *
 * Invented data only (tests/fixtures/fake-sleeper-api-fetch.mjs, league
 * 000000000000000000); nothing touches the network.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { PACKAGE_ROOT, WORKSPACE_ENV_VAR, loadConfig, loadDiskAssets } from '../src/config.mjs';
import { FORMAT_TYPES } from '../src/format.mjs';
import { RANKING_TASKS, TASKS } from '../src/promptContext.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { refuseTankWatch } from '../src/tankWatch.mjs';
import { refuseFutureStock } from '../src/futureStock.mjs';
import { refuseFiveYearPlan } from '../src/fiveYearPlan.mjs';
import {
  EDITIONS,
  OPTIONS,
  RECORDABLE_TASKS,
  editionForCommand,
  editionOptions,
  optionNamed,
  parseArgs,
} from '../src/options.mjs';
import {
  prepareEdition,
  recordEdition,
  refuseCliOnly,
  refuseOrdinaryEditionInGuillotineLeague,
  refuseSurvivalEditionWithoutEliminations,
} from '../src/edition.mjs';
import { describeCommands, describeOptions } from '../src/cli.mjs';

const SRC = join(PACKAGE_ROOT, 'src');
const CLI = join(SRC, 'cli.mjs');
const FAKE_API = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-sleeper-api-fetch.mjs');

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------------ the parser */

const described = new Set(OPTIONS.flatMap((option) => (option.flag ? [option.flag, ...option.aliases] : [])));

/** Every `--flag` string literal written anywhere under src/, comments included. */
function flagsWrittenInSource() {
  const flags = new Set();
  for (const path of readdirSync(SRC, { recursive: true }).filter((file) => file.endsWith('.mjs'))) {
    const code = readFileSync(join(SRC, path), 'utf8');
    for (const [, flag] of code.matchAll(/['"`](--[a-z][a-z-]*)\b/g)) flags.add(flag);
  }
  return flags;
}

test('parseArgs refuses every flag OPTIONS does not describe, including any the code mentions', () => {
  const undescribed = [...flagsWrittenInSource(), '--verbose', '--dry-run', '--force', '--json', '--weeks', '--formats']
    .filter((flag) => !described.has(flag));
  assert.ok(undescribed.length > 0, 'expected some undescribed flags to probe');
  for (const flag of undescribed) {
    assert.throws(() => parseArgs([flag, '3']), { message: `Unknown option "${flag}". Try --help.` }, flag);
  }
});

test('parseArgs reads every flag OPTIONS describes, and only because OPTIONS describes it', () => {
  for (const option of OPTIONS.filter((o) => o.flag)) {
    const value = option.kind === 'integer' ? '3' : option.values ? option.values[0] : 'folder';
    const argv = option.kind === 'boolean' ? [option.flag] : [option.flag, value];
    const args = parseArgs(argv);
    assert.equal(args[option.name], option.kind === 'boolean' ? true : option.kind === 'integer' ? 3 : value, option.flag);
    // Drop the option from the descriptors and the same flag is refused: the
    // parser has no knowledge of its own.
    const without = OPTIONS.filter((o) => o !== option);
    assert.throws(() => parseArgs(argv, { options: without }), /Unknown option/, option.flag);
  }
  assert.equal(parseArgs(['-h']).help, true);
});

test('parseArgs keeps the positional arguments and the --workspace refusal', () => {
  assert.deepEqual(parseArgs(['record', 'out.txt', '--task', 'preview', '--week', '2']), {
    _: ['record', 'out.txt'],
    task: 'preview',
    week: 2,
  });
  assert.throws(() => parseArgs(['doctor', '--workspace']), {
    message: '--workspace needs a folder, e.g. --workspace ~/leagues/my-league',
  });
  assert.throws(() => parseArgs(['doctor', '--workspace', '--week']), /--workspace needs a folder/);
});

test('editionOptions passes on only the options OPTIONS names for that edition', () => {
  const args = parseArgs(['tank-watch', '--early', '--refresh-market', '--format', 'imessage', '--workspace', 'x']);
  assert.deepEqual(editionOptions('tank-watch', args), { format: 'imessage', early: true });
  assert.deepEqual(editionOptions('trade-report', args), { format: 'imessage', refreshMarket: true });
});

test('parseArgs reads --team, refuses it without a value, and only the five-year plan receives it', () => {
  const args = parseArgs(['five-year-plan', '--team', 'Bye Week Blues', '--week', '4']);
  assert.deepEqual(args, { _: ['five-year-plan'], team: 'Bye Week Blues', week: 4 });
  assert.deepEqual(editionOptions('five-year-plan', args), { team: 'Bye Week Blues', week: 4 });
  assert.deepEqual(editionOptions('future-stock', args), { week: 4 });
  for (const argv of [['five-year-plan', '--team'], ['five-year-plan', '--team', '--week', '4']]) {
    assert.throws(() => parseArgs(argv), { message: '--team needs a team name or roster id, e.g. --team 3' });
  }
  assert.match(help, /^ {2}--team <name\|id> +Which team a five-year plan is about: its name or roster id$/m);
  assert.match(help, /^ {2}five-year-plan +Plan one team's next five seasons, chosen with --team \(dynasty leagues\)$/m);
});

/* ---------------------------------------------------------- the descriptors */

test('EDITIONS names each edition once, every one a prompt that exists', () => {
  const names = EDITIONS.map((edition) => edition.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.ok(TASKS.includes(name), name);
  const commands = EDITIONS.map((edition) => edition.command).filter(Boolean);
  assert.equal(new Set(commands).size, commands.length);
});

test('recordable and forward-looking come from the lists recordBlock and resolveWeek read', () => {
  assert.deepEqual(
    EDITIONS.filter((edition) => edition.recordable).map((edition) => edition.name).sort(),
    [...RECORDABLE_TASKS].sort(),
  );
  for (const task of RANKING_TASKS) assert.ok(RECORDABLE_TASKS.includes(task), task);
  assert.deepEqual(
    EDITIONS.filter((edition) => edition.forwardLooking).map((edition) => edition.name),
    ['preview', 'survival-preview'],
  );
  assert.deepEqual(optionNamed('task').values, RECORDABLE_TASKS);
});

/** Whether the refusals that run before a league is opened let `task` through for a declared `formatType`. */
function allowedByRefusals(task, formatType) {
  const config = { leagueFormat: formatType };
  try {
    refuseOrdinaryEditionInGuillotineLeague(config, task);
    refuseSurvivalEditionWithoutEliminations(config, task);
    if (task === 'future-stock') refuseFutureStock({ formatType });
    if (task === 'five-year-plan') refuseFiveYearPlan({ formatType });
    if (task === 'tank-watch') refuseTankWatch({ formatType, rule: null });
    return true;
  } catch (error) {
    // The tank watch refuses a dynasty league with no draft rule too; that is
    // a setting, not the format.
    if (task === 'tank-watch' && /No rookie draft order is declared/.test(error.message)) return true;
    return false;
  }
}

test("each edition's formats are exactly the formats its refusals allow", () => {
  for (const edition of EDITIONS) {
    const allowed = FORMAT_TYPES.filter((type) => allowedByRefusals(edition.name, type));
    assert.deepEqual([...edition.formats].sort(), allowed.sort(), edition.name);
  }
});

test('every option names editions that exist, and the CLI-only ones say why', () => {
  for (const option of OPTIONS) {
    for (const name of option.editions) assert.ok(EDITIONS.some((edition) => edition.name === name), `${option.name}: ${name}`);
    if (option.cliOnly !== null) assert.equal(typeof option.cliOnly, 'string', option.name);
    if (option.default !== null && option.values) assert.ok(option.values.includes(option.default), option.name);
  }
  // --generate is the one option that changes an edition and is only on the command line.
  assert.deepEqual(
    OPTIONS.filter((option) => option.cliOnly && option.editions.length).map((option) => option.flag),
    ['--generate'],
  );
  assert.deepEqual(Object.keys(optionNamed('espnRoute').cliOnlyValues), ['fetch']);
  assert.match(optionNamed('workspace').help.join(' '), new RegExp(`\\$${WORKSPACE_ENV_VAR}\\b`));
});

/* --------------------------------------------------------------- --help */

const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' }).stdout;
const section = (title, next) => help.slice(help.indexOf(`\n${title}\n`) + title.length + 2, help.indexOf(`\n\n${next}\n`));

test('--help lists exactly the options in OPTIONS', () => {
  const listed = [...section('Options', 'Examples').matchAll(/^ {2}(--[a-z-]+)/gm)].map((m) => m[1]);
  assert.deepEqual(listed, OPTIONS.filter((option) => option.flag).map((option) => option.flag));
});

test('--help lists exactly the editions in EDITIONS that a command builds', () => {
  const commands = section('Commands', 'Options');
  const listed = new Set([...commands.matchAll(/^ {2}([a-z-]+)/gm)].map((m) => m[1]));
  const built = EDITIONS.filter((edition) => edition.command);
  for (const edition of built) {
    assert.match(commands, new RegExp(`^ {2}${edition.command} +${edition.summary.replace(/[()]/g, '\\$&')}$`, 'm'));
  }
  const others = ['init', 'doctor', 'migrate', 'export-league', 'import-league', 'record', 'grade', 'check', 'fetch', 'import-espn'];
  assert.deepEqual([...listed].sort(), [...others, ...built.map((edition) => edition.command)].sort());
});

test('--help reads as it did before the descriptors drove it', () => {
  const expected = readFileSync(join(PACKAGE_ROOT, 'tests', 'fixtures', 'help-commands-and-options.txt'), 'utf8');
  assert.equal(`Commands\n${describeCommands()}\n\nOptions\n${describeOptions()}\n`, expected);
});

test("main dispatches every edition's command to that edition", () => {
  const source = readFileSync(CLI, 'utf8');
  const main = source.slice(source.indexOf('async function main()'));
  const constants = { TANK_WATCH_TASK: 'tank-watch', FUTURE_STOCK_TASK: 'future-stock', FIVE_YEAR_PLAN_TASK: 'five-year-plan' };
  const cases = [...main.matchAll(/case (?:'([a-z-]+)'|([A-Z_]+)):/g)].map((m) => m[1] ?? constants[m[2]]);
  for (const edition of EDITIONS.filter((e) => e.command)) {
    assert.ok(cases.includes(edition.command), edition.command);
    assert.equal(editionForCommand(edition.command), edition);
  }
});

/* ------------------------------------------------------- browser-safe core */

/** Every module `entry` imports, transitively, with its import specifiers. */
function importGraph(entry) {
  const seen = new Map();
  const visit = (file) => {
    if (seen.has(file)) return;
    const code = readFileSync(file, 'utf8');
    const specifiers = [
      ...code.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm),
      ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier));
    }
  };
  visit(entry);
  return seen;
}

test('prepareEdition, recordEdition and the league file import nothing from node:, directly or through anything they import', () => {
  for (const entry of ['edition.mjs', 'options.mjs', 'leagueFile.mjs']) {
    const graph = importGraph(join(SRC, entry));
    assert.ok(graph.size > 10, `${entry} graph looks too small: ${graph.size}`);
    for (const [file, specifiers] of graph) {
      for (const specifier of specifiers) {
        const builtin = specifier.startsWith('node:') || builtinModules.includes(specifier);
        assert.ok(!builtin, `${file.slice(PACKAGE_ROOT.length + 1)} imports ${specifier}`);
      }
    }
  }
});

/* ------------------------------------------------------- CLI-only refusals */

const espnSettings = (route) => ({ league: { provider: 'espn', route }, leagueFormat: null });

test('only the command line builds from an ESPN league on the fetch route, and the refusal says why', async () => {
  assert.doesNotThrow(() => refuseCliOnly({ settings: espnSettings('fetch'), surface: 'cli' }));
  assert.doesNotThrow(() => refuseCliOnly({ settings: espnSettings('import'), surface: 'core' }));
  await assert.rejects(
    prepareEdition({ task: 'recap', settings: espnSettings('fetch'), store: createMemoryStore() }),
    (error) => {
      assert.match(error.message, /ESPN_ROUTE=fetch/);
      assert.match(error.message, /only the command line/);
      assert.match(error.message, /ESPN_ROUTE=import/);
      return true;
    },
  );
});

test('--generate is refused off the command line, naming the reason', async () => {
  const settings = { league: { provider: 'sleeper' }, leagueFormat: null };
  assert.throws(
    () => refuseCliOnly({ settings, options: { generate: true }, surface: 'core' }),
    /--generate is only on the command line: the website never calls an AI/,
  );
  assert.doesNotThrow(() => refuseCliOnly({ settings, options: { generate: true }, surface: 'cli' }));
  assert.doesNotThrow(() => refuseCliOnly({ settings, options: { generate: false }, surface: 'core' }));
});

/* ----------------------------------------- the same steps, CLI and core */

const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID', 'SLEEPER_SEASON', 'SLEEPER_POST_MAX_LENGTH', 'POST_MAX_LENGTH', 'ESPN_LEAGUE_ID',
  'ESPN_S2', 'ESPN_SWID', 'ESPN_ROUTE', 'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'FANTASY_WEEK',
  'DATA_DIR', 'OUTPUT_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', WORKSPACE_ENV_VAR,
];

function leagueFolder() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-options-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=redraft\n`);
  return root;
}

test('prepareEdition in memory builds the prompt the CLI writes, and recordEdition files the reply', async (t) => {
  for (const key of ENV_KEYS) {
    if (process.env[key] !== undefined) return t.skip(`${key} is set in this environment`);
  }
  // The CLI, against the fake Sleeper API, writing to a league folder.
  const root = leagueFolder();
  const env = { ...process.env };
  const cli = spawnSync(process.execPath, ['--import', FAKE_API, CLI, 'rankings', '--week', '1', '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(cli.status, 0, `${cli.stdout}\n${cli.stderr}`);
  const written = readFileSync(join(root, 'output', '2026-week01-rankings-prompt.md'), 'utf8');

  // Core, in this process: the same settings, a memory store and a memory player cache.
  await import('./fixtures/fake-sleeper-api-fetch.mjs');
  const config = loadConfig({ workspaceRoot: leagueFolder() });
  const store = createMemoryStore();
  const said = [];
  const prepared = await prepareEdition({
    task: 'rankings',
    week: 1,
    settings: { ...config, playerCache: createMemoryPlayerCache() },
    store,
    assets: loadDiskAssets({ promptsDir: config.promptsDir }),
    log: { say: (line) => said.push(line), warn: (line) => said.push(line) },
  });
  assert.equal(prepared.built, true);
  assert.equal(prepared.fileStem, '2026-week01-rankings');
  // Identical but for the moment each was built.
  const undated = (text) => text.replace(/"generatedAt": "[^"]+"/g, '"generatedAt": "…"');
  assert.match(written, /"generatedAt": "/);
  assert.equal(undated(`${prepared.prompt}\n`), undated(written));
  assert.match(said[0], /^Building rankings for week 1 \(week chosen from --week\)\.$/);

  const team = prepared.teams[0].name;
  const reply = `Post one\n%%%\n\`\`\`json\n[{ "rank": 1, "team": ${JSON.stringify(team)} }]\n\`\`\`\n`;
  const recorded = recordEdition({
    task: 'rankings',
    week: 1,
    text: reply,
    store,
    league: prepared.league,
    teams: prepared.teams,
    log: { say: (line) => said.push(line), warn() {} },
  });
  assert.equal(recorded, true);
  assert.ok(said.includes('Recording rankings for week 1.'));
  assert.equal(store.loadPreviousRankings('2026', 2).rankings[0].team, team);

  assert.throws(
    () => recordEdition({ task: 'rankings', week: 1, text: 'no block here', store, league: prepared.league, teams: prepared.teams }),
    /No JSON block found at the end of that file/,
  );
});

test('recordEdition refuses a call without teams and saves nothing', () => {
  const saved = [];
  const store = new Proxy({}, { get: (_, name) => (...args) => saved.push([name, args]) });
  const reply = 'Post\n%%%\n```json\n[{ "rank": 1, "team": "Typo Team" }]\n```\n';
  for (const teams of [undefined, null, 'nope']) {
    assert.throws(
      () => recordEdition({ task: 'rankings', week: 1, text: reply, store, league: { season: '2026' }, teams }),
      /needs the `teams` argument/,
    );
  }
  assert.deepEqual(saved, []);
});
