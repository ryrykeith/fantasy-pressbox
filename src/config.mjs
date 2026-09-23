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

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const DEFAULT_EDITORIAL = {
  tone: 'humorous',
  roast_intensity: 'medium',
  output: { sleeper_max_chars: 900, include_emoji: true },
  ranking_emoji: {
    1: '🥇', 2: '🥈', 3: '🥉', 4: '🔥', 5: '😤', 6: '👀',
    7: '🤨', 8: '🎲', 9: '🫠', 10: '💩', 11: '💩', 12: '💩',
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
 * `dynasty` doubles as the shared fallback for any format without its own
 * set — currently just `guillotine`, whose real set is specified by its own
 * epic (Epic: Guillotine league coverage). Until that lands, a guillotine
 * league is ranked on the dynasty set purely so a run does not crash; that is
 * a placeholder, not a considered decision for that format.
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
};

const DEFAULT_RANKINGS = {
  weights: DEFAULT_RANKING_WEIGHTS,
  weekly: { max_normal_movement: 3, allow_exceptional_movement: true },
};

/** Per-format weight maps: a partial override in rankings.yml replaces the whole set, never merges into it. */
const RANKING_WEIGHT_REPLACE_KEYS = ['weights.dynasty', 'weights.redraft'];

/**
 * Picks the weight set for a resolved league format.
 *
 * Falls back to the dynasty set for a format with no set of its own (today,
 * only `guillotine` — see the comment on `DEFAULT_RANKING_WEIGHTS`), and for
 * any format the taxonomy has not been told about yet.
 */
export function resolveRankingWeights(rankings, formatType) {
  return rankings?.weights?.[formatType] ?? rankings?.weights?.dynasty ?? {};
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

export function loadConfig({ envPath = join(ROOT, '.env') } = {}) {
  applyEnvFile(envPath);
  const env = process.env;

  const editorial = readYamlFile(join(ROOT, 'config', 'editorial.yml'), DEFAULT_EDITORIAL, {
    replaceKeys: ['ranking_emoji', 'awards', 'banned_phrases'],
  });
  const rankings = readYamlFile(join(ROOT, 'config', 'rankings.yml'), DEFAULT_RANKINGS, {
    replaceKeys: RANKING_WEIGHT_REPLACE_KEYS,
  });

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
  };
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
