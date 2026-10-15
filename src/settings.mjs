/**
 * The settings layer: defaults, merging and validation, with no disk, no
 * environment and no process.
 *
 * Nothing here imports `node:` or reads `process` or `import.meta`, so the
 * browser entry can resolve the same settings the CLI does from plain objects.
 * src/config.mjs is the CLI half: it reads .env and the YAML files, then hands
 * the parsed objects to `resolveSettings`.
 *
 * Secrets never pass through here. `resolveSettings` returns editorial,
 * rankings, guillotine and rookie-draft settings only; the ESPN cookies stay in
 * config.mjs's `loadConfig`, in `config.league.secrets`.
 */
import { parseDeclaredEliminations } from './analysis/elimination.mjs';
import { parseDeclaredRoundOrder, parseDeclaredDraftOrder } from './rookieDraft.mjs';
import { parseTankWatchStartWeek } from './tankWatch.mjs';
import { DEFAULT_PROVIDER, PROVIDER_NAMES, providerDisplayName } from './providers.mjs';
import { checkKey } from './lib/safeInput.mjs';

export const DEFAULT_EDITORIAL = {
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

/**
 * The ranking presets other than `balanced`, keyed by preset name and then by
 * league format. `balanced` is not in this table: it is the per-format sets
 * above, so a league that names no preset ranks exactly as it always has.
 *
 * The values are editorial choices, not facts, and kept in step with
 * config/rankings.yml, which says why each one is what it is; this is only the
 * fallback for a missing file (tests/rankings-presets.test.mjs holds the two
 * together). A preset will also carry the strength rating's weights, as
 * `presets.<name>.strength.<format>`, beside its `weights`.
 */
const DEFAULT_RANKING_PRESETS = {
  'win-now': {
    weights: {
      dynasty: {
        starting_lineup: 0.4,
        dynasty_value: 0.1,
        depth: 0.2,
        quarterback: 0.1,
        future_draft_capital: 0.05,
        roster_flexibility: 0.05,
        contender_viability: 0.1,
      },
      redraft: {
        starting_lineup: 0.5,
        depth: 0.15,
        quarterback: 0.1,
        roster_flexibility: 0.05,
        contender_viability: 0.2,
      },
    },
  },
  rebuild: {
    weights: {
      dynasty: {
        starting_lineup: 0.15,
        dynasty_value: 0.35,
        depth: 0.1,
        quarterback: 0.1,
        future_draft_capital: 0.25,
        roster_flexibility: 0.05,
      },
    },
  },
};

export const DEFAULT_RANKINGS = {
  weights: DEFAULT_RANKING_WEIGHTS,
  presets: DEFAULT_RANKING_PRESETS,
  weekly: { max_normal_movement: 3, allow_exceptional_movement: true },
};

/** The preset a league ranks under when it names none: the per-format sets under `weights`. */
export const DEFAULT_RANKING_PRESET = 'balanced';

/**
 * Weight sets under `weights` that belong to an edition, not to a league
 * format. A preset never chooses them: the future stock edition has one set.
 */
const EDITION_WEIGHT_SETS = ['future_stock'];

/** What a preset name may look like: it is a key in a dotted settings path, so no dots. */
const PRESET_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * The guillotine settings, before an operator has written any.
 *
 * `eliminations` is the declared week -> team ledger described in
 * src/analysis/elimination.mjs: the reliable answer to who has been chopped,
 * as opposed to the one derived from roster state. Empty by default, because
 * there is nothing this tool could honestly put there.
 */
export const DEFAULT_GUILLOTINE = { eliminations: {} };

/**
 * The rookie draft settings, before an operator has written any.
 *
 * `order` is the declared draft order rule (src/rookieDraft.mjs). Null by
 * default, because Sleeper does not report one and any default this tool
 * picked would put picks in the wrong slots for some league.
 */
export const DEFAULT_ROOKIE_DRAFT = { order: null, rounds: null, tank_watch: { start_week: null } };

/** Per-format weight maps: a partial override in rankings.yml replaces the whole set, never merges into it. */
export const RANKING_WEIGHT_REPLACE_KEYS = [
  'weights.dynasty',
  'weights.redraft',
  'weights.guillotine',
  'weights.future_stock',
];

/** The editorial tables: a layer that writes one out replaces it, never merges into it. */
export const EDITORIAL_REPLACE_KEYS = ['ranking_emoji', 'awards', 'banned_phrases'];

/**
 * How rank and standing lines print their emoji: the shipped table
 * (`default`), the league's own table (`custom`), or nothing (`none`).
 */
export const RANK_EMOJI_MODES = ['default', 'custom', 'none'];

/** The modes one run can ask for with `--emoji`: a custom table is a league's, not a flag's. */
export const RANK_EMOJI_RUN_MODES = ['default', 'none'];

const SINGLE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)/u;

