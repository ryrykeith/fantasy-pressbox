import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { loadConfig, loadProspectBoard, PACKAGE_ROOT, workspaceConfigDir, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { createTeamIdentity, presentPreviousRankings } from '../src/teamIdentity.mjs';
import { copyLeagueWorkspace, isLeagueWorkspace, requireLeagueWorkspace } from '../src/workspace.mjs';

// One league per folder: the folder's .env marks it, every league command
// refuses to run outside one, and a league can be copied into a new folder
// without anything in the old one being touched.

function tempDir(prefix = 'pressbox-league-') {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function write(root, rel, body) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return path;
}

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');

/** Runs the CLI with no league or workspace taken from this shell. */
function runCli(args, { cwd, env = {}, input = '' }) {
  const clean = { ...process.env };
  for (const key of ['SLEEPER_LEAGUE_ID', 'LEAGUE_FORMAT', 'DATA_DIR', 'OUTPUT_DIR', WORKSPACE_ENV_VAR]) delete clean[key];
  return spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...clean, ...env }, encoding: 'utf8', input });
}

const RULE_YAML =
  'order:\n' +
  '  - teams: non_playoff\n    sort: max_points_for\n    direction: ascending\n' +
  '  - teams: playoff\n    sort: max_points_for\n    direction: ascending\n' +
  'rounds: linear\n';

const BOARD_YAML =
  'draftYear: 2027\nupdated: 2026-10-01\nentries:\n  - rank: 1\n    name: First Prospect\n    position: QB\n' +
  '    school: Somewhere\n    source: Example Dynasty Weekly, https://example.com/board\n';

/**
 * A dynasty league as it stood after week 4: rankings for weeks 1-4, and
 * snapshots in which roster 3 was "user4817" through week 3 and renamed
 * "Pick Six Appeal" in week 4 — the shape of the operator's own league.
 */
function dynastyLeague(root) {
  write(root, '.env', 'SLEEPER_LEAGUE_ID=111\nLEAGUE_FORMAT=dynasty\n');
  write(root, 'config/rookie-draft.yml', RULE_YAML);
  write(root, 'config/prospects.2027.yml', BOARD_YAML);
  const store = createStore({ dataDir: join(root, 'data') });
  for (let week = 1; week <= 4; week++) {
    const third = week < 4 ? 'user4817' : 'Pick Six Appeal';
    store.saveSnapshot('2026', week, {
      week,
      teams: [
        { rosterId: 1, name: 'Alpha' },
        { rosterId: 2, name: 'Bravo' },
        { rosterId: 3, name: third },
      ],
    });
    store.saveRankings('2026', `week-${week}`, {
      season: '2026',
      label: `week-${week}`,
      week,
      rankings: [
        { rank: 1, team: third },
        { rank: 2, team: 'Alpha' },
        { rank: 3, team: 'Bravo' },
      ],
    });
  }
  store.savePredictions('2026', 2, [{ team_a: 'Alpha', team_b: 'Bravo', predicted_winner: 'Alpha' }]);
  write(root, 'data/tank-watch/2026/week-4.json', '{}\n');
  write(root, 'data/market/2026/week-4.json', '{}\n');
  write(root, 'data/cache/players-nfl.json', '{}\n');
  write(root, 'output/2026-week04-rankings-published.txt', 'published\n');
  return root;
}

function listTree(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(`${rel}:${readFileSync(join(dir, entry.name), 'utf8')}`);
    }
  };
  walk(root, '');
  return out.sort();
}

function copyOf(source, destination, extra = {}) {
  const config = loadConfig({ workspaceRoot: source });
  return copyLeagueWorkspace({
    source,
    destination,
    dataDir: config.dataDir,
    outputDir: config.outputDir,
    ...extra,
  });
}

/* ---------------------------------------------------------- what a league is */

test('a folder is a league workspace when it holds a .env, and only then', () => {
  const root = tempDir();
  assert.equal(isLeagueWorkspace(root), false);
  mkdirSync(join(root, 'data'));
  assert.equal(isLeagueWorkspace(root), false, 'data alone does not make a league');
  writeFileSync(join(root, '.env'), 'SLEEPER_LEAGUE_ID=1\n');
  assert.equal(isLeagueWorkspace(root), true);
});

