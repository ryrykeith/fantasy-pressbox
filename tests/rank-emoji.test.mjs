/**
 * Rank emoji: one setting, `{ mode: 'default' | 'custom' | 'none', table }`.
 *
 * INCLUDE_EMOJI=false and a ranking_emoji table in editorial.yml map onto it;
 * `--emoji` overrides it for one run; `none` is said in the prompt in words.
 *
 * Invented data only (tests/fixtures/fake-sleeper-api-fetch.mjs, league
 * 000000000000000000); nothing touches the network.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { editionOptions, parseArgs } from '../src/options.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { isSingleEmoji, rankEmoji, resolveSettings, withRankEmojiMode } from '../src/settings.mjs';

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** A league folder with the given .env lines and, optionally, a config/editorial.yml. */
function leagueFolder({ env = '', editorial = null } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-emoji-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=redraft\n${env}`);
  if (editorial !== null) {
    mkdirSync(join(root, 'config'));
    writeFileSync(join(root, 'config', 'editorial.yml'), editorial);
  }
  return root;
}

/** loadConfig reads process.env's INCLUDE_EMOJI through .env only, so a stray shell value cannot leak in. */
const load = (options) => loadConfig({ workspaceRoot: leagueFolder(options) });

/* ------------------------------------------------------------------ modes */

test('with nothing set the mode is default and the table is the shipped one', () => {
  const config = load();
  assert.equal(config.rankEmoji.mode, 'default');
  assert.equal(config.rankEmoji.table[1], '🥇');
  assert.equal(Object.keys(config.rankEmoji.table).length, 18);
});

test('INCLUDE_EMOJI=false is mode none, and a rank prints no emoji', () => {
  const config = load({ env: 'INCLUDE_EMOJI=false\n' });
  assert.deepEqual(config.rankEmoji, { mode: 'none', table: {} });
  assert.equal(rankEmoji(config, 1), '');
  assert.equal(config.editorial.output.include_emoji, false);
});

test('a ranking_emoji table in editorial.yml is mode custom', () => {
  const config = load({ editorial: 'ranking_emoji:\n  1: "🏆"\n  2: "🥈"\n' });
  assert.deepEqual(config.rankEmoji, { mode: 'custom', table: { 1: '🏆', 2: '🥈' } });
  assert.equal(rankEmoji(config, 1), '🏆');
});

test('INCLUDE_EMOJI=false wins over a custom table: the mode is none', () => {
  const config = load({ env: 'INCLUDE_EMOJI=false\n', editorial: 'ranking_emoji:\n  1: "🏆"\n' });
  assert.equal(config.rankEmoji.mode, 'none');
});

test('output.include_emoji: false in editorial.yml is mode none', () => {
  const config = load({ editorial: 'output:\n  include_emoji: false\n' });
  assert.equal(config.rankEmoji.mode, 'none');
});

/* ------------------------------------------------------------ validation */

test('isSingleEmoji accepts one emoji grapheme and nothing else', () => {
  for (const ok of ['🥇', '🗑️', '☠️', '👨‍👩‍👧', '🇨🇦', '👍🏽', '1️⃣']) assert.equal(isSingleEmoji(ok), true, ok);
  for (const bad of ['', 'A', '1', '🥇🥈', '🥇 ', 'gold', ' ', '-', null, 7]) {
    assert.equal(isSingleEmoji(bad), false, JSON.stringify(bad));
  }
});

test('a custom entry that is not a single emoji is refused, naming its rank and file', () => {
  for (const bad of ['"gold"', '"🥇🥈"', '"A"', '""']) {
    const workspace = leagueFolder({ editorial: `ranking_emoji:\n  1: "🥇"\n  2: ${bad}\n` });
    assert.throws(() => loadConfig({ workspaceRoot: workspace }), /ranking_emoji in .*editorial\.yml entry 2 is .*not a single emoji/, bad);
  }
});

test('resolveSettings refuses a custom table from a caller too', () => {
  assert.throws(
    () => resolveSettings({ league: { editorial: { ranking_emoji: { 1: '🥇', 2: 'two' } } } }),
    /entry 2 is "two", which is not a single emoji/,
  );
});

/* ----------------------------------------------------------- --emoji flag */

test('--emoji is described, parsed and handed to every built edition', () => {
  assert.equal(parseArgs(['rankings', '--emoji', 'none']).emoji, 'none');
  assert.deepEqual(editionOptions('rankings', { emoji: 'none' }), { emoji: 'none' });
  assert.deepEqual(editionOptions('recap', { emoji: 'default' }), { emoji: 'default' });
  assert.deepEqual(editionOptions('future-stock', { emoji: 'none' }), { emoji: 'none' });
});

test('withRankEmojiMode changes the copy and leaves the league setting alone', () => {
  const config = load({ editorial: 'ranking_emoji:\n  1: "🏆"\n' });
  const none = withRankEmojiMode(config, 'none');
  assert.deepEqual(none.rankEmoji, { mode: 'none', table: {} });
  assert.equal(rankEmoji(none, 1), '');
  const shipped = withRankEmojiMode(config, 'default');
  assert.equal(shipped.rankEmoji.mode, 'default');
  assert.equal(rankEmoji(shipped, 1), '🥇');
  assert.equal(config.rankEmoji.mode, 'custom', 'the loaded config is untouched');
  assert.equal(rankEmoji(config, 1), '🏆');
  assert.throws(() => withRankEmojiMode(config, 'custom'), /not a rank emoji mode/);
});

/* ------------------------------------------------------- the built prompt */

async function build(options, { options: run = {}, task = 'rankings' } = {}) {
  await import('./fixtures/fake-sleeper-api-fetch.mjs');
  const config = load(options);
  const prepared = await prepareEdition({
    task,
    week: 1,
    options: run,
    settings: { ...config, playerCache: createMemoryPlayerCache() },
    store: createMemoryStore(),
    assets: loadDiskAssets({ promptsDir: config.promptsDir }),
    log: { say() {}, warn() {} },
  });
  return { config, prompt: prepared.prompt };
}

const NO_EMOJI_RULE = /Print no rank emoji anywhere/;

test('mode none: the built prompt tells the model to print no rank emoji, for each ranking and standing edition', async () => {
  for (const task of ['rankings', 'preview', 'recap', 'preseason-rankings']) {
    const { prompt } = await build({ env: 'INCLUDE_EMOJI=false\n' }, { task });
    assert.match(prompt, NO_EMOJI_RULE, task);
    // The context hands over no table to copy from; the templates' own examples stay as examples.
    assert.match(prompt, /"rankEmoji": \{\s*"mode": "none",\s*"table": \{\}/, task);
  }
});

test('mode default: the prompt carries the table and no such rule', async () => {
  const { prompt } = await build();
  assert.doesNotMatch(prompt, NO_EMOJI_RULE);
  assert.match(prompt, /"mode": "default"/);
  assert.match(prompt, /🥇/);
});

test('--emoji none overrides a league that has emoji, for that run only', async () => {
  const league = { editorial: 'ranking_emoji:\n  1: "🏆"\n' };
  const off = await build(league, { options: { emoji: 'none' } });
  assert.match(off.prompt, NO_EMOJI_RULE);
  assert.doesNotMatch(off.prompt, /🏆/);
  assert.equal(off.config.rankEmoji.mode, 'custom', 'the league setting is as it was');

  const normal = await build(league);
  assert.doesNotMatch(normal.prompt, NO_EMOJI_RULE);
  assert.match(normal.prompt, /🏆/);
});

test('--emoji default puts the shipped table back over a league that switched emoji off', async () => {
  const { prompt } = await build({ env: 'INCLUDE_EMOJI=false\n' }, { options: { emoji: 'default' } });
  assert.doesNotMatch(prompt, NO_EMOJI_RULE);
  assert.match(prompt, /🥇/);
});

test('--emoji with a value that is not a mode is refused', async () => {
  await assert.rejects(build({}, { options: { emoji: 'custom' } }), /not a rank emoji mode/);
});
