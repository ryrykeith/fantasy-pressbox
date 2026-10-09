import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { summarizeTransactionWeek, describeQuietTransactionWeek } from '../src/cli.mjs';

/**
 * The transactions command is one command for every kind of transaction
 * coverage, so what matters most is the decision it makes before any work:
 * is there anything in this week to write about.
 */

test('a week with no transactions is quiet and says so', () => {
  const summary = summarizeTransactionWeek([]);
  assert.deepEqual(summary, { trades: 0, pickups: 0, total: 0 });
  assert.match(describeQuietTransactionWeek(summary, 4), /Week 4 has no completed transactions/);
});

test('a missing transaction list is treated as a quiet week, not a crash', () => {
  assert.equal(summarizeTransactionWeek(null).total, 0);
});

test('a week with only waiver pickups is told apart from a week with nothing', () => {
  const summary = summarizeTransactionWeek([{ type: 'waiver' }, { type: 'free_agent' }]);
  assert.deepEqual(summary, { trades: 0, pickups: 2, total: 2 });
  const message = describeQuietTransactionWeek(summary, 3);
  assert.match(message, /2 waiver or free-agent move/);
  assert.match(message, /no trades/);
});

test('a week with a trade is not quiet', () => {
  const summary = summarizeTransactionWeek([{ type: 'trade' }, { type: 'waiver' }]);
  assert.deepEqual(summary, { trades: 1, pickups: 1, total: 2 });
  assert.equal(describeQuietTransactionWeek(summary, 2), null);
});

test('--help lists the transactions command with an example', () => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^ {2}transactions {2,}/m);
  assert.match(result.stdout, /node src\/cli\.mjs transactions --week \d/);
});