/** True when `text` is exactly one grapheme and that grapheme is an emoji. */
export function isSingleEmoji(text) {
  if (typeof text !== 'string' || text === '') return false;
  const graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)];
  return graphemes.length === 1 && SINGLE_EMOJI.test(text);
}

/**
 * Refuses a custom rank emoji table unless every entry is a single emoji
 * grapheme. `source` names where the table came from, for the message.
 */
export function validateRankEmojiTable(table, { source = 'ranking_emoji' } = {}) {
  for (const [rank, emoji] of Object.entries(table)) {
    if (!isSingleEmoji(emoji)) {
      throw new Error(
        `${source} entry ${rank} is ${JSON.stringify(emoji)}, which is not a single emoji. ` +
          'Each rank needs exactly one emoji, e.g. 1: "🥇".',
      );
    }
  }
}

const isTable = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The rank emoji setting a config carries: `{ mode, table }`.
 *
 * A resolved config has it as `config.rankEmoji`. A config assembled by hand
 * (a test, a caller of buildContext) has only the older editorial keys, which
 * mean the same thing: `output.include_emoji: false` is `none`, otherwise the
 * `ranking_emoji` table is the one in force.
 */
export function rankEmojiOf(config) {
  if (config.rankEmoji) return config.rankEmoji;
  const { output, ranking_emoji: table } = config.editorial;
  if (output?.include_emoji === false) return { mode: 'none', table: {} };
  return { mode: 'custom', table: isTable(table) ? table : {} };
}

/**
 * A copy of `config` for one run with the rank emoji forced to `mode`
 * (`--emoji`). `default` is the shipped table, ignoring the league's own.
 * Nothing on disk or in `config` itself changes.
 */
export function withRankEmojiMode(config, mode) {
  if (!RANK_EMOJI_RUN_MODES.includes(mode)) {
    throw new Error(`--emoji is "${mode}", which is not a rank emoji mode. Use one of: ${RANK_EMOJI_RUN_MODES.join(', ')}.`);
  }
  const table = mode === 'none' ? {} : (config.defaultRankEmojiTable ?? DEFAULT_EDITORIAL.ranking_emoji);
  return {
    ...config,
    rankEmoji: { mode, table },
    editorial: {
      ...config.editorial,
      ranking_emoji: table,
      output: { ...config.editorial.output, include_emoji: mode !== 'none' },
    },
  };
}

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
export function validateRankingWeights(weights, { path = 'weights' } = {}) {
  for (const [formatType, set] of Object.entries(weights ?? {})) {
    const sum = sumWeights(set);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      throw new Error(
        `config/rankings.yml ${path}.${formatType} sums to ${sum}, not 1.0. ` +
          'Fix the weights (or the keys under it) so they add up to exactly 1.0.',
      );
    }
  }
}

/**
 * The presets each league format has, `balanced` first:
 * `{ dynasty: ['balanced', 'win-now', 'rebuild'], ... }`. `balanced` is a
 * format's set under `weights`; every other preset is in `presets`.
 */
