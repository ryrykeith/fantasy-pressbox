/**
 * Reads a .env file into a plain object. No dependency on dotenv.
 *
 * Supports `KEY=value`, `export KEY=value`, `#` comments, blank lines and
 * optionally quoted values. Values already present in the real environment
 * win, so `SLEEPER_LEAGUE_ID=... npx fantasy-pressbox` overrides the file.
 */
import { readFileSync, existsSync } from 'node:fs';

export function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = /^"(.*)"$/s.exec(value) || /^'(.*)'$/s.exec(value);
    if (quoted) {
      value = quoted[1];
    } else {
      // Only strip comments from unquoted values, so URLs with # survive quotes.
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[match[1]] = value;
  }
  return values;
}

export function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, 'utf8'));
}

/** File values are applied to process.env without clobbering real env vars. */
export function applyEnvFile(path) {
  const values = loadEnvFile(path);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  return values;
}
