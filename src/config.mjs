/**
 * One place that knows where settings come from.
 *
 * Precedence, highest first:
 *   1. command-line flags        (--week 3)
 *   2. real environment variables
 *   3. .env
 *   4. config/*.yml
 *   5. the defaults in src/settings.mjs
 *
 * This is the CLI half of the settings layer: it reads .env, the YAML files and
 * the process, then hands plain objects to `resolveSettings`
 * (src/settings.mjs), which holds the defaults, the merging and the checks and
 * touches no disk.
 *
 * Nothing about a specific league belongs in this file. League identity lives
 * in .env; editorial behaviour lives in config/.
 *
 * Two roots, never confused:
 *
 *   PACKAGE_ROOT    where the code lives, and with it the shipped assets:
 *                   prompts/, the config/editorial.yml and config/rankings.yml
 *                   defaults, the config/bye-weeks.<season>.yml tables, and
 *                   the empty templates. Read-only at run time — once the
 *                   package is installed it sits under node_modules, and
 *                   nothing may be written there.
 *
 *   workspace root  one league's folder: its .env, its own config/
 *                   (rookie-draft.yml, guillotine.yml, prospects.<year>.yml),
 *                   and the data/ and output/ every write goes to. Chosen by
 *                   resolveWorkspaceRoot with the same precedence as above:
 *                   --workspace, then PRESSBOX_WORKSPACE, then the working
 *                   directory. It cannot come from .env, because .env is in it.
 *
 * Run from a checkout's own folder the two are the same directory, which is
 * how a cloned repository covering one league keeps working unchanged.
 */
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml.mjs';
import { environmentWithFile } from './lib/env.mjs';
import { parseDeclaredFormatType } from './format.mjs';
import { providerDisplayName } from './providers.mjs';
import { loadAssets } from './assets.mjs';
import { createDiskPlayerCache } from './diskPlayerCache.mjs';
import { parseProspectBoard } from './prospectBoard.mjs';
import { firstSet, leagueSettingsFromEnv, mergeSettingsLayer, resolveSettings } from './settings.mjs';

// The pure half moved to src/settings.mjs. Re-exported so existing importers
// of config.mjs keep working; new code that has no business with the disk
// imports settings.mjs directly.
export {
  DEFAULT_ESPN_ROUTE,
  ESPN_ROUTE_KEY,
  ESPN_ROUTES,
  LEAGUE_ID_KEYS,
  LEAGUE_PROVIDER_KEY,
  parseEspnRoute,
  parseLeagueProvider,
  rankEmoji,
  rankEmojiOf,
  resolveFutureStockWeights,
  resolveRankingChoice,
  resolveRankingWeights,
  resolveStrengthChoice,
  resolveSettings,
  validateRankingWeights,
} from './settings.mjs';

/** The package's own directory: code and shipped assets. Read-only at run time. */
export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** The environment variable that names a league's workspace folder. */
export const WORKSPACE_ENV_VAR = 'PRESSBOX_WORKSPACE';

/**
 * The league folder this run reads its .env and league config from, and writes
 * its data and output into.
 *
 * `flag` (--workspace) wins, then the environment variable, then `cwd`. A
 * relative path is taken from `cwd`. A named folder that does not exist is
 * refused rather than created: a typo would otherwise start a fresh, empty
 * league history somewhere nobody meant, with nothing saying so. `create` is
 * for init alone, whose job is to make the folder it is pointed at.
 */
export function resolveWorkspaceRoot({ flag, env = process.env, cwd = process.cwd(), create = false } = {}) {
  const fromEnv = (env[WORKSPACE_ENV_VAR] ?? '').trim();
  let chosen = null;
  let source = null;
  if (flag !== undefined && flag !== null) [chosen, source] = [flag, '--workspace'];
  else if (fromEnv) [chosen, source] = [fromEnv, WORKSPACE_ENV_VAR];
  if (chosen === null) return resolve(cwd);

  const path = resolve(cwd, chosen);
  if (create) mkdirSync(path, { recursive: true });
  if (!existsSync(path)) {
    throw new Error(`The workspace folder ${path} (from ${source} ${chosen}) does not exist.`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`The workspace ${path} (from ${source} ${chosen}) is not a folder.`);
  }
  return path;
}

