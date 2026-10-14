/**
 * A deliberately small YAML reader.
 *
 * Fantasy Pressbox ships with zero npm dependencies so that setup is just
 * "install Node". That means we parse our own config files. We only support
 * the subset of YAML the files under config/ actually use:
 *
 *   - nested maps, by indentation
 *   - lists of scalars and lists of maps (`- key: value` with more keys
 *     indented beneath it)
 *   - strings, numbers, booleans, null
 *   - `#` comments and blank lines
 *
 * Anchors, multi-line strings, flow syntax and multiple documents are not
 * supported. If a config file needs them, the file is doing too much.
 *
 * The text may come from a stranger (a file dropped on the website), so the
 * reader applies src/lib/safeInput.mjs: a key named __proto__, constructor
 * or prototype is refused (a map is built by assigning keys, and __proto__
 * would replace its prototype), as is text over the size limit, nesting over
 * the depth limit, and a key or value over the string limit. Its refusals
 * name the field, never a value; the caller names the file.
 */
import { CONFIG_LIMITS, checkDepth, checkKey, checkSize, checkString } from './safeInput.mjs';

/** Strip a trailing `# comment`, but not a `#` inside a quoted string. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === '' || text === '~' || text === 'null') return null;
  if (text === 'true' || text === 'yes') return true;
  if (text === 'false' || text === 'no') return false;
  const quoted = /^"(.*)"$/.exec(text) || /^'(.*)'$/.exec(text);
  if (quoted) return quoted[1];
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

/** Split `key: value` into [key, rawValue], respecting quoted keys. */
function splitKey(content) {
  let quote = null;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ':' && (i + 1 === content.length || /\s/.test(content[i + 1]))) {
      const key = content.slice(0, i).trim().replace(/^["'](.*)["']$/, '$1');
      return [key, content.slice(i + 1).trim()];
    }
  }
  return null;
}

function toLines(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => {
      const withoutComment = stripComment(line);
      const content = withoutComment.trim();
      if (content === '' || content === '---') return null;
      return { indent: withoutComment.match(/^\s*/)[0].length, content, lineNumber: index + 1 };
    })
    .filter(Boolean);
}

/**
 * Reads the block of `lines` starting at `start`, at `indent`. `path` is the
 * field the block is the value of (empty at the top); `limits` are the
 * safe-input limits.
 */
function parseBlock(lines, start, indent, path, limits) {
  checkDepth(path.length + 1, { path, maxDepth: limits.maxDepth });
  const scalar = (raw, at) => {
    const value = parseScalar(raw);
    if (typeof value === 'string') checkString(value, { path: at, maxStringLength: limits.maxStringLength });
    return value;
  };
  const checkedKey = (key, within) => {
    checkKey(key, { path: within });
    checkString(key, { path: [...within, key], maxStringLength: limits.maxStringLength });
    return key;
  };

  // A block is a list if its first line starts with "- ", otherwise a map.
  if (lines[start].content.startsWith('- ') || lines[start].content === '-') {
    const list = [];
    let i = start;
    while (i < lines.length && lines[i].indent >= indent) {
      if (lines[i].indent > indent) {
        throw new Error(`Unexpected indentation on line ${lines[i].lineNumber}`);
      }
      const item = lines[i].content.replace(/^-\s*/, '');
      const here = [...path, list.length];
      i++;
      const hasChildren = i < lines.length && lines[i].indent > indent;
      if (item === '') {
        if (!hasChildren) throw new Error(`Empty list item on line ${lines[i - 1].lineNumber}`);
        const [value, next] = parseBlock(lines, i, lines[i].indent, here, limits);
        list.push(value);
        i = next;
      } else if (splitKey(item) && hasChildren) {
        // A map spread over several lines:
        //   - teams: playoff
        //     sort: record
        // Its first key sits on the dash line, so re-read that key as though
        // it were on a line of its own, at the column the text starts in.
        const itemIndent = lines[i - 1].indent + lines[i - 1].content.length - item.length;
        let end = i;
        while (end < lines.length && lines[end].indent > indent) end++;
        const block = [{ ...lines[i - 1], indent: itemIndent, content: item }, ...lines.slice(i, end)];
        const [value, consumed] = parseBlock(block, 0, itemIndent, here, limits);
        if (consumed < block.length) {
          throw new Error(`Unexpected indentation on line ${block[consumed].lineNumber}`);
        }
        list.push(value);
        i = end;
      } else if (splitKey(item)) {
        const [key, raw] = splitKey(item);
        checkDepth(here.length + 1, { path: here, maxDepth: limits.maxDepth });
        checkedKey(key, here);
        list.push({ [key]: scalar(raw, [...here, key]) });
      } else {
        list.push(scalar(item, here));
      }
    }
    return [list, i];
  }

  const map = {};
  let i = start;
  while (i < lines.length && lines[i].indent >= indent) {
    if (lines[i].indent > indent) {
      throw new Error(`Unexpected indentation on line ${lines[i].lineNumber}`);
    }
    const pair = splitKey(lines[i].content);
    if (!pair) throw new Error(`Cannot parse line ${lines[i].lineNumber}: "${lines[i].content}"`);
    const key = checkedKey(pair[0], path);
    const raw = pair[1];
    i++;
    if (raw === '') {
      if (i < lines.length && lines[i].indent > indent) {
        const [value, next] = parseBlock(lines, i, lines[i].indent, [...path, key], limits);
        map[key] = value;
        i = next;
      } else {
        map[key] = null;
      }
    } else {
      map[key] = scalar(raw, [...path, key]);
    }
  }
  return [map, i];
}

