/**
 * Reads a .env file from disk into a plain object. No dependency on dotenv.
 * The parsing itself is src/lib/envText.mjs, which the browser can load too.
 *
 * Values already present in the real environment win, so
 * `SLEEPER_LEAGUE_ID=... npx fantasy-pressbox` overrides the file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from './envText.mjs';

export { parseEnv };

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
