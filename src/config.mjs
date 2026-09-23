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
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml.mjs';
import { applyEnvFile } from './lib/env.mjs';
import { parseDeclaredFormatType } from './format.mjs';
import { parseDeclaredEliminations } from './analysis/elimination.mjs';
import { byeWeekTableSource, parseByeWeekTable } from './analysis/byeExposure.mjs';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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

/** Per-format weight maps: a partial override in rankings.yml replaces the whole set, never merges into it. */
const RANKING_WEIGHT_REPLACE_KEYS = ['weights.dynasty', 'weights.redraft', 'weights.guillotine'];

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

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === null || value === undefined) continue;
    result[key] =
      typeof value === 'object' && !Array.isArray(value) && typeof base?.[key] === 'object'
        ? deepMerge(base[key], value)
        : value;
  }
  return result;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function loadConfig({
  envPath = join(ROOT, '.env'),
  rankingsPath = join(ROOT, 'config', 'rankings.yml'),
  guillotinePath = join(ROOT, 'config', 'guillotine.yml'),
} = {}) {
  applyEnvFile(envPath);
  const env = process.env;

  const editorial = readYamlFile(join(ROOT, 'config', 'editorial.yml'), DEFAULT_EDITORIAL, {
    replaceKeys: ['ranking_emoji', 'awards', 'banned_phrases'],
  });
  const rankings = readYamlFile(rankingsPath, DEFAULT_RANKINGS, {
    replaceKeys: RANKING_WEIGHT_REPLACE_KEYS,
  });
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

  // .env may override the two editorial knobs a beginner is most likely to want.
  if (env.PRESSBOX_TONE) editorial.tone = env.PRESSBOX_TONE;
  if (env.SLEEPER_POST_MAX_LENGTH) {
    editorial.output.sleeper_max_chars = Number.parseInt(env.SLEEPER_POST_MAX_LENGTH, 10);
  }
  editorial.output.include_emoji = bool(env.INCLUDE_EMOJI, editorial.output.include_emoji);

  return {
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
    dataDir: env.DATA_DIR || join(ROOT, 'data'),
    outputDir: env.OUTPUT_DIR || join(ROOT, 'output'),
    debug: bool(env.DEBUG, false),
    editorial,
    rankings,
    // Settings that only mean anything in a guillotine league. Kept in their
    // own sub-object so nothing reaches for `config.eliminations` in a format
    // where no team is ever eliminated.
    guillotine: { eliminations },
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
export function loadByeWeekTable({ season, configDir = join(ROOT, 'config') } = {}) {
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
