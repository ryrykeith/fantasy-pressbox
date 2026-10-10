import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

import { loadConfig, loadProspectBoard, PACKAGE_ROOT, resolveWorkspaceRoot, WORKSPACE_ENV_VAR } from '../src/config.mjs';

// Package root: where the code and its shipped assets live (read-only at run
// time). Workspace root: one league's .env, config, data and output.

function tempWorkspace() {
  // realpath: macOS hands out /var/... for a path that resolves to /private/var/...
  return realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-workspace-')));
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Runs `body` with the named variables set (or removed, for undefined), restoring them after. */
function withEnv(values, body) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('the package root is this checkout: it holds the manifest and the shipped prompts', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'fantasy-pressbox');
  assert.ok(readdirSync(join(PACKAGE_ROOT, 'prompts')).includes('system.md'));
});

test('the workspace defaults to the working directory', () => {
  const cwd = tempWorkspace();
  assert.equal(resolveWorkspaceRoot({ env: {}, cwd }), cwd);
});

test('the environment variable overrides the working directory', () => {
  const cwd = tempWorkspace();
  const chosen = tempWorkspace();
  assert.equal(resolveWorkspaceRoot({ env: { [WORKSPACE_ENV_VAR]: chosen }, cwd }), chosen);
});

test('an empty environment variable is the same as an unset one', () => {
  const cwd = tempWorkspace();
  assert.equal(resolveWorkspaceRoot({ env: { [WORKSPACE_ENV_VAR]: '  ' }, cwd }), cwd);
});

test('the flag overrides the environment variable', () => {
  const cwd = tempWorkspace();
  const fromEnv = tempWorkspace();
  const fromFlag = tempWorkspace();
  assert.equal(resolveWorkspaceRoot({ flag: fromFlag, env: { [WORKSPACE_ENV_VAR]: fromEnv }, cwd }), fromFlag);
});

test('a relative workspace resolves against the working directory', () => {
  const cwd = tempWorkspace();
  mkdirSync(join(cwd, 'my-league'));
  assert.equal(resolveWorkspaceRoot({ flag: 'my-league', env: {}, cwd }), join(cwd, 'my-league'));
  assert.equal(resolveWorkspaceRoot({ env: { [WORKSPACE_ENV_VAR]: 'my-league' }, cwd }), join(cwd, 'my-league'));
});

test('a workspace that does not exist is refused, naming where it came from', () => {
  const cwd = tempWorkspace();
  assert.throws(() => resolveWorkspaceRoot({ flag: 'no-such-league', env: {}, cwd }), /--workspace.*no-such-league/s);
  assert.throws(
    () => resolveWorkspaceRoot({ env: { [WORKSPACE_ENV_VAR]: 'no-such-league' }, cwd }),
    new RegExp(`${WORKSPACE_ENV_VAR}.*no-such-league`, 's'),
  );
});

test('a workspace that is a file, not a folder, is refused', () => {
  const cwd = tempWorkspace();
  writeFileSync(join(cwd, 'league.txt'), '');
  assert.throws(() => resolveWorkspaceRoot({ flag: 'league.txt', env: {}, cwd }), /not a folder/);
});

test('loadConfig reads the workspace .env and puts data and output in the workspace', () => {
  const workspace = tempWorkspace();
  writeFileSync(join(workspace, '.env'), 'LEAGUE_DISPLAY_NAME=Workspace League\n');

  const config = withEnv({ LEAGUE_DISPLAY_NAME: undefined, DATA_DIR: undefined, OUTPUT_DIR: undefined }, () =>
    loadConfig({ workspaceRoot: workspace }),
  );

  assert.equal(config.workspaceRoot, workspace);
  assert.equal(config.leagueDisplayName, 'Workspace League');
  assert.equal(config.dataDir, join(workspace, 'data'));
  assert.equal(config.outputDir, join(workspace, 'output'));
  assert.ok(!isInside(PACKAGE_ROOT, config.dataDir), 'data must not land in the package');
  assert.ok(!isInside(PACKAGE_ROOT, config.outputDir), 'output must not land in the package');
});

test('a relative DATA_DIR or OUTPUT_DIR is relative to the workspace, not the shell', () => {
  const workspace = tempWorkspace();
  const config = withEnv({ DATA_DIR: 'history', OUTPUT_DIR: 'posts' }, () =>
    loadConfig({ workspaceRoot: workspace, envPath: join(workspace, '.env.does-not-exist') }),
  );
  assert.equal(config.dataDir, join(workspace, 'history'));
  assert.equal(config.outputDir, join(workspace, 'posts'));
});

