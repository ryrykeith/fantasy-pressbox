/**
 * Hostile input: every parser in core refuses prototype keys, and enforces
 * the size, depth and string-length limits (src/lib/safeInput.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_LIMITS,
  HOSTILE_KEYS,
  LEAGUE_JSON_LIMITS,
  UnsafeInputError,
  parseJsonSafely,
  safeJsonReviver,
} from '../src/lib/safeInput.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';
import { deepMerge, mergeSettingsLayer } from '../src/settings.mjs';
import { PACKAGE_ROOT, readYamlFile } from '../src/config.mjs';
import { loadAssets } from '../src/assets.mjs';
import { ESPN_IMPORT_LIMITS, EspnImportError, parseSavedFile } from '../src/espn/import.mjs';

const KEYS = [...HOSTILE_KEYS];

/** Asserts `fn` throws an UnsafeInputError for `field`, whose message matches every pattern. */
function refused(fn, { field, reason, patterns = [] }) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof UnsafeInputError, `expected UnsafeInputError, got ${error}`);
    if (field !== undefined) assert.equal(error.field, field);
    if (reason) assert.equal(error.reason, reason);
    for (const pattern of patterns) assert.match(error.message, pattern);
    return true;
  });
}

function withFolder(fn) {
  const root = mkdtempSync(join(tmpdir(), 'pressbox-safe-input-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/* --------------------------------------------------------------- prototype keys */

test('the 2026-10-12 reproduction: a nested __proto__ table is refused, not turned into a prototype', () => {
  const text = 'output:\n  __proto__:\n    include_emoji: false\n';
  refused(() => parseYaml(text), {
    field: 'output.__proto__',
    reason: 'key',
    patterns: [/key named "__proto__" under output/],
  });
  // Before the fix, this parsed to an output table whose keys and JSON were
  // empty but whose include_emoji read false through its new prototype.
  assert.equal({}.include_emoji, undefined);
});

test('YAML: every prototype key is refused at the top, nested, and in a list item', () => {
  for (const key of KEYS) {
    refused(() => parseYaml(`${key}: 1\n`), { field: key, reason: 'key' });
    refused(() => parseYaml(`output:\n  ${key}: 1\n`), { field: `output.${key}`, reason: 'key' });
    refused(() => parseYaml(`order:\n  - ${key}: playoff\n`), { field: `order[0].${key}`, reason: 'key' });
    refused(() => parseYaml(`order:\n  - teams: playoff\n    ${key}: record\n`), { field: `order[0].${key}`, reason: 'key' });
    refused(() => parseYaml(`"${key}": 1\n`), { field: key, reason: 'key' });
  }
  // A value that happens to read __proto__ is only text.
  assert.deepEqual(parseYaml('name: __proto__\n'), { name: '__proto__' });
});

test('a YAML file with a prototype key is refused naming the file and the key', () => {
  withFolder((root) => {
    for (const key of KEYS) {
      const path = join(root, 'editorial.yml');
      writeFileSync(path, `output:\n  ${key}:\n    include_emoji: false\n`);
      assert.throws(
        () => readYamlFile(path, { output: { include_emoji: true } }),
        (error) => error.message.includes(path) && error.message.includes(`"${key}"`),
      );
    }
  });
  // The browser path names the package file it was reading.
  const assets = loadAssets((path) => (path === 'config/editorial.yml' ? 'constructor: 1\n' : null));
  assert.throws(() => assets.defaultConfig(), /config\/editorial\.yml.*"constructor"/);
});

test('deepMerge refuses a prototype key that JSON.parse left as an ordinary key', () => {
  for (const key of KEYS) {
    const layer = JSON.parse(`{"output":{"${key}":{"include_emoji":false}}}`);
    refused(() => deepMerge({ output: { include_emoji: true } }, layer), {
      field: `output.${key}`,
      reason: 'key',
    });
    refused(() => mergeSettingsLayer({}, JSON.parse(`{"${key}":{"x":1}}`)), { field: key, reason: 'key' });
  }
  assert.equal({}.include_emoji, undefined);
  assert.equal({}.x, undefined);
});

test('JSON: the reviver and parseJsonSafely refuse every prototype key, naming the file and the key', () => {
  for (const key of KEYS) {
    const text = `{"teams":[{"name":"Taco Tuesday","${key}":{"polluted":true}}]}`;
    refused(() => JSON.parse(text, safeJsonReviver({ file: 'league.json' })), {
      reason: 'key',
      patterns: [/^league\.json holds a key named/, new RegExp(`"${key}"`)],
    });
    refused(() => parseJsonSafely(text, { file: 'league.json' }), {
      reason: 'key',
      patterns: [/^league\.json /, new RegExp(`"${key}"`)],
    });
  }
  assert.equal({}.polluted, undefined);
  assert.deepEqual(parseJsonSafely('﻿{"name":"Rebuild Szn"}', { file: 'f.json' }), { name: 'Rebuild Szn' });
  assert.throws(() => parseJsonSafely('{not json', { file: 'f.json' }), SyntaxError);
});

/* ----------------------------------------------------------------------- limits */

/** `levels` nested YAML tables: the top table is level 1. */
const nestedYaml = (levels) =>
  Array.from({ length: levels }, (_, i) => `${'  '.repeat(i)}k${i}:${i === levels - 1 ? ' 1' : ''}`).join('\n');

/** `levels` nested JSON objects: the top object is level 1. */
const nestedJson = (levels) => `${'{"k":'.repeat(levels - 1)}{}${'}'.repeat(levels - 1)}`;

/** YAML text of exactly `bytes` UTF-8 bytes: one setting, then a comment of `fill` characters. */
function yamlOfBytes(bytes, fill = 'x') {
  const head = 'a: 1\n# ';
  const width = Buffer.byteLength(fill);
  const room = bytes - head.length;
  return head + fill.repeat(Math.floor(room / width)) + 'x'.repeat(room % width);
}

test('YAML size limit: at the limit it parses, one byte over it is refused', () => {
  const { maxBytes } = CONFIG_LIMITS;
  for (const fill of ['x', 'é']) {
    const atLimit = yamlOfBytes(maxBytes, fill);
    assert.equal(Buffer.byteLength(atLimit), maxBytes);
    assert.deepEqual(parseYaml(atLimit), { a: 1 });
    refused(() => parseYaml(`${atLimit}x`), { reason: 'size', patterns: [/larger than 1 MB/] });
  }
});

test('YAML depth limit: at the limit it parses, one level deeper is refused naming the field', () => {
  const { maxDepth } = CONFIG_LIMITS;
  assert.doesNotThrow(() => parseYaml(nestedYaml(maxDepth)));
  const fieldAbove = Array.from({ length: maxDepth }, (_, i) => `k${i}`).join('.');
  refused(() => parseYaml(nestedYaml(maxDepth + 1)), {
    reason: 'depth',
    field: fieldAbove,
    patterns: [new RegExp(`more than ${maxDepth} levels`)],
  });
  // A list is a level, and so is each `- key: value` table in it.
  const listAt = (tables) =>
    [...Array.from({ length: tables }, (_, i) => `${'  '.repeat(i)}k${i}:`), `${'  '.repeat(tables)}- a: 1`].join('\n');
  assert.doesNotThrow(() => parseYaml(listAt(maxDepth - 2)));
  refused(() => parseYaml(listAt(maxDepth - 1)), { reason: 'depth' });
});

test('YAML string limit: at the limit it parses, one character over is refused, without echoing it', () => {
  const { maxStringLength } = CONFIG_LIMITS;
  const at = 'v'.repeat(maxStringLength);
  const over = 'w'.repeat(maxStringLength + 1);
  assert.equal(parseYaml(`voice:\n  tone: ${at}\n`).voice.tone, at);
  assert.deepEqual(parseYaml(`list:\n  - "${at}"\n`).list, [at]);
  for (const text of [`voice:\n  tone: ${over}\n`, `voice:\n  tone: "${over}"\n`]) {
    assert.throws(
      () => parseYaml(text),
      (error) => error.reason === 'string' && error.field === 'voice.tone' && !error.message.includes('www'),
    );
  }
  refused(() => parseYaml(`list:\n  - ${over}\n`), { reason: 'string', field: 'list[0]' });
  // A key is held to the same limit.
  assert.doesNotThrow(() => parseYaml(`${'k'.repeat(maxStringLength)}: 1\n`));
  refused(() => parseYaml(`${'k'.repeat(maxStringLength + 1)}: 1\n`), { reason: 'string' });
});

test('JSON size limit: at the limit it parses, one byte over is refused naming the file', () => {
  const limits = { ...LEAGUE_JSON_LIMITS, maxBytes: 64 };
  const atLimit = `{"a":"${'x'.repeat(64 - 8)}"}`;
  assert.equal(atLimit.length, 64);
  assert.ok(parseJsonSafely(atLimit, { file: 'l.json', limits }));
  refused(() => parseJsonSafely(`${atLimit} `, { file: 'l.json', limits }), {
    reason: 'size',
    patterns: [/^l\.json is larger than 64 bytes/],
  });
  // UTF-8 bytes, not characters: four two-byte letters are eight bytes.
  const wide = `{"a":"${'é'.repeat(28)}"}`;
  assert.equal(Buffer.byteLength(wide), 64);
  assert.ok(parseJsonSafely(wide, { file: 'l.json', limits }));
  refused(() => parseJsonSafely(`${wide} `, { file: 'l.json', limits }), { reason: 'size' });
});

test('JSON depth limit: at the limit it parses, one level deeper is refused before the reviver can recurse', () => {
  const { maxDepth } = LEAGUE_JSON_LIMITS;
  assert.ok(parseJsonSafely(nestedJson(maxDepth), { file: 'l.json' }));
  refused(() => parseJsonSafely(nestedJson(maxDepth + 1), { file: 'l.json' }), {
    reason: 'depth',
    field: Array(maxDepth).fill('k').join('.'),
    patterns: [/^l\.json nests more than 64 levels deep at k\.k/],
  });
  // Lists name their index; keys inside strings and escaped quotes do not confuse the count.
  const list = `{"teams":[1,{"a":"[[[\\"{{{"},${'['.repeat(maxDepth)}${']'.repeat(maxDepth)}]}`;
  refused(() => parseJsonSafely(list, { file: 'l.json' }), { reason: 'depth', field: `teams[2]${'[0]'.repeat(maxDepth - 2)}` });
  // A million brackets would exhaust the stack inside JSON.parse's reviver.
  const flood = `${'['.repeat(1_000_000)}${']'.repeat(1_000_000)}`;
  refused(() => parseJsonSafely(flood, { file: 'l.json' }), { reason: 'depth', field: Array(maxDepth).fill('[0]').join('') });
});

test('JSON string limit: at the limit it parses, one character over is refused naming the field, without echoing it', () => {
  const { maxStringLength } = LEAGUE_JSON_LIMITS;
  const at = 'v'.repeat(maxStringLength);
  assert.equal(parseJsonSafely(JSON.stringify({ name: at }), { file: 'l.json' }).name, at);
  assert.throws(
    () => parseJsonSafely(JSON.stringify({ name: `${at}w` }), { file: 'l.json' }),
    (error) =>
      error instanceof UnsafeInputError &&
      error.reason === 'string' &&
      error.field === 'name' &&
      error.message.startsWith('l.json ') &&
      !error.message.includes('vvv'),
  );
  refused(() => parseJsonSafely(JSON.stringify({ [`${at}k`]: 1 }), { file: 'l.json' }), { reason: 'string' });
});

/* ------------------------------------------------------------------ ESPN import */

test('a saved ESPN page is held to ESPN_IMPORT_LIMITS by the shared reader, naming the file', () => {
  const { maxDepth, maxStringLength } = ESPN_IMPORT_LIMITS;
  const espnRefuses = (text, pattern) =>
    assert.throws(
      () => parseSavedFile(text, { file: 'saved.json' }),
      (error) => error instanceof EspnImportError && error.message.startsWith('saved.json ') && pattern.test(error.message),
    );
  assert.ok(parseSavedFile(nestedJson(maxDepth), { file: 'saved.json' }));
  espnRefuses(nestedJson(maxDepth + 1), new RegExp(`more than ${maxDepth} levels.*Save the page from ESPN again`));
  assert.ok(parseSavedFile(JSON.stringify({ name: 'n'.repeat(maxStringLength) }), { file: 'saved.json' }));
  espnRefuses(JSON.stringify({ name: 'n'.repeat(maxStringLength + 1) }), /longer than 20000 characters/);
  espnRefuses('{"__proto__":{}}', /key named "__proto__".*Save the page from ESPN again/);
});

/* -------------------------------------------------------------- shipped configs */

test('every shipped config file still parses under the limits', () => {
  const dir = join(PACKAGE_ROOT, 'config');
  const files = readdirSync(dir).filter((file) => file.endsWith('.yml'));
  assert.ok(files.length >= 6, files.join(', '));
  for (const file of files) {
    assert.doesNotThrow(() => parseYaml(readFileSync(join(dir, file), 'utf8')), file);
  }
});
