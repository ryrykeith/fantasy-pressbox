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

/**
 * The environment one league's run sees: the file's values, under any real
 * environment variable that is set and not empty.
 *
 * Returned rather than written into process.env. Writing them there made the
 * first .env loaded in a process part of the "real environment" for every
 * later load, so a second league loaded in the same process silently kept the
 * first league's ID — and league settings must never leak between workspaces.
 */
export function environmentWithFile(path, env = process.env) {
  const merged = { ...loadEnvFile(path) };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return merged;
}
