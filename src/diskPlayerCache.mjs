/**
 * The CLI's playerCache: one JSON file per key under <dataDir>/cache.
 *
 * `savedAt` is the file's mtime, so the one-day rule (src/playerCache.mjs)
 * sees the same age the clients always did. An unreadable file reads as no
 * entry: it is fetched again.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createDiskPlayerCache({ dataDir }) {
  const cacheDir = join(dataDir, 'cache');
  const pathOf = (key) => join(cacheDir, `${key}.json`);
  return {
    async get(key) {
      const path = pathOf(key);
      if (!existsSync(path)) return null;
      try {
        return { value: JSON.parse(readFileSync(path, 'utf8')), savedAt: statSync(path).mtimeMs };
      } catch {
        return null;
      }
    },
    async set(key, value) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(pathOf(key), JSON.stringify(value));
    },
  };
}