test('outside a workspace the refusal names init as the fix, and the folder it looked in', () => {
  const root = tempDir();
  assert.throws(
    () => requireLeagueWorkspace(root, { initCommand: 'fantasy-pressbox init' }),
    (error) =>
      error.message.includes(root) &&
      error.message.includes('fantasy-pressbox init') &&
      /--workspace/.test(error.message),
  );
  writeFileSync(join(root, '.env'), '');
  assert.doesNotThrow(() => requireLeagueWorkspace(root, { initCommand: 'x' }));
});

for (const command of ['recap', 'rankings', 'preview', 'fetch', 'grade', 'tank-watch', 'transactions']) {
  test(`${command} outside any workspace refuses, naming init, and writes nothing`, () => {
    const cwd = tempDir();
    // Even with a league ID exported in the shell: the folder is what decides.
    const result = runCli([command], { cwd, env: { SLEEPER_LEAGUE_ID: '111' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a league folder/);
    assert.match(result.stderr, /init/);
    assert.ok(result.stderr.includes(`${CLI} init`), 'the fix is a command that runs from anywhere');
    assert.deepEqual(readdirSync(cwd), []);
  });
}

test('doctor outside any workspace says so, names init, and stops before Sleeper', () => {
  const cwd = tempDir();
  const result = runCli(['doctor'], { cwd, env: { SLEEPER_LEAGUE_ID: '111' } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Workspace\s+.*✗ not a league folder/);
  assert.ok(result.stdout.includes(`${CLI} init`));
  assert.doesNotMatch(result.stdout, /Contacting Sleeper/);
});

test('check needs no league: it only measures a file', () => {
  const cwd = tempDir();
  const file = write(cwd, 'posts.txt', 'a short post\n');
  const result = runCli(['check', file], { cwd });
  assert.equal(result.status, 0, result.stderr);
});

/* ------------------------------------------------------------------- init */

test('init creates the named league folder and runs setup there', () => {
  const parent = tempDir();
  const league = join(parent, 'leagues', 'new-league');
  // No answers piped in: setup stops at its first question, after the folder exists.
  const result = runCli(['init', '--workspace', league], { cwd: parent });
  assert.ok(existsSync(league), 'init makes the folder it was pointed at');
  assert.match(result.stdout, /Fantasy Pressbox setup/);
  assert.equal(existsSync(join(PACKAGE_ROOT, 'leagues')), false);
});

/* -------------------------------------------------- two leagues side by side */

test('two workspaces in different formats load their own league, config, data and output', () => {
  const dynasty = dynastyLeague(tempDir());
  const guillotine = tempDir();
  write(guillotine, '.env', 'SLEEPER_LEAGUE_ID=222\nLEAGUE_FORMAT=guillotine\n');
  write(guillotine, 'config/guillotine.yml', 'eliminations:\n  1: "Gone Early"\n');
  write(guillotine, 'config/editorial.yml', 'tone: unhinged\n');

  const saved = process.env.SLEEPER_LEAGUE_ID;
  delete process.env.SLEEPER_LEAGUE_ID;
  try {
    // Loaded one after the other in one process, as a test runner or a future
    // multi-league command would: the second must not inherit the first's ID.
    const a = loadConfig({ workspaceRoot: dynasty });
    const b = loadConfig({ workspaceRoot: guillotine });
    const again = loadConfig({ workspaceRoot: dynasty });

    assert.equal(a.leagueId, '111');
    assert.equal(b.leagueId, '222');
    assert.equal(again.leagueId, '111');
    assert.equal(a.leagueFormat, 'dynasty');
    assert.equal(b.leagueFormat, 'guillotine');

    assert.equal(a.dataDir, join(dynasty, 'data'));
    assert.equal(b.dataDir, join(guillotine, 'data'));
    assert.equal(a.outputDir, join(dynasty, 'output'));
    assert.equal(b.outputDir, join(guillotine, 'output'));

    assert.ok(a.rookieDraft.order, 'the dynasty league has its draft rule');
    assert.equal(b.rookieDraft.order, null, 'the guillotine league does not borrow it');
    assert.equal(a.guillotine.eliminations.length, 0);
    assert.equal(b.guillotine.eliminations.length, 1);
    assert.equal(b.editorial.tone, 'unhinged');
    assert.notEqual(a.editorial.tone, 'unhinged', "one league's override is not the other's");
  } finally {
    if (saved === undefined) delete process.env.SLEEPER_LEAGUE_ID;
    else process.env.SLEEPER_LEAGUE_ID = saved;
  }
  assert.equal(process.env.SLEEPER_LEAGUE_ID, saved, 'loading a league leaves the real environment alone');
});

test('a real environment variable still overrides the .env', () => {
  const root = tempDir();
  write(root, '.env', 'SLEEPER_LEAGUE_ID=111\n');
  const saved = process.env.SLEEPER_LEAGUE_ID;
  process.env.SLEEPER_LEAGUE_ID = '999';
  try {
    assert.equal(loadConfig({ workspaceRoot: root }).leagueId, '999');
  } finally {
    if (saved === undefined) delete process.env.SLEEPER_LEAGUE_ID;
    else process.env.SLEEPER_LEAGUE_ID = saved;
  }
});

/* -------------------------------------------------------------- migration */

test('a copied league measures week 5 against week 4 and still resolves the rename', () => {
  const source = dynastyLeague(tempDir());
  const destination = join(tempDir(), 'mid-league');
  copyOf(source, destination);

  const config = loadConfig({ workspaceRoot: destination });
  assert.equal(config.dataDir, join(destination, 'data'));
  const store = createStore({ dataDir: config.dataDir });
  const previous = store.loadPreviousRankings('2026', 5);
  assert.equal(previous.week, 4);

  // Week 3's ranking was published under the old name; the copied snapshots
  // are what tell the identity that it is the team now called Pick Six Appeal.
  const identity = createTeamIdentity({
    teams: [
      { rosterId: 1, name: 'Alpha' },
      { rosterId: 2, name: 'Bravo' },
      { rosterId: 3, name: 'Pick Six Appeal' },
    ],
    history: store.loadTeamNameHistory('2026'),
  });
  const week3 = presentPreviousRankings(store.loadPreviousRankings('2026', 4), identity);
  assert.deepEqual(week3.renamed, [{ from: 'user4817', to: 'Pick Six Appeal' }]);
  assert.deepEqual(week3.unresolved, []);
});

test('a copied league keeps its draft rule, linear rounds and prospect board', () => {
  const source = dynastyLeague(tempDir());
  const destination = join(tempDir(), 'copy');
  copyOf(source, destination);
  const config = loadConfig({ workspaceRoot: destination });
  assert.equal(config.rookieDraft.rounds, 'linear');
  assert.equal(config.rookieDraft.order.groups.length, 2);
  assert.equal(config.sources.rookieDraft, join(destination, 'config', 'rookie-draft.yml'));
  const board = loadProspectBoard({ draftYear: 2027, configDir: workspaceConfigDir(destination) });
  assert.equal(board.entries[0].name, 'First Prospect');
});

test('the copy carries all of data and output, and leaves the source exactly as it was', () => {
  const source = dynastyLeague(tempDir());
  const before = listTree(source);
  const destination = join(tempDir(), 'copy');
  const copied = copyOf(source, destination);

  assert.deepEqual(listTree(source), before, 'nothing in the source moved, changed or went');
  assert.deepEqual(listTree(destination), before, 'the new folder holds every file');
  assert.deepEqual(
    copied.map((item) => item.what),
    ['.env', 'config/prospects.2027.yml', 'config/rookie-draft.yml', 'data/', 'output/'],
  );
});

test('a workspace copy brings its overrides; a copy from the package leaves the shipped defaults behind', () => {
  const source = dynastyLeague(tempDir());
  write(source, 'config/editorial.yml', 'tone: analytical\n');
  write(source, 'config/rankings.yml', 'weekly:\n  max_normal_movement: 4\n');
  write(source, 'config/prospects.example.yml', 'example\n');
  write(source, 'config/bye-weeks.2026.yml', 'table\n');
  write(source, 'prompts/weekly-recap.md', 'mine\n');

  const asWorkspace = join(tempDir(), 'a');
  copyOf(source, asWorkspace);
  assert.deepEqual(readdirSync(join(asWorkspace, 'config')).sort(), [
    'editorial.yml',
    'prospects.2027.yml',
    'rankings.yml',
    'rookie-draft.yml',
  ]);
  assert.ok(existsSync(join(asWorkspace, 'prompts', 'weekly-recap.md')));

  const asPackage = join(tempDir(), 'b');
  copyOf(source, asPackage, { fromPackage: true });
  assert.deepEqual(readdirSync(join(asPackage, 'config')).sort(), ['prospects.2027.yml', 'rookie-draft.yml']);
  assert.equal(existsSync(join(asPackage, 'prompts')), false);
});

test('from the package, an empty template is left behind and a declared one travels', () => {
  const source = dynastyLeague(tempDir());
  write(source, 'config/guillotine.yml', '# the template\neliminations:\n  # 1: "Bye Week Blues"\n');
  const fromPackage = join(tempDir(), 'p');
  copyOf(source, fromPackage, { fromPackage: true });
  assert.equal(existsSync(join(fromPackage, 'config', 'guillotine.yml')), false);
  assert.ok(existsSync(join(fromPackage, 'config', 'rookie-draft.yml')), 'the declared rule is the league’s');

  // A workspace's own file is the operator's, empty or not.
  const fromWorkspace = join(tempDir(), 'w');
  copyOf(source, fromWorkspace);
  assert.ok(existsSync(join(fromWorkspace, 'config', 'guillotine.yml')));
});

test('a copy is refused into a folder that already holds anything', () => {
  const source = dynastyLeague(tempDir());
  const destination = tempDir();
  writeFileSync(join(destination, 'notes.txt'), 'mine');
  assert.throws(() => copyOf(source, destination), /not empty/);
  assert.deepEqual(readdirSync(destination), ['notes.txt']);
});

test('an empty existing folder is a fine destination', () => {
  const source = dynastyLeague(tempDir());
  const destination = tempDir();
  copyOf(source, destination);
  assert.ok(isLeagueWorkspace(destination));
});

test('a copy into the league folder itself, or around it, is refused', () => {
  const source = dynastyLeague(tempDir());
  assert.throws(() => copyOf(source, join(source, 'nested')), /inside/);
  assert.equal(existsSync(join(source, 'nested')), false);
  assert.throws(() => copyOf(source, dirname(source)), /inside|not empty/);
});

test('a data folder outside the league is refused, since both copies would share it', () => {
  const source = dynastyLeague(tempDir());
  const shared = tempDir();
  write(source, '.env', `SLEEPER_LEAGUE_ID=111\nDATA_DIR=${shared}\n`);
  const destination = join(tempDir(), 'copy');
  assert.throws(() => copyOf(source, destination), /DATA_DIR/);
  assert.equal(existsSync(destination), false, 'refused before anything was written');
});

test('a relative data folder inside the league lands at the same place in the copy', () => {
  const source = dynastyLeague(tempDir());
  write(source, '.env', 'SLEEPER_LEAGUE_ID=111\nDATA_DIR=history\n');
  write(source, 'history/rankings/2026/week-4.json', '{"week":4}');
  const destination = join(tempDir(), 'copy');
  copyOf(source, destination);
  const config = loadConfig({ workspaceRoot: destination });
  assert.equal(config.dataDir, join(destination, 'history'));
  assert.equal(createStore({ dataDir: config.dataDir }).loadPreviousRankings('2026', 5).week, 4);
});

test('a folder that is not a league has nothing to copy', () => {
  const source = tempDir();
  assert.throws(
    () => copyLeagueWorkspace({ source, destination: join(tempDir(), 'x'), dataDir: join(source, 'data'), outputDir: join(source, 'output') }),
    /no \.env/,
  );
});

test('the migrate command copies the league it is run from and says nothing was removed', () => {
  const source = dynastyLeague(tempDir());
  const destination = join(tempDir(), 'leagues', 'mine');
  const result = runCli(['migrate', destination], { cwd: source });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(isLeagueWorkspace(destination));
  assert.match(result.stdout, /Nothing in .* was removed/);
  assert.ok(result.stdout.includes(`${CLI} doctor --workspace ${destination}`));
  assert.ok(existsSync(join(source, 'data', 'rankings', '2026', 'week-4.json')));
});

test('migrate without a destination says how to use it', () => {
  const source = dynastyLeague(tempDir());
  const result = runCli(['migrate'], { cwd: source });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /migrate <folder>/);
});