export function rankingPresetsByFormat(rankings) {
  const byFormat = {};
  const add = (formatType, name) => {
    byFormat[formatType] ??= [];
    if (!byFormat[formatType].includes(name)) byFormat[formatType].push(name);
  };
  for (const formatType of Object.keys(rankings?.weights ?? {})) {
    if (!EDITION_WEIGHT_SETS.includes(formatType)) add(formatType, DEFAULT_RANKING_PRESET);
  }
  for (const [name, preset] of Object.entries(rankings?.presets ?? {})) {
    for (const formatType of Object.keys(preset?.weights ?? {})) add(formatType, name);
  }
  return byFormat;
}

/** "dynasty: balanced, win-now, rebuild; redraft: balanced, win-now", for messages. */
function describePresetsByFormat(byFormat) {
  const entries = Object.entries(byFormat);
  if (!entries.length) return 'No presets are defined at all.';
  return `Presets by format: ${entries.map(([formatType, names]) => `${formatType}: ${names.join(', ')}`).join('; ')}.`;
}

/** A format's set under `weights`, or a loud error naming the missing key. */
function weightSet(rankings, key) {
  const weights = rankings?.weights?.[key];
  if (weights) return weights;

  const known = Object.keys(rankings?.weights ?? {});
  throw new Error(
    `No ranking weight set for format "${key}" (missing weights.${key} in ` +
      `config/rankings.yml). ${known.length ? `Sets defined: ${known.join(', ')}.` : 'No sets are defined at all.'} ` +
      `Add weights.${key} to config/rankings.yml — write out every key it needs; a partial ` +
      'set is not accepted.',
  );
}

/**
 * Which weights rank a league of a resolved format, and which preset chose
 * them: `{ preset, weights }`. `preset` is null when the league wrote its own
 * `weights.<format>` and named no preset.
 *
 * - No preset named: the league's own set if it wrote one, otherwise
 *   `balanced` (the set under `weights`), exactly as before presets existed.
 * - A preset named together with the league's own `weights.<format>` is
 *   refused, naming both: nothing silently wins.
 * - An unknown preset, or one this format does not have, is refused, naming
 *   the presets this format does have.
 *
 * There is no fallback to another format's set. A format with no set of its
 * own in config/rankings.yml is a loud error naming the missing key, because
 * silently reusing another format's weights would rank that league on
 * criteria that do not apply to it, with nothing saying so.
 */
export function resolveRankingChoice(rankings, formatType) {
  const preset = rankings?.preset ?? null;
  const ownWeights = rankings?.ownWeights ?? [];
  if (preset === null) {
    const weights = weightSet(rankings, formatType);
    return { preset: ownWeights.includes(formatType) ? null : DEFAULT_RANKING_PRESET, weights };
  }
  if (ownWeights.includes(formatType)) {
    throw new Error(
      `config/rankings.yml sets both preset: ${preset} and its own weights.${formatType}, so it does not say ` +
        `which should rank this ${formatType} league. Remove one: the preset, or weights.${formatType}.`,
    );
  }
  const available = rankingPresetsByFormat(rankings)[formatType] ?? [];
  if (!available.includes(preset)) {
    const known = Object.values(rankingPresetsByFormat(rankings)).some((names) => names.includes(preset));
    throw new Error(
      `preset: ${preset} in config/rankings.yml is ${known ? `not a preset a ${formatType} league has` : 'not a ranking preset'}. ` +
        (available.length
          ? `A ${formatType} league's presets are: ${available.join(', ')}.`
          : `A ${formatType} league has no presets: there is no weights.${formatType} in config/rankings.yml.`),
    );
  }
  const weights =
    preset === DEFAULT_RANKING_PRESET ? weightSet(rankings, formatType) : rankings.presets[preset].weights[formatType];
  return { preset, weights };
}

/** The weight set that ranks a league of a resolved format — see resolveRankingChoice. */
export function resolveRankingWeights(rankings, formatType) {
  return resolveRankingChoice(rankings, formatType).weights;
}

/**
 * The weight set for the future stock edition. Like resolveRankingWeights it
 * never borrows another set: trimming `weights.future_stock` out of
 * config/rankings.yml is an error naming it, not a quiet fall back to dynasty.
 * No preset chooses it: the edition has one set.
 */
