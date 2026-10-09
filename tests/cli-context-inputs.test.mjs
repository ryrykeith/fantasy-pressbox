/**
 * The edition builder in src/cli.mjs computes an edition's inputs and then
 * hands them to buildContext in one call. Unit tests build the context
 * directly, so they cannot see a CLI that computes an input and forgets to
 * pass it — which is how the future stock edition first shipped: every test
 * green, and the command itself refusing to run because rosterWindow and
 * pickCapital never reached the context.
 *
 * This reads the call and checks that every input the CLI prepares for
 * buildContext is passed to it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = readFileSync(join(ROOT, 'src', 'cli.mjs'), 'utf8');
const promptContext = readFileSync(join(ROOT, 'src', 'promptContext.mjs'), 'utf8');

/** The names destructured by buildContext's parameter list. */
function buildContextParameters() {
  const start = promptContext.indexOf('export function buildContext({');
  assert.ok(start >= 0, 'buildContext not found');
  const body = promptContext.slice(start, promptContext.indexOf('}) {', start));
  return [...body.matchAll(/^\s+([A-Za-z]\w*)\s*(?:=|,)/gm)].map((m) => m[1]);
}

/** The names the CLI passes in its single buildContext call. */
function namesPassedByCli() {
  const start = cli.indexOf('const context = buildContext({');
  assert.ok(start >= 0, 'the CLI buildContext call was not found');
  const call = cli.slice(start, cli.indexOf('});', start));
  return new Set([...call.matchAll(/^\s+([A-Za-z]\w*)\s*[,:]/gm)].map((m) => m[1]));
}

test('every buildContext input the CLI computes is passed to it', () => {
  const passed = namesPassedByCli();
  // An input the CLI declares as a variable (`let rosterWindow = null`) is one
  // it means to compute; it must then reach the context.
  const declared = buildContextParameters().filter((name) => new RegExp(`\\blet ${name}\\b`).test(cli));
  const forgotten = declared.filter((name) => !passed.has(name));
  assert.deepEqual(forgotten, [], `computed in src/cli.mjs but never passed to buildContext: ${forgotten.join(', ')}`);
});

test('the future stock inputs specifically reach the context', () => {
  const passed = namesPassedByCli();
  assert.ok(passed.has('rosterWindow'));
  assert.ok(passed.has('pickCapital'));
});
