/**
 * The file back end of the store: data/<kind>/<season>/<file>.json under a
 * league folder, which is what the CLI uses. The methods, the layout and the
 * in-memory back end are in src/storeCore.mjs; the ranking and grading helpers
 * are in src/rankingGrades.mjs.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createStoreOver } from './storeCore.mjs';

export function createStore({ dataDir }) {
  const pathFor = (kind, season, file) => join(dataDir, kind, String(season), file);

  const store = createStoreOver({
    read(kind, season, file) {
      const path = pathFor(kind, season, file);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, 'utf8'));
    },
    write(kind, season, file, value) {
      const path = pathFor(kind, season, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
      return path;
    },
    list(kind, season) {
      const dir = join(dataDir, kind, String(season));
      return existsSync(dir) ? readdirSync(dir) : [];
    },
    seasons(kind) {
      const dir = join(dataDir, kind);
      return existsSync(dir) ? readdirSync(dir) : [];
    },
    locate: pathFor,
  });

  return Object.assign(store, { dataDir });
}
