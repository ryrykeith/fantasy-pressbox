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

const DEFAULT_RANKINGS = {
  weights: {
    starting_lineup: 0.3,
    dynasty_value: 0.25,
    depth: 0.15,
    quarterback: 0.1,
    future_draft_capital: 0.1,
    roster_flexibility: 0.05,
    contender_viability: 0.05,
  },
  weekly: { max_normal_movement: 3, allow_exceptional_movement: true },
};

/**
 * Reads a config file over the built-in defaults.
 *
 * `replaceKeys` names the settings where merging would be wrong. A map like
 * `ranking_emoji` is a single table, not a bag of independent values: someone
 * who writes out eight emoji means eight, and silently restoring the missing
 * four from the defaults makes the file look broken. For those keys the file
 * wins outright whenever it mentions them at all.
 */
function readYamlFile(path, fallback, { replaceKeys = [] } = {}) {
  if (!existsSync(path)) return fallback;
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return fallback;
    const merged = deepMerge(fallback, parsed);
    for (const key of replaceKeys) {
      if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] !== null) {
        merged[key] = parsed[key];
      }
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
  const rankings = readYamlFile(join(ROOT, 'config', 'rankings.yml'), DEFAULT_RANKINGS);

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
