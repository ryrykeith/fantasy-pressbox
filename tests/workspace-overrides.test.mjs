import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describePromptOverrides, loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { systemPromptOnly, taskPromptOnly } from '../src/promptContext.mjs';

// A workspace may shadow the shipped editorial/rankings config and individual
// prompt files. With no overrides it must behave exactly like the package.

function tempWorkspace() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-overrides-')));
}

function write(workspace, relative, text) {
  const path = join(workspace, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

const noEnv = (workspace) => join(workspace, '.env.does-not-exist');
const load = (workspace) => loadConfig({ workspaceRoot: workspace, envPath: noEnv(workspace) });

test('a workspace with no overrides loads exactly like the package folder itself', () => {
  const config = load(tempWorkspace());
  const shipped = loadConfig({ workspaceRoot: PACKAGE_ROOT, envPath: noEnv(PACKAGE_ROOT) });
  assert.deepEqual(config.editorial, shipped.editorial);
  assert.deepEqual(config.rankings, shipped.rankings);
  assert.equal(config.promptsDir, null);
  assert.equal(config.sources.editorialOverride, null);
  assert.equal(config.sources.rankingsOverride, null);
});

test('the package folder as its own workspace has no overrides to report', () => {
  const config = loadConfig({ workspaceRoot: PACKAGE_ROOT, envPath: noEnv(PACKAGE_ROOT) });
  assert.equal(config.promptsDir, null);
  assert.equal(config.sources.editorialOverride, null);
  assert.equal(config.sources.rankingsOverride, null);
});

test('a workspace editorial.yml layers over the shipped file, key by key', () => {
  const workspace = tempWorkspace();
  const shipped = load(tempWorkspace());
  const path = write(workspace, 'config/editorial.yml', 'tone: savage\noutput:\n  sleeper_max_chars: 1200\n');
  const config = load(workspace);
  assert.equal(config.editorial.tone, 'savage');
  assert.equal(config.editorial.output.sleeper_max_chars, 1200);
  // Not mentioned, so the shipped value stands.
  assert.equal(config.editorial.output.include_emoji, shipped.editorial.output.include_emoji);
  assert.deepEqual(config.editorial.ranking_emoji, shipped.editorial.ranking_emoji);
  assert.equal(config.sources.editorialOverride, path);
});

test('a workspace ranking_emoji table replaces the shipped one rather than merging with it', () => {
  const workspace = tempWorkspace();
  write(workspace, 'config/editorial.yml', 'ranking_emoji:\n  1: "A"\n  2: "B"\n');
  assert.deepEqual(load(workspace).editorial.ranking_emoji, { 1: 'A', 2: 'B' });
});

test('a workspace weight set replaces the shipped set, and is still checked to sum to 1.0', () => {
  const workspace = tempWorkspace();
  const shipped = load(tempWorkspace());
  write(workspace, 'config/rankings.yml', 'weights:\n  redraft:\n    starting_lineup: 0.6\n    depth: 0.4\n');
  const config = load(workspace);
  assert.deepEqual(config.rankings.weights.redraft, { starting_lineup: 0.6, depth: 0.4 });
  assert.deepEqual(config.rankings.weights.dynasty, shipped.rankings.weights.dynasty);

  const bad = tempWorkspace();
  write(bad, 'config/rankings.yml', 'weights:\n  redraft:\n    starting_lineup: 0.6\n    depth: 0.6\n');
  assert.throws(() => load(bad), /redraft/);
});

test('a malformed workspace override names its own path', () => {
  const workspace = tempWorkspace();
  const path = write(workspace, 'config/editorial.yml', 'output: [unclosed\n');
  assert.throws(() => load(workspace), new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a workspace prompt shadows the shipped file of the same name and nothing else', () => {
  const workspace = tempWorkspace();
  write(workspace, 'prompts/weekly-recap.md', '# Our recap voice\n\nWrite it like a pirate.\n');
  const { promptsDir } = load(workspace);
  assert.equal(promptsDir, join(workspace, 'prompts'));

  assert.match(taskPromptOnly('recap', 'dynasty', { promptsDir }), /like a pirate/);
  // Everything else still comes from the package.
  assert.equal(taskPromptOnly('preview', 'dynasty', { promptsDir }), taskPromptOnly('preview', 'dynasty'));
  assert.equal(systemPromptOnly('dynasty', { promptsDir }), systemPromptOnly('dynasty'));
});

test("a shadowed prompt's format blocks resolve exactly as in the shipped prompt", () => {
  const workspace = tempWorkspace();
  write(
    workspace,
    'prompts/weekly-power-rankings.md',
    [
      '# Ours',
      '<!-- format: dynasty -->',
      'DYNASTY ONLY',
      '<!-- end format -->',
      '<!-- format: redraft -->',
      'REDRAFT ONLY',
      '<!-- end format -->',
      '',
    ].join('\n'),
  );
  const { promptsDir } = load(workspace);
  const dynasty = taskPromptOnly('rankings', 'dynasty', { promptsDir });
  assert.match(dynasty, /DYNASTY ONLY/);
  assert.doesNotMatch(dynasty, /REDRAFT ONLY|<!--/);
  assert.match(taskPromptOnly('rankings', 'redraft', { promptsDir }), /REDRAFT ONLY/);
  // A format-blocked override still needs a format, as the shipped one does.
  assert.throws(() => taskPromptOnly('rankings', undefined, { promptsDir }), /no league format/);
});

test('an empty workspace prompt is refused, naming the workspace file', () => {
  const workspace = tempWorkspace();
  const path = write(workspace, 'prompts/weekly-recap.md', '   \n');
  const { promptsDir } = load(workspace);
  assert.throws(() => taskPromptOnly('recap', 'dynasty', { promptsDir }), (error) => error.message.includes(path));
});

test('describePromptOverrides separates shadowing files from ones that match nothing', () => {
  const workspace = tempWorkspace();
  write(workspace, 'prompts/weekly-recap.md', 'x');
  write(workspace, 'prompts/weekly-recapp.md', 'x');
  write(workspace, 'prompts/notes.txt', 'x');
  const { overridden, unmatched } = describePromptOverrides(join(workspace, 'prompts'));
  assert.deepEqual(overridden, ['weekly-recap.md']);
  assert.deepEqual(unmatched, ['weekly-recapp.md']);
  assert.deepEqual(describePromptOverrides(null), { overridden: [], unmatched: [] });
});

function runDoctor(workspace) {
  const clean = { ...process.env };
  for (const key of ['SLEEPER_LEAGUE_ID', 'DATA_DIR', 'OUTPUT_DIR', WORKSPACE_ENV_VAR]) delete clean[key];
  return spawnSync(process.execPath, [join(PACKAGE_ROOT, 'src', 'cli.mjs'), 'doctor'], {
    cwd: workspace,
    env: clean,
    encoding: 'utf8',
  });
}

test('doctor says so when nothing is overridden', () => {
  const result = runDoctor(tempWorkspace());
  assert.match(result.stdout, /Local overrides\s+none — using the shipped defaults/);
  assert.match(result.stdout, /rookie-draft\.yml not found/);
});

test('doctor names each overridden file and where the league settings were read from', () => {
  const workspace = tempWorkspace();
  write(workspace, 'config/editorial.yml', 'tone: savage\n');
  write(workspace, 'config/rankings.yml', 'tank_watch: {}\n');
  write(workspace, 'config/rookie-draft.yml', 'rounds: snake\n');
  write(workspace, 'prompts/weekly-recap.md', 'x');
  write(workspace, 'prompts/typo.md', 'x');
  const out = runDoctor(workspace).stdout;
  assert.match(out, new RegExp(`config/editorial\\.yml \\(${join(workspace, 'config', 'editorial.yml')}\\)`));
  assert.match(out, new RegExp(`config/rankings\\.yml \\(${join(workspace, 'config', 'rankings.yml')}\\)`));
  assert.match(out, new RegExp(`prompts/weekly-recap\\.md \\(${join(workspace, 'prompts', 'weekly-recap.md')}\\)`));
  assert.match(out, /typo\.md matches no shipped prompt/);
  assert.match(out, new RegExp(`rookie-draft\\.yml read from ${join(workspace, 'config', 'rookie-draft.yml')}`));
  assert.match(out, /guillotine\.yml not found/);
});

test('the shipped prompts are not modified by running against a workspace override', () => {
  const before = readFileSync(join(PACKAGE_ROOT, 'prompts', 'weekly-recap.md'), 'utf8');
  const workspace = tempWorkspace();
  write(workspace, 'prompts/weekly-recap.md', 'override');
  const { promptsDir } = load(workspace);
  taskPromptOnly('recap', 'dynasty', { promptsDir });
  assert.equal(readFileSync(join(PACKAGE_ROOT, 'prompts', 'weekly-recap.md'), 'utf8'), before);
});
