/**
 * Ranking presets (config/rankings.yml `preset` and `presets`,
 * src/settings.mjs resolveRankingChoice): a league picks a named weight set
 * for its format, `balanced` being the sets under `weights`.
 *
 * Every league here is invented; nothing touches the network.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, loadConfig } from '../src/config.mjs';
import { buildContext } from '../src/promptContext.mjs';
import {
  DEFAULT_RANKINGS,
  rankingPresetsByFormat,
  resolveFutureStockWeights,
  resolveRankingChoice,
  resolveRankingWeights,
  resolveSettings,
} from '../src/settings.mjs';
import {
  newLeagueFile,
  parseLeagueFile,
  serializeLeagueFile,
  settingsLayers,
  workspaceFromLeagueFile,
  leagueFileFromWorkspace,
} from '../src/leagueFile.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';

const SHIPPED = parseYaml(readFileSync(join(PACKAGE_ROOT, 'config', 'rankings.yml'), 'utf8'));
const FORMATS = ['dynasty', 'redraft', 'guillotine'];

/** Settings resolved over the shipped file, with `league` as the league folder's own rankings.yml. */
const rankingsWith = (league) => resolveSettings({ defaults: { rankings: SHIPPED }, league: { rankings: league } }).rankings;

const sum = (set) => Object.values(set).reduce((total, value) => total + value, 0);

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/* ------------------------------------------------------- the shipped tables */

test('the shipped presets are dynasty win-now/balanced/rebuild, redraft balanced/win-now, guillotine balanced', () => {
  const byFormat = rankingPresetsByFormat(rankingsWith(undefined));
  assert.deepEqual(byFormat, {
    dynasty: ['balanced', 'win-now', 'rebuild'],
    redraft: ['balanced', 'win-now'],
    guillotine: ['balanced'],
  });
});

test('every shipped preset set sums to 1.0 and uses only factors its balanced set has', () => {
  for (const [name, preset] of Object.entries(SHIPPED.presets)) {
    for (const [format, set] of Object.entries(preset.weights)) {
      assert.ok(Math.abs(sum(set) - 1) < 1e-9, `${name}.${format} sums to ${sum(set)}`);
      for (const factor of Object.keys(set)) {
        assert.ok(factor in SHIPPED.weights[format], `${name}.${format}.${factor} is not a ${format} factor`);
      }
    }
  }
});

test('the built-in fallback presets and sets are the shipped ones', () => {
  assert.deepEqual(DEFAULT_RANKINGS.presets, SHIPPED.presets);
  assert.deepEqual(DEFAULT_RANKINGS.weights, SHIPPED.weights);
});

test('rebuild moves weight from this season to the assets and picks; win-now does the reverse', () => {
  const balanced = SHIPPED.weights.dynasty;
  const rebuild = SHIPPED.presets.rebuild.weights.dynasty;
  const winNow = SHIPPED.presets['win-now'].weights.dynasty;
  const factor = (set, key) => set[key] ?? 0;
  for (const key of ['dynasty_value', 'future_draft_capital']) {
    assert.ok(factor(rebuild, key) > factor(balanced, key), `rebuild raises ${key}`);
    assert.ok(factor(winNow, key) < factor(balanced, key), `win-now lowers ${key}`);
  }
  for (const key of ['starting_lineup', 'contender_viability']) {
    assert.ok(factor(rebuild, key) < factor(balanced, key), `rebuild lowers ${key}`);
    assert.ok(factor(winNow, key) > factor(balanced, key), `win-now raises ${key}`);
  }
});

/* ------------------------------------------------------- choosing a preset */

test('a league that names no preset ranks on the balanced sets, exactly as before', () => {
  const rankings = rankingsWith(undefined);
  assert.equal(rankings.preset, null);
  for (const format of FORMATS) {
    assert.deepEqual(resolveRankingChoice(rankings, format), { preset: 'balanced', weights: SHIPPED.weights[format] });
  }
});

test('preset: balanced is the sets under weights', () => {
  const rankings = rankingsWith({ preset: 'balanced' });
  for (const format of FORMATS) assert.deepEqual(resolveRankingWeights(rankings, format), SHIPPED.weights[format]);
});

