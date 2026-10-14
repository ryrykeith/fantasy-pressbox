/**
 * Reads the text of a .env file. No dependency on dotenv, and nothing from
 * `node:`, so the browser can read a league folder's .env the same way the
 * command line does (src/leagueFile.mjs). Reading the file from disk is
 * src/lib/env.mjs.
 *
 * Supports `KEY=value`, `export KEY=value`, `#` comments, blank lines and
 * optionally quoted values.
 */

/** A line's key, or null for a blank line, a comment or a line that is not `KEY=value`. */
export function envLineKey(line) {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return match ? match[1] : null;
}

/** One `KEY=value` line as `[key, value]`, or null when the line is not one. */
export function parseEnvLine(line) {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
  if (!match) return null;
  let value = match[2].trim();
  const quoted = /^"(.*)"$/s.exec(value) || /^'(.*)'$/s.exec(value);
  if (quoted) {
    value = quoted[1];
  } else {
    // Only strip comments from unquoted values, so URLs with # survive quotes.
    value = value.replace(/\s+#.*$/, '').trim();
  }
  return [match[1], value];
}

/** Every `KEY=value` line of a .env file's text, as a plain object. A later line wins. */
export function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const pair = parseEnvLine(line);
    if (pair) values[pair[0]] = pair[1];
  }
  return values;
}

/**
 * Only the `allowed` keys of a .env file's text. Every other line is dropped
 * as it is read, before its value is looked at, so a secret on it is never
 * held: what comes back is `{ values, ignored }`, where `ignored` lists the
 * names of the keys dropped (never their values), in file order, once each.
 */
export function parseEnvAllowlist(source, allowed) {
  const keep = new Set(allowed);
  const values = {};
  const ignored = [];
  for (const line of source.split(/\r?\n/)) {
    const key = envLineKey(line);
    if (key === null || line.trim().startsWith('#')) continue;
    if (!keep.has(key)) {
      if (!ignored.includes(key)) ignored.push(key);
      continue;
    }
    const pair = parseEnvLine(line);
    if (pair) values[pair[0]] = pair[1];
  }
  return { values, ignored };
}
