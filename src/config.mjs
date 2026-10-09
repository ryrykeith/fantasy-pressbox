/**
 * One place that knows where settings come from.
 *
 * Precedence, highest first:
 *   1. command-line flags        (--week 3)
 *   2. real environment variables
 *   3. .env
 *   4. config/*.yml
 *   5. the defaults below
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
import { readFileSync, existsSync, statSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml.mjs';
import { applyEnvFile } from './lib/env.mjs';
import { parseDeclaredFormatType } from './format.mjs';
import { parseDeclaredEliminations } from './analysis/elimination.mjs';
import { byeWeekTableSource, parseByeWeekTable } from './analysis/byeExposure.mjs';
import { parseDeclaredDraftOrder, parseDeclaredRoundOrder } from './rookieDraft.mjs';
import { parseProspectBoard } from './prospectBoard.mjs';
import { parseTankWatchStartWeek } from './tankWatch.mjs';

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
 * league history somewhere nobody meant, with nothing saying so.
 */
export function resolveWorkspaceRoot({ flag, env = process.env, cwd = process.cwd() } = {}) {
  const fromEnv = (env[WORKSPACE_ENV_VAR] ?? '').trim();
  let chosen = null;
  let source = null;
  if (flag !== undefined && flag !== null) [chosen, source] = [flag, '--workspace'];
  else if (fromEnv) [chosen, source] = [fromEnv, WORKSPACE_ENV_VAR];
  if (chosen === null) return resolve(cwd);

  const path = resolve(cwd, chosen);
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
function workspaceIsPackage(workspaceRoot) {
  return realpathSync(workspaceRoot) === realpathSync(PACKAGE_ROOT);
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

const DEFAULT_EDITORIAL = {
  tone: 'humorous',
  roast_intensity: 'medium',
  output: { sleeper_max_chars: 900, include_emoji: true },
  // Eighteen entries, not twelve: a guillotine league normally starts with one
  // team per NFL regular-season week, and `rankEmoji` below repeats the last
  // entry past the end of the table — so a twelve-entry table gave an 18-team
  // league the same emoji six times over and the bottom stopped meaning
  // anything. The first twelve are unchanged, so a 12-team league prints
  // exactly what it always did. Kept in step with config/editorial.yml, which
  // is what a real run actually reads; this is only the fallback for a missing
  // file.
  ranking_emoji: {
    1: '🥇', 2: '🥈', 3: '🥉', 4: '🔥', 5: '😤', 6: '👀',
    7: '🤨', 8: '🎲', 9: '🫠', 10: '💩', 11: '💩', 12: '💩',
    13: '🗑️', 14: '🗑️', 15: '⚰️', 16: '⚰️', 17: '☠️', 18: '☠️',
  },
};

/**
 * Ranking weights, keyed by resolved league format.
 *
 * Every league picks its set from `resolveRankingWeights` below; there is no
 * combined "one set for everyone" default any more, because applying the
 * dynasty set to a redraft league spent 35% of the ranking on assets
 * (dynasty_value, future_draft_capital) that a redraft league does not have.
 *
 * There is no fallback for a format without its own set. Every format the
 * publication understands now has one, but `resolveRankingWeights` still
 * refuses rather than borrowing another format's: silently ranking one league
 * on another's criteria is worse than wrong, because nothing says so.
 *
 * That refusal reaches only the editions that actually rank —
 * src/promptContext.mjs asks for a set for those and no others.
 */
const DEFAULT_RANKING_WEIGHTS = {
  dynasty: {
    starting_lineup: 0.3,
    dynasty_value: 0.25,
    depth: 0.15,
    quarterback: 0.1,
    future_draft_capital: 0.1,
    roster_flexibility: 0.05,
    contender_viability: 0.05,
  },
  redraft: {
    // No dynasty_value, no future_draft_capital: a redraft roster is torn up
    // and re-drafted every season, so there is no long-term asset to weigh.
    // The 0.35 that freed up is redistributed into starting_lineup (+0.15),
    // depth (+0.10) and contender_viability (+0.10) — the three factors that
    // matter more once nothing carries over to next year.
    starting_lineup: 0.45,
    depth: 0.25,
    quarterback: 0.1,
    roster_flexibility: 0.05,
    contender_viability: 0.15,
  },
  guillotine: {
    // The format inverts the usual advice, and so does the weight set. You do
    // not need the most points, only to not be last, so the number that keeps
    // a roster alive is the one it falls to on a bad week — not the one it
    // reaches on a good one. `weekly_floor` is therefore the heaviest factor
    // in any set here, and there is no `contender_viability`: the only way to
    // contend is to still be in the league.
    weekly_floor: 0.4,
    starting_lineup: 0.25,
    // A bye cluster is a genuine elimination risk in this format rather than a
    // week to shrug off, which is why it is weighed at all — no other set has
    // it.
    bye_exposure: 0.15,
    // Ammunition, not cash. Every chop dumps a whole roster onto the wire, and
    // the pools get better as the season goes on, so a survivor with budget
    // left is a survivor who can still improve.
    faab_remaining: 0.1,
    // Injury survivability specifically: one hole in a starting lineup is how
    // a floor collapses in the week that ends you.
    depth: 0.1,
    // No dynasty_value and no future_draft_capital, and not because they are
    // small — because they are nothing. A chopped team's season is over, so a
    // pick for a draft it will not be in and a player it will not get to
    // start are both worth exactly zero this week.
  },
  // The `future-stock` edition's set. Not a league format: only that edition
  // reads it, and that edition is dynasty-only (src/futureStock.mjs). It lives
  // here so it is validated and overridden like the others.
  future_stock: {
    // Production from players young enough to keep producing, then age. Picks
    // and youth are upside on top of a roster that scores, not a substitute.
    sustainable_production: 0.25,
    // Where the roster sits on each position's age curve. The dynasty set has
    // no age factor at all.
    roster_age_window: 0.25,
    // Double the dynasty set's 0.10, still below the two factors above.
    future_draft_capital: 0.2,
    dynasty_value: 0.15,
    quarterback: 0.1,
    // Current form is evidence about a roster here, not the thing ranked.
    starting_lineup: 0.05,
  },
};

const DEFAULT_RANKINGS = {
  weights: DEFAULT_RANKING_WEIGHTS,
  weekly: { max_normal_movement: 3, allow_exceptional_movement: true },
};

/**
 * The guillotine settings, before an operator has written any.
 *
 * `eliminations` is the declared week -> team ledger described in
 * src/analysis/elimination.mjs: the reliable answer to who has been chopped,
 * as opposed to the one derived from roster state. Empty by default, because
 * there is nothing this tool could honestly put there.
 */
const DEFAULT_GUILLOTINE = { eliminations: {} };

/**
 * The rookie draft settings, before an operator has written any.
 *
 * `order` is the declared draft order rule (src/rookieDraft.mjs). Null by
 * default, because Sleeper does not report one and any default this tool
 * picked would put picks in the wrong slots for some league.
 */
const DEFAULT_ROOKIE_DRAFT = { order: null, rounds: null, tank_watch: { start_week: null } };

/** Per-format weight maps: a partial override in rankings.yml replaces the whole set, never merges into it. */
const RANKING_WEIGHT_REPLACE_KEYS = [
  'weights.dynasty',
  'weights.redraft',
  'weights.guillotine',
  'weights.future_stock',
];

/** How far a weight set's sum may drift from 1.0 before it is treated as wrong, to absorb float rounding. */
const WEIGHT_SUM_TOLERANCE = 1e-6;

function sumWeights(weights) {
  return Object.values(weights).reduce((total, value) => total + Number(value), 0);
}

/**
 * Checks every declared weight set adds up to 1.0.
 *
 * Weights are guidance given to a model, not a formula it computes, so a set
 * that does not sum to 1.0 is not caught by any arithmetic downstream — it
 * just quietly over- or under-weights the ranking forever. This runs once, at
 * config load, against every set the file defines, not only the one the
 * current league happens to use: a typo in a set nobody is running today is
 * still a typo.
 */
export function validateRankingWeights(weights) {
  for (const [formatType, set] of Object.entries(weights ?? {})) {
    const sum = sumWeights(set);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      throw new Error(
        `config/rankings.yml weights.${formatType} sums to ${sum}, not 1.0. ` +
          'Fix the weights (or the keys under it) so they add up to exactly 1.0.',
      );
    }
  }
}

/**
 * Picks the weight set for a resolved league format.
 *
 * There is no fallback to another format's set. A format with no set of its
 * own in config/rankings.yml is a loud error naming the missing key, because
 * silently reusing another format's weights would rank that league on
 * criteria that do not apply to it, with nothing saying so. That is the case
 * an operator who trims a set out of the file lands in, and the case a newly
 * added format lands in before its own set is written.
 */
export function resolveRankingWeights(rankings, formatType) {
  const weights = rankings?.weights?.[formatType];
  if (weights) return weights;

  const known = Object.keys(rankings?.weights ?? {});
  throw new Error(
    `No ranking weight set for format "${formatType}" (missing weights.${formatType} in ` +
      `config/rankings.yml). ${known.length ? `Sets defined: ${known.join(', ')}.` : 'No sets are defined at all.'} ` +
      `Add weights.${formatType} to config/rankings.yml — write out every key it needs; a partial ` +
      'set is not accepted.',
  );
}

/**
 * The weight set for the future stock edition. Like resolveRankingWeights it
 * never borrows another set: trimming `weights.future_stock` out of
 * config/rankings.yml is an error naming it, not a quiet fall back to dynasty.
 */
export function resolveFutureStockWeights(rankings) {
  return resolveRankingWeights(rankings, 'future_stock');
}

/** Reads a dotted path (`"weights.redraft"`) out of a plain object. */
function getAtPath(obj, segments) {
  let acc = obj;
  for (const segment of segments) {
    if (acc == null || typeof acc !== 'object' || !Object.prototype.hasOwnProperty.call(acc, segment)) {
      return undefined;
    }
    acc = acc[segment];
  }
  return acc;
}

/** Writes a dotted path (`"weights.redraft"`) into a plain object, creating intermediate objects as needed. */
function setAtPath(obj, segments, value) {
  let acc = obj;
  for (const segment of segments.slice(0, -1)) {
    if (typeof acc[segment] !== 'object' || acc[segment] === null) acc[segment] = {};
    acc = acc[segment];
  }
  acc[segments.at(-1)] = value;
}

/**
 * Reads a config file over the built-in defaults.
 *
 * `replaceKeys` names the settings where merging would be wrong, as a dotted
 * path (`"ranking_emoji"`, or nested like `"weights.redraft"`). A map like
 * `ranking_emoji` — or a per-format weight set — is a single table, not a bag
 * of independent values: someone who writes out eight emoji, or five weights,
 * means that many, and silently restoring the rest from the defaults makes
 * the file look broken (or, for weights, produces a set that does not sum to
 * 1.0). For those keys the file wins outright whenever it mentions them at
 * all.
 */
export function readYamlFile(path, fallback, { replaceKeys = [] } = {}) {
  if (!existsSync(path)) return fallback;
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return fallback;
    const merged = deepMerge(fallback, parsed);
    for (const key of replaceKeys) {
      const segments = key.split('.');
      const value = getAtPath(parsed, segments);
      if (value === undefined || value === null) continue;
      setAtPath(merged, segments, value);
    }
    return merged;
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

function deepMerge(base, override, trail = []) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined) continue;
    const here = [...trail, key].join('.');
    const baseValue = base?.[key];
    const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
    // A setting that is a table in the layer below cannot become a bare value
    // (`output: oops`): the merge would replace the whole table and a later read
    // would fail somewhere unrelated. Say which setting is wrong instead.
    if (isMap(baseValue) && !isMap(value)) {
      throw new Error(`${here} must be a table of settings, not ${JSON.stringify(value)}`);
    }
    result[key] = isMap(value) && isMap(baseValue) ? deepMerge(baseValue, value, [...trail, key]) : value;
  }
  return result;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
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
  applyEnvFile(envPath);
  const env = process.env;

  // Layers, lowest first: built-in defaults, the shipped file, the workspace's
  // copy. Each is read by the same readYamlFile with the same replaceKeys, so a
  // workspace that writes out a ranking_emoji table or a weight set replaces it
  // outright, exactly as the shipped file does over the built-ins. A workspace
  // that is the package folder has no layer of its own.
  const own = !workspaceIsPackage(workspaceRoot);
  const editorialOverride = own && existsSync(workspaceEditorialPath) ? workspaceEditorialPath : null;
  const rankingsOverride = own && existsSync(workspaceRankingsPath) ? workspaceRankingsPath : null;
  const promptsDir = own && existsSync(workspacePromptsPath) ? workspacePromptsPath : null;

  const editorialOptions = { replaceKeys: ['ranking_emoji', 'awards', 'banned_phrases'] };
  const shippedEditorial = readYamlFile(editorialPath, DEFAULT_EDITORIAL, editorialOptions);
  const editorial = editorialOverride
    ? readYamlFile(editorialOverride, shippedEditorial, editorialOptions)
    : shippedEditorial;
  const rankingsOptions = { replaceKeys: RANKING_WEIGHT_REPLACE_KEYS };
  const shippedRankings = readYamlFile(rankingsPath, DEFAULT_RANKINGS, rankingsOptions);
  const rankings = rankingsOverride
    ? readYamlFile(rankingsOverride, shippedRankings, rankingsOptions)
    : shippedRankings;
  // Every set the file defines is checked, not only the one this league uses
  // — see the comment on validateRankingWeights.
  validateRankingWeights(rankings.weights);

  // Read and checked here even for a league that is not guillotine, for the
  // same reason: a typo in a ledger nobody is running today is still a typo,
  // and finding it at config load is finding it before any command runs.
  const guillotine = readYamlFile(guillotinePath, DEFAULT_GUILLOTINE, {
    replaceKeys: ['eliminations'],
  });
  const eliminations = parseDeclaredEliminations(guillotine.eliminations);

  // Same again for the rookie draft order: checked at load whatever the
  // league's format, so a misspelled group or sort stops every command, listing
  // the valid values, rather than only the one that projects picks.
  const rookieDraft = readYamlFile(rookieDraftPath, DEFAULT_ROOKIE_DRAFT, { replaceKeys: ['order'] });
  const rookieDraftOrder = parseDeclaredDraftOrder(rookieDraft.order, {
    source: `order in ${rookieDraftPath}`,
  });
  const rookieDraftRounds = parseDeclaredRoundOrder(rookieDraft.rounds, {
    source: `rounds in ${rookieDraftPath}`,
  });
  const tankWatchStartWeek = parseTankWatchStartWeek(rookieDraft.tank_watch?.start_week, {
    source: `tank_watch.start_week in ${rookieDraftPath}`,
  });

  // .env may override the two editorial knobs a beginner is most likely to want.
  if (env.PRESSBOX_TONE) editorial.tone = env.PRESSBOX_TONE;
  if (env.SLEEPER_POST_MAX_LENGTH) {
    editorial.output.sleeper_max_chars = Number.parseInt(env.SLEEPER_POST_MAX_LENGTH, 10);
  }
  editorial.output.include_emoji = bool(env.INCLUDE_EMOJI, editorial.output.include_emoji);

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
    leagueId: (env.SLEEPER_LEAGUE_ID || '').trim(),
    season: env.SLEEPER_SEASON ? String(env.SLEEPER_SEASON).trim() : null,
    week: env.FANTASY_WEEK ? Number.parseInt(env.FANTASY_WEEK, 10) : null,
    leagueDisplayName: env.LEAGUE_DISPLAY_NAME || null,
    // What kind of league this is, if the operator said. Null means "work it
    // out from Sleeper"; a misspelling throws here, before any command runs.
    leagueFormat: parseDeclaredFormatType(env.LEAGUE_FORMAT),
    ai: {
      provider: (env.AI_PROVIDER || '').trim().toLowerCase() || null,
      anthropicKey: (env.ANTHROPIC_API_KEY || '').trim(),
      openaiKey: (env.OPENAI_API_KEY || '').trim(),
      model: (env.AI_MODEL || env.OPENAI_MODEL || '').trim(),
    },
    dataDir: resolve(workspaceRoot, env.DATA_DIR || 'data'),
    outputDir: resolve(workspaceRoot, env.OUTPUT_DIR || 'output'),
    debug: bool(env.DEBUG, false),
    editorial,
    rankings,
    // Settings that only mean anything in a guillotine league. Kept in their
    // own sub-object so nothing reaches for `config.eliminations` in a format
    // where no team is ever eliminated.
    guillotine: { eliminations },
    // How the rookie draft is ordered, if declared. Null means undeclared, and
    // no draft order can be projected (requireDraftOrderRule). The tank
    // watch's start week is null unless declared, meaning the regular
    // season's midpoint (src/tankWatch.mjs#resolveTankWatchStartWeek).
    rookieDraft: { order: rookieDraftOrder, rounds: rookieDraftRounds, tankWatch: { startWeek: tankWatchStartWeek } },
  };
}

