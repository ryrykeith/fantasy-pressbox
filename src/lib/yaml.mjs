/**
 * A deliberately small YAML reader.
 *
 * Fantasy Pressbox ships with zero npm dependencies so that setup is just
 * "install Node". That means we parse our own config files. We only support
 * the subset of YAML the files under config/ actually use:
 *
 *   - nested maps, by indentation
 *   - lists of scalars and lists of single-line maps
 *   - strings, numbers, booleans, null
 *   - `#` comments and blank lines
 *
 * Anchors, multi-line strings, flow syntax and multiple documents are not
 * supported. If a config file needs them, the file is doing too much.
 */

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

function parseBlock(lines, start, indent) {
  // A block is a list if its first line starts with "- ", otherwise a map.
  if (lines[start].content.startsWith('- ') || lines[start].content === '-') {
    const list = [];
    let i = start;
    while (i < lines.length && lines[i].indent >= indent) {
      if (lines[i].indent > indent) {
        throw new Error(`Unexpected indentation on line ${lines[i].lineNumber}`);
      }
      const item = lines[i].content.replace(/^-\s*/, '');
      i++;
      const hasChildren = i < lines.length && lines[i].indent > indent;
      if (item === '') {
        if (!hasChildren) throw new Error(`Empty list item on line ${lines[i - 1].lineNumber}`);
        const [value, next] = parseBlock(lines, i, lines[i].indent);
        list.push(value);
        i = next;
      } else if (splitKey(item)) {
        const [key, raw] = splitKey(item);
        list.push({ [key]: parseScalar(raw) });
      } else {
        list.push(parseScalar(item));
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
    const [key, raw] = pair;
    i++;
    if (raw === '') {
      if (i < lines.length && lines[i].indent > indent) {
        const [value, next] = parseBlock(lines, i, lines[i].indent);
        map[key] = value;
        i = next;
      } else {
        map[key] = null;
      }
    } else {
      map[key] = parseScalar(raw);
    }
  }
  return [map, i];
}

export function parseYaml(source) {
  const lines = toLines(source ?? '');
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent);
  return value;
}