/**
 * Writes `value` as YAML that parseYaml reads back as the same value: maps,
 * lists of scalars and lists of maps, every string quoted. Used to turn a
 * league file's declared settings back into a league folder's config files
 * (src/leagueFile.mjs).
 *
 * The subset is parseYaml's, so anything it cannot read back is refused rather
 * than written wrong: a string holding a line break or both kinds of quote, a
 * number written with an exponent, a list inside a list. An empty map or list
 * is written as an empty value, which reads back as null.
 */
export function stringifyYaml(value) {
  if (!isMap(value)) throw new TypeError('stringifyYaml writes a map at the top level');
  const lines = mapLines(value, 0, []);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isEmpty = (value) => (Array.isArray(value) ? value.length === 0 : isMap(value) && Object.keys(value).length === 0);

function yamlField(path) {
  return path.length ? path.join('.') : 'the top level';
}

function yamlQuoted(text, path) {
  if (/[\r\n]/.test(text)) throw new Error(`${yamlField(path)}: a line break cannot be written to this YAML`);
  if (!text.includes('"')) return `"${text}"`;
  if (!text.includes("'")) return `'${text}'`;
  throw new Error(`${yamlField(path)}: a text holding both kinds of quote cannot be written to this YAML`);
}

function yamlScalar(value, path) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    const text = String(value);
    if (!/^-?\d+$/.test(text) && !/^-?\d*\.\d+$/.test(text)) {
      throw new Error(`${yamlField(path)}: the number ${text} cannot be written to this YAML`);
    }
    return text;
  }
  if (typeof value === 'string') return yamlQuoted(value, path);
  throw new Error(`${yamlField(path)}: a ${typeof value} cannot be written to YAML`);
}

function yamlKey(key, path) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(key) ? key : yamlQuoted(key, path);
}

/** A map's lines at `indent`; the first may be prefixed by the caller (a list's dash). */
function mapLines(map, indent, path) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(map)) {
    const here = [...path, key];
    const head = `${pad}${yamlKey(key, here)}:`;
    if (Array.isArray(value) && value.length) {
      lines.push(head, ...listLines(value, indent + 2, here));
    } else if (isMap(value) && !isEmpty(value)) {
      lines.push(head, ...mapLines(value, indent + 2, here));
    } else if (isEmpty(value)) {
      lines.push(head);
    } else {
      lines.push(`${head} ${yamlScalar(value, here)}`);
    }
  }
  return lines;
}

function listLines(list, indent, path) {
  const pad = ' '.repeat(indent);
  const lines = [];
  list.forEach((item, index) => {
    const here = [...path, index];
    if (Array.isArray(item)) throw new Error(`${yamlField(here)}: a list inside a list cannot be written to this YAML`);
    if (isMap(item) && !isEmpty(item)) {
      // `- first: value`, then the rest of the map lined up under `first`.
      const [first, ...rest] = mapLines(item, indent + 2, here);
      lines.push(`${pad}- ${first.slice(indent + 2)}`, ...rest);
    } else if (isEmpty(item)) {
      throw new Error(`${yamlField(here)}: an empty map or list inside a list cannot be written to this YAML`);
    } else {
      lines.push(`${pad}- ${yamlScalar(item, here)}`);
    }
  });
  return lines;
}

/**
 * Parses `source`. `limits` defaults to CONFIG_LIMITS (src/lib/safeInput.mjs).
 * A refusal is an UnsafeInputError naming the field; the caller puts the
 * file's name in front of it.
 */
export function parseYaml(source, { limits = CONFIG_LIMITS } = {}) {
  const text = source ?? '';
  checkSize(text, { maxBytes: limits.maxBytes });
  const lines = toLines(text);
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent, [], limits);
  return value;
}