/**
 * Reads and validates a season's bye-week table (src/analysis/byeExposure.mjs).
 *
 * Unlike every other config/*.yml this file reads, there is no honest fallback
 * for a missing one: "no table found" cannot default to "nobody has a bye",
 * the same reasoning `resolveRankingWeights` already applies to a format with
 * no weight set. A season without its table yet is refused loudly, naming the
 * generator that produces it, rather than reporting confident zeroes for
 * every survivor.
 *
 * Season-specific rather than part of `loadConfig()` because the season is
 * only reliably known once a league has actually been opened
 * (`league.season` in src/pipeline.mjs) — `config.season` here is only ever
 * an operator's optional override of what Sleeper already says.
 */
export function loadByeWeekTable({ season, configDir = join(PACKAGE_ROOT, 'config') } = {}) {
  const source = byeWeekTableSource(season);
  const path = join(configDir, `bye-weeks.${season}.yml`);
  if (!existsSync(path)) {
    throw new Error(
      `No bye-week table for season ${season} (expected ${source}).\n` +
        `Generate it with: node scripts/fetch-bye-weeks.mjs ${season}`,
    );
  }

  let parsed;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }

  return parseByeWeekTable(parsed, { season, source });
}

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

/** The emoji that precedes a team at a given rank, e.g. 1 -> 🥇. */
export function rankEmoji(config, rank) {
  if (!config.editorial.output.include_emoji) return '';
  const table = config.editorial.ranking_emoji || {};
  const exact = table[rank] ?? table[String(rank)];
  if (exact) return exact;

  // A league larger than the configured table still needs an emoji per rank.
  // Reuse the lowest-ranked one rather than printing a stray bullet, which
  // looks like a bug next to the ranks that did match.
  const ranks = Object.keys(table)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (ranks.length === 0) return '';
  return rank > ranks.at(-1) ? table[ranks.at(-1)] ?? table[String(ranks.at(-1))] : '';
}