export function resolveFutureStockWeights(rankings) {
  return weightSet(rankings, 'future_stock');
}

/**
 * Checks the `preset` setting and the `presets` table at load, before any
 * league format is known: the name is a word, `balanced` is not redefined
 * (it is the sets under `weights`), every preset set sums to 1.0, and the
 * named preset exists for some format. Whether the league's own format has
 * it is resolveRankingChoice's question.
 */
function validateRankingPresets(rankings) {
  const { preset = null, presets = {} } = rankings;
  if (!isTable(presets)) throw new Error('presets in config/rankings.yml must be a table of presets');
  for (const [name, table] of Object.entries(presets)) {
    if (name === DEFAULT_RANKING_PRESET) {
      throw new Error(
        `config/rankings.yml defines presets.${name}, but ${name} is the sets under weights. ` +
          `Change weights.<format> to change it, and remove presets.${name}.`,
      );
    }
    if (!PRESET_NAME.test(name)) {
      throw new Error(`presets.${name} in config/rankings.yml is not a preset name: use lower-case letters, digits and hyphens.`);
    }
    if (!isTable(table) || !isTable(table.weights ?? {})) {
      throw new Error(`presets.${name} in config/rankings.yml must be a table holding weights.<format>`);
    }
    validateRankingWeights(table.weights, { path: `presets.${name}.weights` });
  }
  if (preset === null) return;
  if (typeof preset !== 'string' || !PRESET_NAME.test(preset)) {
    throw new Error(
      `preset in config/rankings.yml is ${JSON.stringify(preset)}, which is not a preset name. ` +
        describePresetsByFormat(rankingPresetsByFormat(rankings)),
    );
  }
  const byFormat = rankingPresetsByFormat(rankings);
  if (!Object.values(byFormat).some((names) => names.includes(preset))) {
    throw new Error(`preset: ${preset} in config/rankings.yml is not a ranking preset. ${describePresetsByFormat(byFormat)}`);
  }
}

/**
 * The replace-wholesale paths for every preset weight set any layer writes
 * (`presets.rebuild.weights.dynasty`), so a partial preset set replaces the
 * shipped one exactly as a partial `weights.<format>` does.
 */
function presetReplaceKeys(layers) {
  const keys = new Set();
  for (const layer of layers) {
    if (!isTable(layer?.presets)) continue;
    for (const [name, table] of Object.entries(layer.presets)) {
      if (!isTable(table?.weights)) continue;
      for (const formatType of Object.keys(table.weights)) keys.add(`presets.${name}.weights.${formatType}`);
    }
  }
  return [...keys];
}

