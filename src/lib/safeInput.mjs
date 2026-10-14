/**
 * The checks every parser in core applies to text a stranger could hand it.
 *
 * The website parses files a visitor drops on it, and the CLI parses the same
 * files, so the YAML reader (src/lib/yaml.mjs), the settings merge
 * (deepMerge in src/settings.mjs) and every JSON read of a league or saved
 * page go through these rules:
 *
 *   - a key named __proto__, constructor or prototype is refused, because an
 *     object built by assigning keys (`map[key] = value`) gets a new prototype
 *     from __proto__, and a later merge can carry it further;
 *   - a file over its size limit is refused before it is parsed;
 *   - data nested deeper than the depth limit is refused, before a recursive
 *     step (a JSON reviver, a merge) can run out of stack on it;
 *   - a string longer than the string limit is refused.
 *
 * A refusal is an UnsafeInputError. Its message is in plain words, names the
 * file (when the caller gave one) and the field, and never echoes a value
 * from the file.
 *
 * NODE-FREE: this module imports nothing, so the browser core can use it.
 */

/** Keys that could reach an object's prototype if the parsed data were merged or assigned. */
export const HOSTILE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * The limits for settings files (editorial.yml, rankings.yml, rookie-draft.yml,
 * guillotine.yml, a prospect board). The shipped files are a few kilobytes,
 * nest three levels and hold no string over a hundred characters.
 */
export const CONFIG_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 16,
  maxStringLength: 10_000,
});

/**
 * The limits for league data in JSON: a saved ESPN page, a league file. A
 * week with every lineup is a few hundred kilobytes and nests about a dozen
 * levels.
 */
export const LEAGUE_JSON_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxDepth: 64,
  maxStringLength: 100_000,
});

/** A refusal of unsafe input. `file` and `field` say where; neither is a value from the file. */
export class UnsafeInputError extends Error {
  constructor(message, { file = null, field = null, reason } = {}) {
    super(message);
    this.name = 'UnsafeInputError';
    this.file = file;
    this.field = field;
    this.reason = reason;
  }
}

/** UTF-8 length of `text` without allocating the encoded text. */
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * A refusal's subject: the file when the caller named one, otherwise "It",
 * which reads well behind a caller's own "Could not read <file>: ".
 */
const named = (file) => file ?? 'It';

/** A field path (`['output', 'include_emoji']`, `['teams', 3, 'name']`) as `output.include_emoji` / `teams[3].name`. */
export function fieldPath(path) {
  let text = '';
  for (const part of path) {
    if (typeof part === 'number') text += `[${part}]`;
    else text += text === '' ? part : `.${part}`;
  }
  return text;
}

const sizeText = (bytes) =>
  bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MB` : bytes >= 1024 ? `${bytes / 1024} KB` : `${bytes} bytes`;

/** Refuses `text` when it is over `maxBytes` (UTF-8). */
export function checkSize(text, { file = null, maxBytes }) {
  // Every UTF-16 unit is at least one byte, so a long string is over without counting.
  if (text.length > maxBytes || utf8Length(text) > maxBytes) {
    throw new UnsafeInputError(`${named(file)} is larger than ${sizeText(maxBytes)}, so it was not read.`, {
      file,
      reason: 'size',
    });
  }
}

/** Refuses a key named __proto__, constructor or prototype. `path` is where the key sits. */
export function checkKey(key, { file = null, path = [] } = {}) {
  if (HOSTILE_KEYS.has(key)) {
    const where = path.length ? ` under ${fieldPath(path)}` : '';
    throw new UnsafeInputError(
      `${named(file)} holds a key named "${key}"${where}, which was refused as unsafe to read.`,
      { file, field: fieldPath([...path, key]), reason: 'key' },
    );
  }
}

/** Refuses a key or string value at `path` longer than `maxStringLength`. */
export function checkString(text, { file = null, path = [], maxStringLength }) {
  if (text.length > maxStringLength) {
    throw new UnsafeInputError(
      `${named(file)} has a value at ${fieldPath(path) || 'the top'} longer than ${maxStringLength} characters, ` +
        'so it was not read.',
      { file, field: fieldPath(path), reason: 'string' },
    );
  }
}

/**
 * Refuses a table or list at `depth` levels beyond `maxDepth`. The top-level
 * table is level 1; `path` is the field holding the one at `depth`.
 */
export function checkDepth(depth, { file = null, path = [], maxDepth }) {
  if (depth > maxDepth) {
    throw new UnsafeInputError(
      `${named(file)} nests more than ${maxDepth} levels deep at ${fieldPath(path) || 'the top'}, so it was not read.`,
      { file, field: fieldPath(path), reason: 'depth' },
    );
  }
}

/**
 * Scans JSON text for its nesting, without parsing it, and refuses it at the
 * first container deeper than `maxDepth`. The refusal names the field by its
 * path. Malformed text is left for JSON.parse to refuse.
 *
 * This runs before JSON.parse because a reviver recurses: a file of a million
 * `[` would exhaust the stack inside JSON.parse and surface as a stack error.
 */
function checkJsonDepth(text, { file, maxDepth }) {
  // One entry per open container: { list, key, index } — the key or index of
  // the child currently being read.
  const stack = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      const start = i + 1;
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      const top = stack.at(-1);
      if (top && !top.list) {
        let next = i + 1;
        while (next < text.length && /\s/.test(text[next])) next += 1;
        if (text[next] === ':') top.key = jsonKey(text.slice(start, i));
      }
    } else if (ch === '{' || ch === '[') {
      if (stack.length + 1 > maxDepth) {
        const path = stack.map((entry) => (entry.list ? entry.index : entry.key));
        checkDepth(stack.length + 1, { file, path, maxDepth });
      }
      stack.push({ list: ch === '[', key: null, index: 0 });
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    } else if (ch === ',') {
      const top = stack.at(-1);
      if (top?.list) top.index += 1;
    }
  }
}

/** A JSON key's raw text as the key it means; raw when its escapes do not decode. */
function jsonKey(raw) {
  if (!raw.includes('\\')) return raw;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    // Malformed: JSON.parse refuses the whole text next, naming no key.
    return raw;
  }
}

/**
 * A JSON reviver that refuses hostile keys and over-long keys and strings.
 * Pass it to JSON.parse for any league file; `parseJsonSafely` uses it after
 * checking size and depth, which a bare reviver cannot.
 *
 * A reviver sees a key but not the path to it, so its refusals name the key.
 */
export function safeJsonReviver({ file = null, maxStringLength = LEAGUE_JSON_LIMITS.maxStringLength } = {}) {
  return function reviver(key, value) {
    checkKey(key, { file });
    checkString(key, { file, path: [key], maxStringLength });
    if (typeof value === 'string') checkString(value, { file, path: [key], maxStringLength });
    return value;
  };
}

/**
 * Parses JSON from a stranger: size, then depth, then JSON.parse with
 * `safeJsonReviver`. A leading byte order mark (a browser may save one) is
 * dropped. Text that is not JSON throws a SyntaxError for the caller to word;
 * every other refusal is an UnsafeInputError naming the file.
 */
export function parseJsonSafely(text, { file = null, limits = LEAGUE_JSON_LIMITS } = {}) {
  if (typeof text !== 'string') throw new TypeError('parseJsonSafely needs the file text');
  checkSize(text, { file, maxBytes: limits.maxBytes });
  const body = text.replace(/^﻿/, '');
  checkJsonDepth(body, { file, maxDepth: limits.maxDepth });
  return JSON.parse(body, safeJsonReviver({ file, maxStringLength: limits.maxStringLength }));
}
