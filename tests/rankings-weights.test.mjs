import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, readYamlFile, resolveRankingWeights, validateRankingWeights, ROOT } from '../src/config.mjs';

// Point config at a file that does not exist so the developer's own .env plays
// no part in these tests, same as tests/config-format.test.mjs.
const NO_ENV_FILE = join(ROOT, 'tests', '.env.does-not-exist');

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

test('a format with no set of its own is a loud error, not a silent fallback to dynasty', () => {
  // guillotine has no set yet — see Epic: Guillotine league coverage.
  assert.throws(
    () => resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, 'guillotine'),
    (error) => {
      assert.match(error.message, /weights\.guillotine/);
      assert.match(error.message, /guillotine/);
      // Must not just say "missing" — it should point at what does exist too.
      assert.match(error.message, /dynasty.*redraft/s);
      return true;
    },
  );
});

test('resolving with no format at all is also a loud error, not a silent fallback', () => {
  assert.throws(
    () => resolveRankingWeights(DEFAULT_RANKINGS_FIXTURE, undefined),
    /No ranking weight set for format "undefined"/,
  );
});

/* ------------------------------------------------ validateRankingWeights */

test('weight sets that each sum to 1.0 pass validation silently', () => {
  assert.doesNotThrow(() => validateRankingWeights(DEFAULT_RANKINGS_FIXTURE.weights));
});

test('a weight set that does not sum to 1.0 is a loud error naming the set and its actual sum', () => {
  const broken = {
    dynasty: DYNASTY_WEIGHTS,
    redraft: { ...REDRAFT_WEIGHTS, starting_lineup: 0.9 }, // now sums to 1.45
  };
  assert.throws(
    () => validateRankingWeights(broken),
    (error) => {
      assert.match(error.message, /weights\.redraft/);
      assert.match(error.message, /1\.45/);
      return true;
    },
  );
});

test('a weight set within floating point tolerance of 1.0 is accepted', () => {
  const almost = { dynasty: { a: 0.1, b: 0.2, c: 0.7000000000000001 } };
  assert.doesNotThrow(() => validateRankingWeights(almost));
});

test('an empty weights map has nothing to validate', () => {
  assert.doesNotThrow(() => validateRankingWeights({}));
  assert.doesNotThrow(() => validateRankingWeights(undefined));
});

/* ------------------------------------------------ wired into loadConfig */

test('a mismatched weight set stops the run at config load, naming the set and the sum', () => {
  withTempYamlFile(
    'weights:\n  dynasty:\n    starting_lineup: 0.5\n    depth: 0.6\n',
    (path) => {
      assert.throws(
        () => loadConfig({ envPath: NO_ENV_FILE, rankingsPath: path }),
        (error) => {
          assert.match(error.message, /weights\.dynasty/);
          assert.match(error.message, /1\.1/);
          return true;
        },
      );
    },
  );
});

test('a valid rankings.yml loads without complaint', () => {
  withTempYamlFile(
    'weights:\n  dynasty:\n    starting_lineup: 0.5\n    depth: 0.5\n',
    (path) => {
      const config = loadConfig({ envPath: NO_ENV_FILE, rankingsPath: path });
      assert.deepEqual(config.rankings.weights.dynasty, { starting_lineup: 0.5, depth: 0.5 });
    },
  );
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