/** The league formats whose weight set a league (or the caller's overrides) wrote itself. */
function ownWeightFormats(layers) {
  const formats = new Set();
  for (const layer of layers) {
    for (const key of Object.keys(isTable(layer?.weights) ? layer.weights : {})) {
      if (!EDITION_WEIGHT_SETS.includes(key) && layer.weights[key] !== null && layer.weights[key] !== undefined) {
        formats.add(key);
      }
    }
  }
  return [...formats];
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
 * Lays `override` over `base`, table by table. `trail` is the path of the
 * tables being merged, for messages.
 *
 * The result is built by assigning keys, so a key named __proto__,
 * constructor or prototype is refused (src/lib/safeInput.mjs): an object from
 * JSON.parse can hold __proto__ as an ordinary key, and assigning it here
 * would replace the merged table's prototype.
 */
export function deepMerge(base, override, trail = []) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    checkKey(key, { path: trail });
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

/**
 * Lays one parsed settings object over `base`.
 *
 * `replaceKeys` names the settings where merging would be wrong, as a dotted
 * path (`"ranking_emoji"`, or nested like `"weights.redraft"`). A map like
 * `ranking_emoji` — or a per-format weight set — is a single table, not a bag
 * of independent values: someone who writes out eight emoji, or five weights,
 * means that many, and silently restoring the rest from the defaults makes
 * the file look broken (or, for weights, produces a set that does not sum to
 * 1.0). For those keys the layer wins outright whenever it mentions them at
 * all.
 *
 * `base` is not modified. A layer that is absent, or not a table, leaves
 * `base` as it was.
 */
export function mergeSettingsLayer(base, layer, { replaceKeys = [] } = {}) {
  if (!layer || typeof layer !== 'object') return base;
  const merged = deepMerge(base, layer);
  for (const key of replaceKeys) {
    const segments = key.split('.');
    const value = getAtPath(layer, segments);
    if (value === undefined || value === null) continue;
    setAtPath(merged, segments, value);
  }
  return merged;
}

/** Folds `layers`, lowest first, over `base`; a failure names the layer's source when one is given. */
function foldLayers(base, layers, options) {
  return layers.reduce((acc, { layer, source }) => {
    try {
      return mergeSettingsLayer(acc, layer, options);
    } catch (error) {
      if (!source) throw error;
      throw new Error(`Could not read ${source}: ${error.message}`);
    }
  }, base);
}

/**
 * Resolves a run's editorial, ranking, guillotine and rookie-draft settings
 * from plain objects, merging them the way `loadConfig` always has.
 *
 * Layers, lowest first: the built-in defaults above, `defaults` (the shipped
 * config files), `league` (the league's own files), then `overrides` (editorial
 * knobs the caller took from its environment, such as
 * `{ editorial: { tone, output: { sleeper_max_chars, include_emoji } } }`).
 * Each is `{ editorial, rankings, guillotine, rookieDraft }` with every part
 * optional; only `league` declares guillotine and rookieDraft. The replaceKeys
 * tables (ranking_emoji, awards, banned_phrases, the per-format weight sets,
 * eliminations, order) are replaced, not merged, at every layer.
 *
 * `sources` names where each part came from, shaped like the layers
 * (`{ defaults: { editorial }, league: { rookieDraft } }`), so an error can say
 * which file was wrong. Optional.
 *
 * Returns `{ editorial, rankings, guillotine: { eliminations }, rookieDraft:
 * { order, rounds, tankWatch: { startWeek } } }`. Never carries a secret.
 */
export function resolveSettings({ defaults = {}, league = {}, overrides = {}, sources = {} } = {}) {
  const from = (group, part) => sources[group]?.[part];
  const editorial = foldLayers(
    DEFAULT_EDITORIAL,
    [
      { layer: defaults.editorial, source: from('defaults', 'editorial') },
      { layer: league.editorial, source: from('league', 'editorial') },
      { layer: overrides.editorial, source: from('overrides', 'editorial') },
    ],
    { replaceKeys: EDITORIAL_REPLACE_KEYS },
  );
  const rankingLayers = [defaults.rankings, league.rankings, overrides.rankings];
  const merged = foldLayers(
    DEFAULT_RANKINGS,
    [
      { layer: defaults.rankings, source: from('defaults', 'rankings') },
      { layer: league.rankings, source: from('league', 'rankings') },
      { layer: overrides.rankings, source: from('overrides', 'rankings') },
    ],
    { replaceKeys: [...RANKING_WEIGHT_REPLACE_KEYS, ...presetReplaceKeys([DEFAULT_RANKINGS, ...rankingLayers])] },
  );
  // `preset` is the league's choice (null: balanced). `ownWeights` lists the
  // formats whose set the league wrote itself, rather than the package
  // shipping it: a preset named beside one of those is refused when that
  // format is ranked (resolveRankingChoice).
  const rankings = {
    ...merged,
    preset: merged.preset ?? null,
    ownWeights: ownWeightFormats([league.rankings, overrides.rankings]),
  };
  // Every set is checked, not only the one this league uses — see the comment
  // on validateRankingWeights.
  validateRankingWeights(rankings.weights);
  validateRankingPresets(rankings);

  // Checked even for a league that is not guillotine: a typo in a ledger nobody
  // is running today is still a typo, found before any command runs.
  const guillotine = foldLayers(
    DEFAULT_GUILLOTINE,
    [{ layer: league.guillotine, source: from('league', 'guillotine') }],
    { replaceKeys: ['eliminations'] },
  );
  const eliminations = parseDeclaredEliminations(guillotine.eliminations);

  // Same for the rookie draft order: a misspelt group or sort stops every
  // command, listing the valid values, not only the one that projects picks.
  const rookieDraft = foldLayers(
    DEFAULT_ROOKIE_DRAFT,
    [{ layer: league.rookieDraft, source: from('league', 'rookieDraft') }],
    { replaceKeys: ['order'] },
  );
  const where = from('league', 'rookieDraft') ?? 'rookie-draft.yml';
  const order = parseDeclaredDraftOrder(rookieDraft.order, { source: `order in ${where}` });
  const rounds = parseDeclaredRoundOrder(rookieDraft.rounds, { source: `rounds in ${where}` });
  const startWeek = parseTankWatchStartWeek(rookieDraft.tank_watch?.start_week, {
    source: `tank_watch.start_week in ${where}`,
  });

  const { rankEmoji, defaultTable } = resolveRankEmoji({ editorial, defaults, league, overrides, sources });
  editorial.ranking_emoji = rankEmoji.table;
  editorial.output.include_emoji = rankEmoji.mode !== 'none';

  return {
    editorial,
    rankEmoji,
    defaultRankEmojiTable: defaultTable,
    rankings,
    guillotine: { eliminations },
    rookieDraft: { order, rounds, tankWatch: { startWeek } },
  };
}

/**
 * One setting from the older editorial keys:
 *
 * - `none` when emoji are switched off (`output.include_emoji: false`, which
 *   INCLUDE_EMOJI=false sets);
 * - `custom` when the league (or the caller's overrides) wrote a
 *   `ranking_emoji` table of its own, checked here;
 * - `default` otherwise: the shipped table.
 *
 * `defaultTable` is the shipped table whatever the mode, which is what
 * `withRankEmojiMode(config, 'default')` puts back.
 */
function resolveRankEmoji({ editorial, defaults, league, overrides, sources }) {
  const shipped = foldLayers(DEFAULT_EDITORIAL, [{ layer: defaults.editorial, source: sources.defaults?.editorial }], {
    replaceKeys: EDITORIAL_REPLACE_KEYS,
  });
  const defaultTable = shipped.ranking_emoji;
  if (editorial.output.include_emoji === false) return { rankEmoji: { mode: 'none', table: {} }, defaultTable };
  const own = [
    [overrides.editorial?.ranking_emoji, sources.overrides?.editorial],
    [league.editorial?.ranking_emoji, sources.league?.editorial],
  ].find(([table]) => isTable(table) && Object.keys(table).length);
  if (!own) return { rankEmoji: { mode: 'default', table: editorial.ranking_emoji }, defaultTable };
  validateRankEmojiTable(own[0], { source: `ranking_emoji in ${own[1] ?? 'the league settings'}` });
  return { rankEmoji: { mode: 'custom', table: own[0] }, defaultTable };
}

/** The first of `keys` set to a non-empty value in `env`, trimmed; null when none is. */
export function firstSet(env, keys) {
  for (const key of keys) {
    const value = env[key] === undefined || env[key] === null ? '' : String(env[key]).trim();
    if (value) return value;
  }
  return null;
}

/**
 * The .env key holding each platform's league ID. ESPN is listed before its
 * provider exists so that a folder naming both IDs is refused rather than
 * quietly read as Sleeper.
 */
export const LEAGUE_ID_KEYS = { sleeper: 'SLEEPER_LEAGUE_ID', espn: 'ESPN_LEAGUE_ID' };

/** The .env key that names a league's provider. */
export const LEAGUE_PROVIDER_KEY = 'LEAGUE_PROVIDER';

/**
 * Reads LEAGUE_PROVIDER, or refuses it.
 *
 * Absent or empty means Sleeper, so a league folder written before there was
 * a choice keeps working. A misspelling stops the command, listing the valid
 * values, rather than falling back: a league read from the wrong platform is
 * a run that fails somewhere unrelated, or worse, does not fail.
 */
export function parseLeagueProvider(value, { source = `${LEAGUE_PROVIDER_KEY} in .env` } = {}) {
  const text = value === undefined || value === null ? '' : String(value).trim().toLowerCase();
  if (text === '') return null;
  if (PROVIDER_NAMES.includes(text)) return text;
  const valid = PROVIDER_NAMES.map((name) => `  ${name}  — ${providerDisplayName(name)}`).join('\n');
  throw new Error(
    `${source} is "${String(value).trim()}", which is not a league provider.\n\n` +
      `Set ${LEAGUE_PROVIDER_KEY} to one of:\n${valid}\n\n` +
      `Or remove the line, and the league is read as ${providerDisplayName(DEFAULT_PROVIDER)}.`,
  );
}

/** The .env key that picks how an ESPN league's data arrives. */
export const ESPN_ROUTE_KEY = 'ESPN_ROUTE';

/** The ESPN routes: a manual import (the default) or the opt-in cookie fetch. */
export const ESPN_ROUTES = ['import', 'fetch'];
export const DEFAULT_ESPN_ROUTE = 'import';

/**
 * Reads ESPN_ROUTE, or refuses it. Absent or empty means import. A
 * misspelling stops the command, listing the valid values, like
 * LEAGUE_PROVIDER.
 */
export function parseEspnRoute(value, { source = `${ESPN_ROUTE_KEY} in .env` } = {}) {
  const text = value === undefined || value === null ? '' : String(value).trim().toLowerCase();
  if (text === '') return DEFAULT_ESPN_ROUTE;
  if (ESPN_ROUTES.includes(text)) return text;
  throw new Error(
    `${source} is "${String(value).trim()}", which is not an ESPN route.\n\n` +
      `Set ${ESPN_ROUTE_KEY} to one of: ${ESPN_ROUTES.join(', ')}.\n\n` +
      `Or remove the line, and the route is ${DEFAULT_ESPN_ROUTE}.`,
  );
}

/**
 * Which league a folder's .env names, without its secrets:
 * `{ provider, id, season, route }`.
 *
 * - provider: LEAGUE_PROVIDER, else Sleeper. A .env naming both league IDs
 *   without saying which platform is refused.
 * - id: the provider's league ID key, '' when it is not set.
 * - season: LEAGUE_SEASON, else SLEEPER_SEASON (the generic key wins), or null.
 * - route: ESPN_ROUTE for an ESPN league, null for any other (a Sleeper
 *   folder's stray line is ignored).
 *
 * The ESPN cookies are not read here: src/config.mjs reads them, and only on
 * the fetch route. The league file (src/leagueFile.mjs) reads a folder's
 * .env through this too, so both agree on which league a folder covers.
 */
export function leagueSettingsFromEnv(env) {
  const declared = parseLeagueProvider(env[LEAGUE_PROVIDER_KEY]);
  const named = Object.entries(LEAGUE_ID_KEYS).filter(([, key]) => firstSet(env, [key]));
  if (!declared && named.length > 1) {
    const keys = named.map(([, key]) => key);
    throw new Error(
      `.env sets both ${keys.join(' and ')}, so it does not say which league this folder covers.\n\n` +
        `Add ${LEAGUE_PROVIDER_KEY} to .env, naming the platform: ` +
        `${named.map(([name]) => `${LEAGUE_PROVIDER_KEY}=${name}`).join(' or ')}.`,
    );
  }
  const provider = declared ?? DEFAULT_PROVIDER;
  return {
    provider,
    id: firstSet(env, [LEAGUE_ID_KEYS[provider]]) ?? '',
    season: firstSet(env, ['LEAGUE_SEASON', 'SLEEPER_SEASON']),
    route: provider === 'espn' ? parseEspnRoute(env[ESPN_ROUTE_KEY]) : null,
  };
}

/** The emoji that precedes a team at a given rank, e.g. 1 -> 🥇. */
export function rankEmoji(config, rank) {
  const { mode, table } = rankEmojiOf(config);
  if (mode === 'none') return '';
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