test('a named preset picks its set for the league format', () => {
  const rebuild = rankingsWith({ preset: 'rebuild' });
  assert.deepEqual(resolveRankingChoice(rebuild, 'dynasty'), {
    preset: 'rebuild',
    weights: SHIPPED.presets.rebuild.weights.dynasty,
  });
  const winNow = rankingsWith({ preset: 'win-now' });
  assert.deepEqual(resolveRankingWeights(winNow, 'redraft'), SHIPPED.presets['win-now'].weights.redraft);
  assert.deepEqual(resolveRankingWeights(winNow, 'dynasty'), SHIPPED.presets['win-now'].weights.dynasty);
});

test('no preset chooses the future stock set', () => {
  assert.deepEqual(resolveFutureStockWeights(rankingsWith({ preset: 'rebuild' })), SHIPPED.weights.future_stock);
});

test("a preset the league's format lacks is refused, naming that format's presets", () => {
  assert.throws(() => resolveRankingChoice(rankingsWith({ preset: 'rebuild' }), 'redraft'), (error) => {
    assert.match(error.message, /preset: rebuild/);
    assert.match(error.message, /not a preset a redraft league has/);
    assert.match(error.message, /A redraft league's presets are: balanced, win-now\./);
    return true;
  });
  assert.throws(
    () => resolveRankingChoice(rankingsWith({ preset: 'win-now' }), 'guillotine'),
    /A guillotine league's presets are: balanced\./,
  );
});

test('an unknown preset is refused at load, naming the presets each format has', () => {
  assert.throws(() => rankingsWith({ preset: 'tank' }), (error) => {
    assert.match(error.message, /preset: tank in config\/rankings\.yml is not a ranking preset/);
    assert.match(error.message, /dynasty: balanced, win-now, rebuild; redraft: balanced, win-now; guillotine: balanced/);
    return true;
  });
  assert.throws(() => rankingsWith({ preset: 3 }), /preset in config\/rankings\.yml is 3, which is not a preset name/);
});

test('an unknown preset met by a hand-built config is refused naming the format presets', () => {
  const rankings = { ...DEFAULT_RANKINGS, preset: 'tank' };
  assert.throws(
    () => resolveRankingChoice(rankings, 'dynasty'),
    /preset: tank in config\/rankings\.yml is not a ranking preset\. A dynasty league's presets are: balanced, win-now, rebuild\./,
  );
});

test('a preset and the league’s own weights for the same format are refused, naming both', () => {
  const own = { ...SHIPPED.weights.dynasty };
  const rankings = rankingsWith({ preset: 'rebuild', weights: { dynasty: own } });
  assert.throws(() => resolveRankingChoice(rankings, 'dynasty'), (error) => {
    assert.match(error.message, /preset: rebuild/);
    assert.match(error.message, /weights\.dynasty/);
    return true;
  });
  // Its own set for another format is no conflict for this one.
  const elsewhere = rankingsWith({ preset: 'win-now', weights: { redraft: SHIPPED.weights.redraft } });
  assert.deepEqual(resolveRankingWeights(elsewhere, 'dynasty'), SHIPPED.presets['win-now'].weights.dynasty);
  // Nor is the future stock set, which no preset chooses.
  const futureStock = rankingsWith({ preset: 'rebuild', weights: { future_stock: SHIPPED.weights.future_stock } });
  assert.deepEqual(resolveRankingWeights(futureStock, 'dynasty'), SHIPPED.presets.rebuild.weights.dynasty);
});

test("a league's own weights with no preset rank as before, and name no preset", () => {
  const own = { starting_lineup: 0.6, depth: 0.4 };
  const rankings = rankingsWith({ weights: { redraft: own } });
  assert.deepEqual(resolveRankingChoice(rankings, 'redraft'), { preset: null, weights: own });
  assert.deepEqual(resolveRankingChoice(rankings, 'dynasty'), { preset: 'balanced', weights: SHIPPED.weights.dynasty });
});

test('the shipped file naming a preset (a checkout run as its own league) is not a conflict', () => {
  const rankings = resolveSettings({ defaults: { rankings: { ...SHIPPED, preset: 'rebuild' } } }).rankings;
  assert.deepEqual(resolveRankingWeights(rankings, 'dynasty'), SHIPPED.presets.rebuild.weights.dynasty);
});

/* ------------------------------------------------- a league's own preset sets */

test("a partial preset set in a league's file replaces the shipped one wholesale, and must sum to 1.0", () => {
  const rankings = rankingsWith({ preset: 'rebuild', presets: { rebuild: { weights: { dynasty: { dynasty_value: 1 } } } } });
  assert.deepEqual(resolveRankingWeights(rankings, 'dynasty'), { dynasty_value: 1 });
  assert.throws(
    () => rankingsWith({ presets: { rebuild: { weights: { dynasty: { dynasty_value: 0.5 } } } } }),
    /presets\.rebuild\.weights\.dynasty sums to 0\.5/,
  );
});

test('balanced cannot be redefined under presets, and a preset name is a plain word', () => {
  assert.throws(
    () => rankingsWith({ presets: { balanced: { weights: { dynasty: SHIPPED.weights.dynasty } } } }),
    /presets\.balanced, but balanced is the sets under weights/,
  );
  assert.throws(() => rankingsWith({ presets: { 'Win Now': { weights: {} } } }), /not a preset name/);
});

/* ------------------------------------------------------ the prompt context */

test('a ranking context names the preset; an edition that ranks nobody carries neither preset nor weights', () => {
  const config = { editorial: { output: {}, ranking_emoji: {} }, rankings: rankingsWith({ preset: 'rebuild' }) };
  const league = { name: 'Invented League', season: '2026', status: 'in_season', format: { type: 'dynasty', source: 'declared' } };
  const context = buildContext({ task: 'rankings', config, league, teams: [], players: {}, week: 3 });
  assert.equal(context.editorial.rankingPreset, 'rebuild');
  assert.deepEqual(context.editorial.rankingWeights, SHIPPED.presets.rebuild.weights.dynasty);

  const preview = buildContext({ task: 'preview', config, league, teams: [], players: {}, week: 3 });
  assert.equal(preview.editorial.rankingPreset, undefined);
  assert.equal(preview.editorial.rankingWeights, undefined);
});

test('every ranking prompt may name the preset and is told never to print the numbers', () => {
  for (const file of ['weekly-power-rankings.md', 'preseason-power-rankings.md', 'postseason-power-rankings.md', 'survival-rankings.md']) {
    const text = readFileSync(join(PACKAGE_ROOT, 'prompts', file), 'utf8');
    assert.match(text, /editorial\.rankingPreset/, file);
    assert.match(text, /never\s+print\s+the\s+weights/i, file);
  }
});

/* ---------------------------------------------------------- the league file */

test('a league file carries the preset and round-trips it, through a folder and back', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-presets-')));
  folders.push(root);
  const entries = [
    { path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=dynasty\n` },
    { path: 'config/rankings.yml', text: 'preset: rebuild\n' },
  ];
  const { leagueFile } = leagueFileFromWorkspace(entries, { surface: 'cli' });
  assert.equal(leagueFile.settings.rankings.preset, 'rebuild');

  const read = parseLeagueFile(serializeLeagueFile(leagueFile));
  assert.deepEqual(read.settings.rankings, { preset: 'rebuild' });
  const { rankings } = resolveSettings({ league: settingsLayers(read.settings) });
  assert.deepEqual(resolveRankingChoice(rankings, 'dynasty').preset, 'rebuild');

  // Written back out as a league folder, the run there ranks under it.
  for (const { path, text } of workspaceFromLeagueFile(read)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const config = loadConfig({ workspaceRoot: root });
  assert.equal(config.rankings.preset, 'rebuild');
  assert.deepEqual(resolveRankingWeights(config.rankings, 'dynasty'), SHIPPED.presets.rebuild.weights.dynasty);
});

test('a league file whose declared format lacks its preset, or that also sets its own weights, is refused', () => {
  const file = newLeagueFile({ surface: 'cli', leagueId: FAKE_LEAGUE_ID, writtenAt: '2026-10-15T18:00:00.000Z' });
  const withSettings = (settings) => () => parseLeagueFile(JSON.stringify({ ...file, settings: { ...file.settings, ...settings } }));
  assert.throws(
    withSettings({ format: 'redraft', rankings: { preset: 'rebuild' } }),
    /A redraft league's presets are: balanced, win-now/,
  );
  assert.throws(
    withSettings({ format: 'dynasty', rankings: { preset: 'rebuild', weights: { dynasty: SHIPPED.weights.dynasty } } }),
    /preset: rebuild.*weights\.dynasty/s,
  );
  assert.throws(withSettings({ rankings: { preset: 'tank' } }), /not a ranking preset/);
  assert.doesNotThrow(withSettings({ format: 'dynasty', rankings: { preset: 'rebuild' } }));
});