test("the league's own config files are read from the workspace", () => {
  const workspace = tempWorkspace();
  mkdirSync(join(workspace, 'config'));
  writeFileSync(join(workspace, 'config', 'rookie-draft.yml'), 'tank_watch:\n  start_week: 11\n');
  writeFileSync(join(workspace, 'config', 'guillotine.yml'), 'eliminations:\n  1: Chopped FC\n');

  const config = loadConfig({ workspaceRoot: workspace, envPath: join(workspace, '.env.does-not-exist') });
  assert.equal(config.rookieDraft.tankWatch.startWeek, 11);
  assert.equal(config.guillotine.eliminations.length, 1);
});

test('a workspace with no config folder still loads, with the package defaults for editorial and rankings', () => {
  const workspace = tempWorkspace();
  const config = loadConfig({ workspaceRoot: workspace, envPath: join(workspace, '.env.does-not-exist') });
  assert.equal(config.rookieDraft.order, null);
  assert.deepEqual(config.guillotine.eliminations, []);
  assert.ok(config.rankings.weights.dynasty, 'rankings come from the package');
  assert.ok(config.editorial.ranking_emoji, 'editorial comes from the package');
});

test('the prospect board is workspace-only: the loader has no package fallback', () => {
  assert.throws(() => loadProspectBoard({ draftYear: 2027 }), /configDir/);
});

test('only the read paths know where the package lives', () => {
  // A writer that reached for the package root would put league data inside an
  // installed package. Writers take config.dataDir / config.outputDir instead,
  // so the package root is only ever referenced by the modules that read
  // shipped assets.
  const readers = new Set(['config.mjs', 'promptContext.mjs', 'cli.mjs']);
  const users = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.mjs') && readFileSync(path, 'utf8').includes('PACKAGE_ROOT')) {
        users.push(relative(join(PACKAGE_ROOT, 'src'), path));
      }
    }
  };
  walk(join(PACKAGE_ROOT, 'src'));
  assert.deepEqual(users.filter((file) => !readers.has(file)), []);
});

/** Runs the CLI with no league configured, so nothing reaches Sleeper. */
function runCli(args, { cwd, env = {} }) {
  const clean = { ...process.env };
  for (const key of ['SLEEPER_LEAGUE_ID', 'DATA_DIR', 'OUTPUT_DIR', WORKSPACE_ENV_VAR]) delete clean[key];
  return spawnSync(process.execPath, [join(PACKAGE_ROOT, 'src', 'cli.mjs'), ...args], {
    cwd,
    env: { ...clean, ...env },
    encoding: 'utf8',
  });
}

test('run from another folder, doctor finds the prompts in the package and uses the folder for data and output', () => {
  const workspace = tempWorkspace();
  const result = runCli(['doctor'], { cwd: workspace });
  assert.match(result.stdout, /Prompt files\s+✓/);
  assert.match(result.stdout, new RegExp(`Workspace\\s+${workspace}`));
  assert.match(result.stdout, new RegExp(`Data folder\\s+${join(workspace, 'data')}`));
  assert.match(result.stdout, new RegExp(`Output folder\\s+${join(workspace, 'output')}`));
  // No league ID in that folder, so doctor stops before contacting Sleeper.
  assert.equal(result.status, 1);
});

test('--workspace points the CLI at a league folder from anywhere', () => {
  const workspace = tempWorkspace();
  const elsewhere = tempWorkspace();
  const result = runCli(['doctor', '--workspace', workspace], { cwd: elsewhere });
  assert.match(result.stdout, new RegExp(`Data folder\\s+${join(workspace, 'data')}`));
});

test('the environment variable points the CLI at a league folder', () => {
  const workspace = tempWorkspace();
  const elsewhere = tempWorkspace();
  const result = runCli(['doctor'], { cwd: elsewhere, env: { [WORKSPACE_ENV_VAR]: workspace } });
  assert.match(result.stdout, new RegExp(`Data folder\\s+${join(workspace, 'data')}`));
});

test('--workspace without a folder is refused', () => {
  const result = runCli(['doctor', '--workspace'], { cwd: tempWorkspace() });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--workspace needs a folder/);
});
