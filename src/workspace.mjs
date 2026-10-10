/**
 * What makes a folder a league workspace, and how one is copied to another.
 *
 * A workspace is one league's folder (src/config.mjs explains the two roots).
 * Its .env is what marks it: that file names the league, so a folder without
 * one is not a league's folder, however much else is in it. Every command that
 * reads or writes a league refuses to run outside one — a recap run in the
 * wrong directory would otherwise start a second, empty history there, or,
 * with SLEEPER_LEAGUE_ID exported in the shell, write one league's snapshots
 * into whatever folder happened to be current.
 *
 * Paths only. Which folder is the package is src/config.mjs's business; the
 * caller says so with `fromPackage`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseYaml } from './lib/yaml.mjs';

/** The file that marks a folder as a league workspace. */
export const WORKSPACE_MARKER = '.env';

/** True when `root` is a league's folder: it holds the league's .env. */
export function isLeagueWorkspace(root) {
  const marker = join(root, WORKSPACE_MARKER);
  return existsSync(marker) && statSync(marker).isFile();
}

/**
 * Refuses to go on outside a league workspace, naming init as the fix.
 *
 * `initCommand` is the command line that runs init, supplied by the caller
 * because only the CLI knows how it was invoked.
 */
export function requireLeagueWorkspace(root, { initCommand }) {
  if (isLeagueWorkspace(root)) return;
  throw new Error(
    `${root} is not a league folder: it has no ${WORKSPACE_MARKER} file.\n` +
      `Run init to set one up there: ${initCommand}\n` +
      'Or point at an existing league folder with --workspace <folder>.',
  );
}

/** True when `child` is `parent` or somewhere below it. */
function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** The nearest existing folder at or above `path`, resolved through symlinks. */
function realExistingAncestor(path) {
  let at = resolve(path);
  while (!existsSync(at)) at = dirname(at);
  return realpathSync(at);
}

/**
 * The league files under config/ that belong to a workspace.
 *
 * The rookie draft rule and the guillotine ledger when they declare something
 * (or always, from a workspace), every prospect board — but
 * never prospects.example.yml, which is the package's example, nor the
 * bye-week tables, which are NFL schedule data the package ships for everyone.
 * A workspace's editorial.yml and rankings.yml are overrides of the shipped
 * defaults, so they travel too, except when the source is the package itself:
 * there they ARE the shipped defaults, and copying them would freeze today's
 * defaults into the new folder as if the operator had written them.
 */
function leagueConfigFiles(configDir, { fromPackage }) {
  if (!existsSync(configDir)) return [];
  const overrides = fromPackage ? [] : ['editorial.yml', 'rankings.yml'];
  return readdirSync(configDir)
    .filter((file) => {
      if (TEMPLATE_FILES.includes(file)) {
        // The package ships these as empty templates. Copied from there, one
        // that declares nothing is the template, not the league's setting.
        return !fromPackage || declaresAnything(parseYaml(readFileSync(join(configDir, file), 'utf8')));
      }
      return /^prospects\.\d{4}\.yml$/.test(file) || overrides.includes(file);
    })
    .sort();
}

/** League config files the package also ships, as empty templates. */
const TEMPLATE_FILES = ['rookie-draft.yml', 'guillotine.yml'];

/** True when a parsed config file sets at least one value: comments and empty keys are not a declaration. */
function declaresAnything(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(declaresAnything);
  if (typeof value === 'object') return Object.values(value).some(declaresAnything);
  return true;
}

/**
 * Copies one league's workspace into a new folder. Copies only: nothing in
 * `source` is moved, changed or deleted, so the operator can check the new
 * folder before removing the old one by hand.
 *
 * Carries the .env, the league's config files (above), a workspace's prompt
 * overrides, and the whole of `dataDir` and `outputDir` — the rankings that
 * movement is measured against, the snapshots that resolve a renamed team, the
 * predictions, tank-watch projections, market snapshots and the player cache.
 * Each lands at the same place relative to the new folder, so a relative
 * DATA_DIR or OUTPUT_DIR in the copied .env means the same thing there.
 *
 * Refused, before anything is written:
 *   - a destination that already holds anything: a copy over an existing
 *     league would mix two histories, which snapshots must never do;
 *   - a destination inside the source or around it, which would copy a folder
 *     into itself;
 *   - a data or output folder outside the source (an absolute DATA_DIR): the
 *     copied .env would still point at it, and both folders would write one
 *     history.
 *
 * Returns what was copied, as `{ what, from, to }`, in the order copied.
 */
export function copyLeagueWorkspace({ source, destination, dataDir, outputDir, fromPackage = false }) {
  const from = realpathSync(source);
  const to = resolve(destination);
  const toReal = realExistingAncestor(to);

  if (isInside(from, toReal) || (existsSync(to) && isInside(realpathSync(to), from))) {
    throw new Error(`Cannot copy ${from} into ${to}: one folder is inside the other.`);
  }
  if (existsSync(to)) {
    if (!statSync(to).isDirectory()) throw new Error(`${to} exists and is not a folder.`);
    if (readdirSync(to).length) {
      throw new Error(`${to} is not empty. Copy the league into a new or empty folder, so no history is mixed.`);
    }
  }
  if (!isLeagueWorkspace(from)) {
    throw new Error(`${from} is not a league folder: it has no ${WORKSPACE_MARKER} file, so there is no league to copy.`);
  }

  const relativeTo = (path, setting) => {
    const real = existsSync(path) ? realpathSync(path) : resolve(path);
    if (!isInside(from, real)) {
      throw new Error(
        `${setting} points outside the league folder (${path}), so the copied .env would share it with this one. ` +
          `Clear ${setting} in ${join(from, WORKSPACE_MARKER)}, or move that folder inside it, and copy again.`,
      );
    }
    return relative(from, real);
  };
  const dataRel = relativeTo(dataDir, 'DATA_DIR');
  const outputRel = relativeTo(outputDir, 'OUTPUT_DIR');

  const items = [{ what: '.env', rel: WORKSPACE_MARKER }];
  for (const file of leagueConfigFiles(join(from, 'config'), { fromPackage })) {
    items.push({ what: `config/${file}`, rel: join('config', file) });
  }
  if (!fromPackage) items.push({ what: 'prompts/', rel: 'prompts' });
  items.push({ what: 'data/', rel: dataRel }, { what: 'output/', rel: outputRel });

  mkdirSync(to, { recursive: true });
  const copied = [];
  for (const { what, rel } of items) {
    const path = join(from, rel);
    if (!existsSync(path)) continue;
    const target = join(to, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(path, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    copied.push({ what, from: path, to: target });
  }
  return copied;
}
