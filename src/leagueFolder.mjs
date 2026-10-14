/**
 * The disk half of the league file (src/leagueFile.mjs): reading a league
 * folder's files for export-league, and writing a league file's folder for
 * import-league. The mapping itself — what is read, what is dropped, what is
 * written — is leagueFile.mjs, which the website shares.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { readsLeagueFolderPath } from './leagueFile.mjs';

/** A path relative to the league folder, with forward slashes whatever the platform. */
const folderPath = (root, path) => relative(root, path).split(sep).join('/');

/** Every file under `dir`, as full paths, without descending into `skip` (full paths). */
function filesUnder(dir, skip) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.includes(path)) out.push(`${path}${sep}`);
      else out.push(...filesUnder(path, skip));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The files a league file is built from, read from a league folder:
 * `{ entries, unread }`. `entries` are `{ path, text }` pairs, with paths as
 * leagueFileFromWorkspace takes them; only the files it reads are opened.
 * `unread` lists the other files under config/ and the data folder, which
 * were not opened (data/cache/ as one entry).
 *
 * `dataDir` is the folder's data folder (DATA_DIR), listed as data/ whatever
 * it is called. `fromPackage`: the folder is the package itself, whose
 * config/editorial.yml and rankings.yml are the shipped defaults rather than
 * the league's own, so they are left out.
 */
export function readLeagueFolder({ workspaceRoot, dataDir, fromPackage = false }) {
  const entries = [];
  const unread = [];
  const consider = (path, full) => {
    if (fromPackage && (path === 'config/editorial.yml' || path === 'config/rankings.yml')) unread.push(path);
    else if (readsLeagueFolderPath(path)) entries.push({ path, text: readFileSync(full, 'utf8') });
    else unread.push(path);
  };

  const env = join(workspaceRoot, '.env');
  if (existsSync(env)) consider('.env', env);
  for (const full of filesUnder(join(workspaceRoot, 'config'), [])) consider(folderPath(workspaceRoot, full), full);
  for (const full of filesUnder(dataDir, [join(dataDir, 'cache')])) {
    const path = `data/${folderPath(dataDir, full)}`;
    if (full.endsWith(sep)) unread.push(path.replace(/\/?$/, '/'));
    else consider(path, full);
  }
  return { entries, unread: unread.sort() };
}

/**
 * Writes a league file's folder (workspaceFromLeagueFile's entries) into
 * `workspaceRoot`. Refused, before anything is written, when any of those
 * files already exists there: an import never writes over a league's
 * history or settings. The .env goes last, so a folder whose import failed
 * part way is not mistaken for a league folder.
 *
 * → the full paths written, in order.
 */
export function writeLeagueFolder({ workspaceRoot, entries }) {
  const target = (path) => join(workspaceRoot, ...path.split('/'));
  const present = entries.filter(({ path }) => existsSync(target(path))).map(({ path }) => path);
  if (present.length) {
    const listed = present.slice(0, 5).join(', ') + (present.length > 5 ? `, and ${present.length - 5} more` : '');
    throw new Error(
      `${workspaceRoot} already holds ${listed}. An import never writes over a league's files: ` +
        'import into a new or empty folder with --workspace <folder>.',
    );
  }
  const ordered = [...entries.filter(({ path }) => path !== '.env'), ...entries.filter(({ path }) => path === '.env')];
  const written = [];
  for (const { path, text } of ordered) {
    const full = target(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, { flag: 'wx' });
    written.push(full);
  }
  return written;
}
