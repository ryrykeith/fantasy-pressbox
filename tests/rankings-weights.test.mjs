import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readYamlFile, resolveRankingWeights } from '../src/config.mjs';

const DYNASTY_WEIGHTS = {
  starting_lineup: 0.3,
  dynasty_value: 0.25,
  depth: 0.15,
  quarterback: 0.1,
  future_draft_capital: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.05,
};

const REDRAFT_WEIGHTS = {
  starting_lineup: 0.45,
  depth: 0.25,
  quarterback: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.15,
};

const DEFAULT_RANKINGS_FIXTURE = {
  weights: { dynasty: DYNASTY_WEIGHTS, redraft: REDRAFT_WEIGHTS },
  weekly: { max_normal_movement: 3, allow_exceptional_movement: true },
};

function sum(weights) {
  return Object.values(weights).reduce((total, value) => total + value, 0);
}

/* ------------------------------------------------ resolveRankingWeights */

test('a dynasty league gets the dynasty set, dynasty assets included', () => {
  const weights = resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, 'dynasty');
  assert.deepEqual(weights, DYNASTY_WEIGHTS);
  assert.ok('dynasty_value' in weights);
  assert.ok('future_draft_capital' in weights);
  assert.ok(Math.abs(sum(weights) - 1) < 1e-9, 'dynasty weights should sum to 1.0');
});

test('a redraft league gets the redraft set, with no dynasty assets at all', () => {
  const weights = resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, 'redraft');
  assert.deepEqual(weights, REDRAFT_WEIGHTS);
  assert.ok(!('dynasty_value' in weights), 'redraft should not weigh dynasty_value');
  assert.ok(!('future_draft_capital' in weights), 'redraft should not weigh future_draft_capital');
  assert.ok(Math.abs(sum(weights) - 1) < 1e-9, 'redraft weights should sum to 1.0');
});

test('a format with no set of its own falls back to the dynasty set', () => {
  // guillotine has no set yet — see Epic: Guillotine league coverage.
  assert.deepEqual(resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, 'guillotine'), DYNASTY_WEIGHTS);
  assert.deepEqual(resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, undefined), DYNASTY_WEIGHTS);
});

/* ------------------------------------------------ readYamlFile replace semantics */

function withTempYamlFile(contents, body) {
  const dir = mkdtempSync(join(tmpdir(), 'fantasy-pressbox-rankings-'));
  const path = join(dir, 'rankings.yml');
  writeFileSync(path, contents, 'utf8');
  try {
    return body(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a partial redraft override replaces the whole set rather than merging into the default', () => {
  withTempYamlFile(
    'weights:\n  redraft:\n    starting_lineup: 0.9\n',
    (path) => {
      const rankings = readYamlFile(path, DEFAULT_RANKINGS_FIXTURE, {
        replaceKeys: ['weights.dynasty', 'weights.redraft'],
      });

      // Written out as one key, so it stays exactly one key — the missing
      // four are not silently restored from the default.
      assert.deepEqual(rankings.weights.redraft, { starting_lineup: 0.9 });

      // The set nobody touched is untouched.
      assert.deepEqual(rankings.weights.dynasty, DYNASTY_WEIGHTS);
    },
  );
});

test('an untouched format keeps its default set entirely', () => {
  withTempYamlFile('weekly:\n  max_normal_movement: 5\n', (path) => {
    const rankings = readYamlFile(path, DEFAULT_RANKINGS_FIXTURE, {
      replaceKeys: ['weights.dynasty', 'weights.redraft'],
    });

    assert.deepEqual(rankings.weights.dynasty, DYNASTY_WEIGHTS);
    assert.deepEqual(rankings.weights.redraft, REDRAFT_WEIGHTS);
    assert.equal(rankings.weekly.max_normal_movement, 5);
  });
});

test('a missing file returns the fallback untouched', () => {
  const rankings = readYamlFile('/does/not/exist/rankings.yml', DEFAULT_RANKINGS_FIXTURE, {
    replaceKeys: ['weights.dynasty', 'weights.redraft'],
  });
  assert.equal(rankings, DEFAULT_RANKINGS_FIXTURE);
});