/** The workspace's own config folder: the league's rookie-draft, guillotine and prospect files. */
export function workspaceConfigDir(workspaceRoot) {
  return join(workspaceRoot, 'config');
}

/** The workspace's optional prompts folder: files in it shadow the shipped prompts of the same name. */
export function workspacePromptsDir(workspaceRoot) {
  return join(workspaceRoot, 'prompts');
}

/**
 * True when the workspace IS the package folder, as in a clone run from its own
 * root. There is then nothing to override: the "workspace copy" of a file would
 * be the shipped file read a second time, and doctor would report every shipped
 * file as a local override.
 */
export function workspaceIsPackage(workspaceRoot) {
  return realpathSync(workspaceRoot) === realpathSync(PACKAGE_ROOT);
}

/**
 * The CLI's `readText` for `loadAssets` (src/assets.mjs): a package file's
 * text from the disk, or null when there is none.
 *
 * `promptsDir` is the workspace's own prompts folder. A file in it shadows the
 * shipped prompt of the same name and the rest still come from the package, so
 * a workspace override wins here and nowhere else needs to know about it.
 * `packageFiles` redirects named package paths to other files, for the callers
 * that point loadConfig at a different editorial.yml or rankings.yml.
 */
export function diskReadText({ promptsDir = null, packageFiles = {} } = {}) {
  return (path) => {
    if (promptsDir && path.startsWith('prompts/')) {
      const local = join(promptsDir, path.slice('prompts/'.length));
      if (existsSync(local)) {
        const text = readFileSync(local, 'utf8');
        // Said here, where the override's own path is known: past this point
        // it is only 'prompts/<file>'.
        if (!text.trim()) throw new Error(`Prompt file ${local} is empty.`);
        return text;
      }
    }
    const file = packageFiles[path] ?? join(PACKAGE_ROOT, path);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  };
}

/** The shipped assets, with `promptsDir`'s workspace prompts shadowing the shipped ones. */
export function loadDiskAssets({ promptsDir = null } = {}) {
  return loadAssets(diskReadText({ promptsDir }));
}

/**
 * Lists the workspace's prompt overrides against the shipped prompts.
 *
 * `overridden` are workspace files that shadow a shipped prompt of the same
 * name; `unmatched` are workspace .md files that shadow nothing — nearly always
 * a misspelt name, which would otherwise fail silently by never being read.
 */
export function describePromptOverrides(promptsDir) {
  if (!promptsDir) return { overridden: [], unmatched: [] };
  const shipped = new Set(readdirSync(join(PACKAGE_ROOT, 'prompts')));
  const local = readdirSync(promptsDir).filter((file) => file.endsWith('.md')).sort();
  return {
    overridden: local.filter((file) => shipped.has(file)),
    unmatched: local.filter((file) => !shipped.has(file)),
  };
}

/**
 * Reads a YAML file over `fallback`, with `replaceKeys` tables replaced rather
 * than merged (see `mergeSettingsLayer` in src/settings.mjs). A missing file
 * returns `fallback` untouched.
 */
