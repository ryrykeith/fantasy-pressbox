import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAssets } from '../src/assets.mjs';
import { diskReadText, loadDiskAssets, PACKAGE_ROOT } from '../src/config.mjs';
import { FORMAT_TYPES } from '../src/format.mjs';
import { TASKS, buildPrompt, systemPromptOnly, taskPromptOnly } from '../src/promptContext.mjs';

/**
 * The prompts and default config reach core as text. These tests pin that the
 * text is all a prompt needs: an in-memory map builds the same prompt the disk
 * does, a workspace override still wins, and a missing file is named.
 */

/** Every file a prompt or default config build can ask for, read from the package once. */
function packageFileMap() {
  const files = {};
  for (const file of readdirSync(join(PACKAGE_ROOT, 'prompts'))) {
    files[`prompts/${file}`] = readFileSync(join(PACKAGE_ROOT, 'prompts', file), 'utf8');
  }
  for (const file of readdirSync(join(PACKAGE_ROOT, 'config'))) {
    if (file.endsWith('.yml')) files[`config/${file}`] = readFileSync(join(PACKAGE_ROOT, 'config', file), 'utf8');
  }
  return files;
}

const memoryAssets = loadAssets((path) => packageFileMap()[path]);
const diskAssets = loadDiskAssets();

/** What building does: the prompt, or the refusal's message. */
function outcome(build) {
  try {
    return { text: build() };
  } catch (error) {
    return { refused: error.message };
  }
}

const contextFor = (type) => ({ league: { format: { type } }, unavailable: [] });

test('every edition builds the same prompt from an in-memory asset map as from the disk', () => {
  let built = 0;
  for (const task of TASKS) {
    for (const type of FORMAT_TYPES) {
      const context = contextFor(type);
      const fromMemory = outcome(() => buildPrompt({ task, context, assets: memoryAssets }));
      const fromDisk = outcome(() => buildPrompt({ task, context, assets: diskAssets }));
      assert.deepEqual(fromMemory, fromDisk, `${task} (${type})`);
      if (fromMemory.text) built += 1;

      // The two halves the CLI also sends to an API separately.
      assert.equal(
        taskPromptOnly(task, type, { assets: memoryAssets }),
        taskPromptOnly(task, type, { assets: diskAssets }),
        `${task} (${type}) instructions`,
      );
    }
  }
  for (const type of FORMAT_TYPES) {
    assert.equal(systemPromptOnly(type, { assets: memoryAssets }), systemPromptOnly(type, { assets: diskAssets }));
  }
  assert.ok(built > 0, 'at least one edition builds from a bare context, so the comparison is not empty');
});

test('every shipped prompt file is the one an edition reads, so the map is complete', () => {
  const missing = TASKS.filter((task) => outcome(() => taskPromptOnly(task, 'dynasty', { assets: memoryAssets })).refused);
  assert.deepEqual(missing, []);
});

test('the default config and a season table load from text alone', () => {
  const { editorial, rankings } = memoryAssets.defaultConfig();
  assert.deepEqual(editorial, diskAssets.defaultConfig().editorial);
  assert.deepEqual(rankings, diskAssets.defaultConfig().rankings);
  assert.equal(typeof memoryAssets.byeWeekTable(2026).get, 'function');
});

test('a missing prompt is refused, naming the file as it does today', () => {
  const empty = loadAssets(() => null);
  assert.throws(() => systemPromptOnly('dynasty', { assets: empty }), /^Error: Missing prompt file: prompts\/system\.md$/);
  assert.throws(() => taskPromptOnly('recap', 'dynasty', { assets: empty }), /Missing prompt file: prompts\/weekly-recap\.md/);
});

test('a missing default config file and an unreadable one are named', () => {
  assert.throws(() => loadAssets(() => null).defaultConfig(), /Missing config file: config\/editorial\.yml/);
  assert.throws(() => loadAssets(() => 'not a table line').defaultConfig(), /Could not read config\/editorial\.yml/);
});

test('building a prompt without assets says what to pass, rather than failing on undefined', () => {
  assert.throws(() => systemPromptOnly('dynasty'), /loadAssets\(readText\)/);
});

test('loadAssets refuses a readText that is not a function or returns a non-string', () => {
  assert.throws(() => loadAssets(null), /readText/);
  assert.throws(() => loadAssets(() => 42).prompt('system.md'), /expected the file's text or null/);
});

test('a file is read once per set of assets', () => {
  const asked = [];
  const counted = loadAssets((path) => {
    asked.push(path);
    return packageFileMap()[path];
  });
  systemPromptOnly('dynasty', { assets: counted });
  systemPromptOnly('redraft', { assets: counted });
  assert.deepEqual(asked, ['prompts/system.md']);
});

/* ------------------------------------------------- workspace overrides */

function workspacePrompts(files) {
  const dir = join(realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-assets-'))), 'prompts');
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test('a workspace prompt wins over the shipped one, and only for its own file', () => {
  const promptsDir = workspacePrompts({ 'weekly-recap.md': 'Write like a pirate.' });
  const assets = loadDiskAssets({ promptsDir });
  assert.equal(taskPromptOnly('recap', 'dynasty', { assets }), 'Write like a pirate.');
  assert.equal(systemPromptOnly('dynasty', { assets }), systemPromptOnly('dynasty', { assets: diskAssets }));
});

test('the disk readText answers null for a file the package does not have', () => {
  assert.equal(diskReadText()('prompts/no-such-edition.md'), null);
});

test('an empty workspace prompt is refused, naming the workspace file', () => {
  const promptsDir = workspacePrompts({ 'weekly-recap.md': '  \n' });
  const assets = loadDiskAssets({ promptsDir });
  assert.throws(
    () => taskPromptOnly('recap', 'dynasty', { assets }),
    (error) => error.message.includes(join(promptsDir, 'weekly-recap.md')),
  );
});

/* ------------------------------------------------------ core's path */

test('no module on core\'s path reads the disk', () => {
  for (const file of ['assets.mjs', 'promptContext.mjs', 'pipeline.mjs', 'settings.mjs', 'storeCore.mjs']) {
    const source = readFileSync(join(PACKAGE_ROOT, 'src', file), 'utf8');
    assert.doesNotMatch(source, /readFileSync|existsSync|from 'node:fs'/, `src/${file}`);
  }
});