export function readYamlFile(path, fallback, { replaceKeys = [] } = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return mergeSettingsLayer(fallback, parseYaml(readFileSync(path, 'utf8')), { replaceKeys });
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

/** A YAML file's parsed contents, or undefined when there is no such file. */
function readYamlLayer(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

/**
 * `config.league`: `{ provider, id, season, route, secrets }`, from .env.
 *
 * This is where the ESPN cookies are read, and the only place: they never go
 * through `resolveSettings`.
 */
function readLeagueSettings(env) {
  const { provider, id, season, route } = leagueSettingsFromEnv(env);
  // Sleeper's API is public: there is nothing secret to hold. ESPN's cookies
  // are read only on the fetch route: under import they are never read, even
  // when set. They live here and are never copied into process.env.
  const secrets = {};
  if (provider === 'espn' && route === 'fetch') {
    const s2 = firstSet(env, ['ESPN_S2']);
    const swid = firstSet(env, ['ESPN_SWID']);
    if ((s2 === null) !== (swid === null)) {
      throw new Error(
        `ESPN_ROUTE=fetch needs both cookies or neither, and ${s2 === null ? 'ESPN_S2' : 'ESPN_SWID'} is missing. ` +
          'Add it to .env for a private league, or remove the other for a public one.',
      );
    }
    if (s2 !== null) {
      secrets.ESPN_S2 = s2;
      secrets.ESPN_SWID = swid;
    }
  }
  return { provider, id, season, route, secrets };
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

/**
 * The editorial knobs .env may set, as a settings layer for `resolveSettings`.
 * The generic POST_MAX_LENGTH wins over SLEEPER_POST_MAX_LENGTH.
 */
function editorialOverridesFromEnv(env) {
  const editorial = {};
  if (env.PRESSBOX_TONE) editorial.tone = env.PRESSBOX_TONE;
  const output = {};
  const postMaxLength = firstSet(env, ['POST_MAX_LENGTH', 'SLEEPER_POST_MAX_LENGTH']);
  if (postMaxLength) output.sleeper_max_chars = Number.parseInt(postMaxLength, 10);
  if (env.INCLUDE_EMOJI !== undefined && env.INCLUDE_EMOJI !== '') output.include_emoji = bool(env.INCLUDE_EMOJI);
  if (Object.keys(output).length) editorial.output = output;
  return { editorial };
}

/**
 * Loads a run's settings for the league in `workspaceRoot`.
 *
 * League-specific files (.env, rookie-draft.yml, guillotine.yml) are read from
 * the workspace only. The editorial and ranking defaults are read from the
 * package, then a workspace config/editorial.yml or rankings.yml is layered on
 * top; a workspace prompts/ folder is returned as `promptsDir`. data/ and output/ default
 * into the workspace, and a relative DATA_DIR or OUTPUT_DIR is taken from it
 * too, so a league folder means the same thing whichever shell runs it.
 *
 * The files are read here; merging and validation are `resolveSettings`.
 */
export function loadConfig({
  workspaceRoot = resolveWorkspaceRoot(),
  envPath = join(workspaceRoot, '.env'),
  rankingsPath = join(PACKAGE_ROOT, 'config', 'rankings.yml'),
  editorialPath = join(PACKAGE_ROOT, 'config', 'editorial.yml'),
  guillotinePath = join(workspaceConfigDir(workspaceRoot), 'guillotine.yml'),
  rookieDraftPath = join(workspaceConfigDir(workspaceRoot), 'rookie-draft.yml'),
  workspaceEditorialPath = join(workspaceConfigDir(workspaceRoot), 'editorial.yml'),
  workspaceRankingsPath = join(workspaceConfigDir(workspaceRoot), 'rankings.yml'),
  workspacePromptsPath = workspacePromptsDir(workspaceRoot),
} = {}) {
  const env = environmentWithFile(envPath);

  // A workspace that is the package folder has no layer of its own.
  const own = !workspaceIsPackage(workspaceRoot);
  const editorialOverride = own && existsSync(workspaceEditorialPath) ? workspaceEditorialPath : null;
  const rankingsOverride = own && existsSync(workspaceRankingsPath) ? workspaceRankingsPath : null;
  const promptsDir = own && existsSync(workspacePromptsPath) ? workspacePromptsPath : null;

  const defaults = loadAssets(
    diskReadText({ packageFiles: { 'config/editorial.yml': editorialPath, 'config/rankings.yml': rankingsPath } }),
  ).defaultConfig();

  const settings = resolveSettings({
    defaults,
    league: {
      editorial: readYamlLayer(editorialOverride),
      rankings: readYamlLayer(rankingsOverride),
      guillotine: readYamlLayer(guillotinePath),
      rookieDraft: readYamlLayer(rookieDraftPath),
    },
    // .env may override the editorial knobs a beginner is most likely to want.
    overrides: editorialOverridesFromEnv(env),
    sources: {
      defaults: { editorial: editorialPath, rankings: rankingsPath },
      league: {
        editorial: editorialOverride,
        rankings: rankingsOverride,
        guillotine: guillotinePath,
        rookieDraft: rookieDraftPath,
      },
    },
  });

  // Which platform the league is on, and which league. Refused here, before
  // any command runs, when the .env cannot say.
  const league = readLeagueSettings(env);
  const dataDir = resolve(workspaceRoot, env.DATA_DIR || 'data');

  return {
    workspaceRoot,
    // Which workspace files were read (null: absent, so the shipped default or
    // built-in applied). doctor reports these so a confusing output can be
    // traced to a local file.
    sources: {
      env: existsSync(envPath) ? envPath : null,
      rookieDraft: existsSync(rookieDraftPath) ? rookieDraftPath : null,
      guillotine: existsSync(guillotinePath) ? guillotinePath : null,
      editorialOverride,
      rankingsOverride,
    },
    // The workspace prompts folder, or null when there is none to consult.
    promptsDir,
    // { provider, id, season, route, secrets }. Secrets stay here: nothing copies
    // them into process.env.
    league,
    // Aliases of config.league, until every reader has moved to it.
    leagueId: league.id,
    season: league.season,
    week: env.FANTASY_WEEK ? Number.parseInt(env.FANTASY_WEEK, 10) : null,
    leagueDisplayName: env.LEAGUE_DISPLAY_NAME || null,
    // What kind of league this is, if the operator said. Null means "work it
    // out from Sleeper"; a misspelling throws here, before any command runs.
    leagueFormat: parseDeclaredFormatType(env.LEAGUE_FORMAT, { provider: providerDisplayName(league.provider) }),
    ai: {
      provider: (env.AI_PROVIDER || '').trim().toLowerCase() || null,
      anthropicKey: (env.ANTHROPIC_API_KEY || '').trim(),
      openaiKey: (env.OPENAI_API_KEY || '').trim(),
      model: (env.AI_MODEL || env.OPENAI_MODEL || '').trim(),
    },
    dataDir,
    // Where the player list is kept between runs: data/cache, a day at most.
    playerCache: createDiskPlayerCache({ dataDir }),
    outputDir: resolve(workspaceRoot, env.OUTPUT_DIR || 'output'),
    debug: bool(env.DEBUG, false),
    editorial: settings.editorial,
    // { mode: 'default' | 'custom' | 'none', table }, and the shipped table `--emoji default` puts back.
    rankEmoji: settings.rankEmoji,
    defaultRankEmojiTable: settings.defaultRankEmojiTable,
    rankings: settings.rankings,
    // Settings that only mean anything in a guillotine league. Kept in their
    // own sub-object so nothing reaches for `config.eliminations` in a format
    // where no team is ever eliminated.
    guillotine: settings.guillotine,
    // How the rookie draft is ordered, if declared. Null means undeclared, and
    // no draft order can be projected (requireDraftOrderRule). The tank
    // watch's start week is null unless declared, meaning the regular
    // season's midpoint (src/tankWatch.mjs#resolveTankWatchStartWeek).
    rookieDraft: settings.rookieDraft,
  };
}

// A season's bye-week table is `assets.byeWeekTable(season)` (src/assets.mjs).
// There is no honest fallback for a missing one: "no table found" cannot
// default to "nobody has a bye", so a season without its table is refused,
// naming the generator that produces it.

/**
 * Reads and validates the declared prospect board for a draft class
 * (src/prospectBoard.mjs).
 *
 * Returns null when no file is declared: an absent board is a state editions
 * handle (the model is told no prospect may be discussed), not an error. An
 * invalid one throws, naming the file. Season-specific, so not part of
 * `loadConfig()` — the draft year is known only once a league has been opened.
 *
 * `configDir` is required: the workspace's config folder. There is
 * deliberately no package fallback, because a board is one operator's sourced
 * opinion and the package ships only config/prospects.example.yml.
 */
export function loadProspectBoard({ draftYear, configDir } = {}) {
  if (!configDir) {
    throw new Error(
      "loadProspectBoard needs configDir, the workspace's config folder: a board is never read from the package.",
    );
  }
  const path = join(configDir, `prospects.${draftYear}.yml`);
  if (!existsSync(path)) return null;

  let parsed;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
  return parseProspectBoard(parsed, { draftYear, source: path });
}
