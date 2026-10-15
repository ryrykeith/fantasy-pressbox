/**
 * The league file: one versioned JSON file holding a league's history and
 * settings, which the website and the command line both read and write.
 *
 *   {
 *     schemaVersion: 1,
 *     kind: 'fantasy-pressbox.league',
 *     writtenBy: { package, version, surface },
 *     writtenAt,
 *     league: { provider, leagueId },
 *     settings: { displayName, format, season, week, espnRoute, tone,
 *                 roastIntensity, postFormat, maxChars, rankEmoji,
 *                 editorial, rankings,
 *                 declared: { eliminations, rookieDraft, prospects } },
 *     seasons: { <season>: { raw, import, snapshots, rankings, predictions,
 *                            market, tankWatch, editions } },
 *   }
 *
 * Its seasons mirror the store (src/storeCore.mjs) one to one: each history
 * kind is a store kind, and each entry is one file of it, named without
 * `.json` — `seasons['2026'].rankings['week-3']` is
 * data/rankings/2026/week-3.json. `tankWatch` is the store's tank-watch.
 *
 * A setting is what the league folder declares, and null when it declares
 * nothing (the package's default applies). `editorial` and `rankings` are the
 * league's own config/editorial.yml (less the keys the named settings carry)
 * and config/rankings.yml; `declared` holds config/guillotine.yml's
 * eliminations, config/rookie-draft.yml and every config/prospects.<year>.yml.
 *
 * Never in the file: an API key, ESPN_S2, ESPN_SWID, AI_PROVIDER, AI_MODEL,
 * DATA_DIR, OUTPUT_DIR or DEBUG. A folder's .env is read through an allowlist
 * (LEAGUE_FILE_ENV_KEYS), so those lines are dropped as they are read. Saved
 * ESPN pages lose their member IDs, owners and first and last names on the
 * way in (stripEspnPersonalData), and serializeLeagueFile refuses any file
 * that still holds a value shaped like an ESPN member ID.
 *
 * Browser-safe: nothing here imports from `node:`. The command line's
 * export-league and import-league (src/cli.mjs) read and write the disk; the
 * website hands in the files a person chose.
 */
import { parseEnvAllowlist } from './lib/envText.mjs';
import { LEAGUE_JSON_LIMITS, parseJsonSafely, utf8Length } from './lib/safeInput.mjs';
import { parseYaml, stringifyYaml } from './lib/yaml.mjs';
import { parseDeclaredFormatType } from './format.mjs';
import { EDITIONS, optionNamed } from './options.mjs';
import { parseProspectBoard } from './prospectBoard.mjs';
import { PROVIDER_NAMES, providerDisplayName } from './providers.mjs';
import {
  ESPN_ROUTES,
  LEAGUE_ID_KEYS,
  firstSet,
  isSingleEmoji,
  leagueSettingsFromEnv,
  resolveRankingChoice,
  resolveSettings,
  resolveStrengthChoice,
} from './settings.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.mjs';

export const LEAGUE_FILE_SCHEMA_VERSION = 1;
export const LEAGUE_FILE_KIND = 'fantasy-pressbox.league';

/**
 * The only .env keys a league file is built from. Every other line of a
 * folder's .env — the AI keys, the ESPN cookies, AI_PROVIDER, AI_MODEL,
 * DATA_DIR, OUTPUT_DIR, DEBUG — is dropped as it is read.
 */
export const LEAGUE_FILE_ENV_KEYS = Object.freeze([
  'LEAGUE_PROVIDER',
  'SLEEPER_LEAGUE_ID',
  'ESPN_LEAGUE_ID',
  'LEAGUE_FORMAT',
  'LEAGUE_DISPLAY_NAME',
  'PRESSBOX_TONE',
  'SLEEPER_POST_MAX_LENGTH',
  'POST_MAX_LENGTH',
  'INCLUDE_EMOJI',
  'SLEEPER_SEASON',
  'LEAGUE_SEASON',
  'FANTASY_WEEK',
  'ESPN_ROUTE',
]);

const WEEK_NAME = /^week-(\d+)$/;

/**
 * Every kind of history, in the order the file lists them: its key in the
 * file, the store kind it mirrors, and the names its entries may have.
 */
const HISTORY = [
  { key: 'raw', kind: 'raw', name: WEEK_NAME, names: 'week-<n>' },
  { key: 'import', kind: 'import', name: /^league$/, names: 'league' },
  { key: 'snapshots', kind: 'snapshots', name: WEEK_NAME, names: 'week-<n>' },
  { key: 'rankings', kind: 'rankings', name: /^(?:week-(\d+)|preseason|final)$/, names: 'week-<n>, preseason or final' },
  { key: 'predictions', kind: 'predictions', name: WEEK_NAME, names: 'week-<n>' },
  { key: 'market', kind: 'market', name: WEEK_NAME, names: 'week-<n>' },
  { key: 'tankWatch', kind: 'tank-watch', name: WEEK_NAME, names: 'week-<n>' },
  { key: 'editions', kind: 'editions', name: /^week-(\d+)-([a-z][a-z-]*)$/, names: 'week-<n>-<edition>' },
];
export const LEAGUE_FILE_HISTORY_KINDS = Object.freeze(HISTORY.map((entry) => entry.key));

const MAX_WEEK = 25;
const MIN_SEASON = 2000;
const MAX_SEASON = 2100;

const TOP_LEVEL_KEYS = ['schemaVersion', 'kind', 'writtenBy', 'writtenAt', 'league', 'settings', 'seasons'];
const SETTINGS_KEYS = [
  'displayName',
  'format',
  'season',
  'week',
  'espnRoute',
  'tone',
  'roastIntensity',
  'postFormat',
  'maxChars',
  'rankEmoji',
  'editorial',
  'rankings',
  'declared',
];
const DECLARED_KEYS = ['eliminations', 'rookieDraft', 'prospects'];
const POST_FORMATS = optionNamed('format').values;

/** The editorial.yml keys the named settings carry; the rest stay in `settings.editorial`. */
const NAMED_EDITORIAL = { tone: 'tone', roastIntensity: 'roast_intensity' };

/**
 * A league file that is refused: `field` is where in the file (dotted, as
 * `seasons.2026.rankings.week-3`). The message is the field, then `reason`
 * ("settings.week must be a whole number…"); with `{ whole: true }` the
 * reason is the whole message, for one that already names the field.
 */
export class LeagueFileError extends Error {
  constructor(field, reason, { whole = false } = {}) {
    super(field && !whole ? `${field} ${reason}` : reason);
    this.name = 'LeagueFileError';
    this.field = field;
  }
}

/* ------------------------------------------------------------- validation */

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const join = (...parts) => parts.filter((part) => part !== '').join('.');

function mapAt(field, value, what = 'a table of named entries') {
  if (!isMap(value)) throw new LeagueFileError(field, `must be ${what}`);
  return value;
}

function onlyKeys(field, value, keys) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new LeagueFileError(join(field, key), `is not part of a league file (expected only ${keys.join(', ')})`);
    }
  }
}

function requireKeys(field, value, keys) {
  for (const key of keys) {
    if (!(key in value)) throw new LeagueFileError(join(field, key), 'is missing');
  }
}

function stringOrNull(field, value) {
  if (value !== null && typeof value !== 'string') throw new LeagueFileError(field, 'must be text or null');
  return value;
}

function integerIn(field, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new LeagueFileError(field, `must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function seasonName(field, value) {
  if (!/^\d{4}$/.test(value) || Number(value) < MIN_SEASON || Number(value) > MAX_SEASON) {
    throw new LeagueFileError(field, `is not a season (a year from ${MIN_SEASON} to ${MAX_SEASON})`);
  }
  return value;
}

function checkWrittenBy(value) {
  mapAt('writtenBy', value, 'a table of package, version and surface');
  onlyKeys('writtenBy', value, ['package', 'version', 'surface']);
  requireKeys('writtenBy', value, ['package', 'version', 'surface']);
  for (const key of ['package', 'version', 'surface']) {
    if (typeof value[key] !== 'string' || value[key] === '') throw new LeagueFileError(`writtenBy.${key}`, 'must be text');
  }
}

function checkLeague(value) {
  mapAt('league', value, 'a table of provider and leagueId');
  onlyKeys('league', value, ['provider', 'leagueId']);
  requireKeys('league', value, ['provider', 'leagueId']);
  if (!PROVIDER_NAMES.includes(value.provider)) {
    throw new LeagueFileError('league.provider', `must be one of ${PROVIDER_NAMES.join(', ')}`);
  }
  if (value.leagueId !== null && (typeof value.leagueId !== 'string' || !/^\d{1,20}$/.test(value.leagueId))) {
    throw new LeagueFileError('league.leagueId', 'must be a league ID of 1 to 20 digits, or null');
  }
}

function checkRankEmoji(value) {
  const field = 'settings.rankEmoji';
  mapAt(field, value, 'a table with a mode');
  if (value.mode === 'default' || value.mode === 'none') {
    onlyKeys(field, value, ['mode']);
    return;
  }
  if (value.mode !== 'custom') throw new LeagueFileError(`${field}.mode`, 'must be default, custom or none');
  onlyKeys(field, value, ['mode', 'table']);
  const table = mapAt(`${field}.table`, value.table, 'a table of rank to emoji');
  if (!Object.keys(table).length) throw new LeagueFileError(`${field}.table`, 'must give at least one rank an emoji');
  for (const [rank, emoji] of Object.entries(table)) {
    if (!/^[1-9]\d{0,2}$/.test(rank)) throw new LeagueFileError(`${field}.table.${rank}`, 'is not a rank');
    if (!isSingleEmoji(emoji)) throw new LeagueFileError(`${field}.table.${rank}`, 'must be a single emoji');
  }
}

/** The settings layers a league file declares, as resolveSettings and loadConfig take them. */
export function settingsLayers(settings) {
  const editorial = { ...(settings.editorial ?? {}) };
  for (const [name, key] of Object.entries(NAMED_EDITORIAL)) {
    if (settings[name] !== null) editorial[key] = settings[name];
  }
  const output = { ...(editorial.output ?? {}) };
  if (settings.maxChars !== null) output.sleeper_max_chars = settings.maxChars;
  if (settings.rankEmoji.mode === 'none') output.include_emoji = false;
  if (settings.rankEmoji.mode === 'custom') {
    editorial.ranking_emoji = settings.rankEmoji.table;
    output.include_emoji = true;
  }
  if (Object.keys(output).length) editorial.output = output;
  const declared = settings.declared;
  return {
    editorial: Object.keys(editorial).length ? editorial : undefined,
    rankings: settings.rankings ?? undefined,
    guillotine: declared.eliminations === null ? undefined : { eliminations: declared.eliminations },
    rookieDraft: declared.rookieDraft ?? undefined,
  };
}

function checkSettings(settings, league) {
  const field = 'settings';
  mapAt(field, settings, 'a table of settings');
  onlyKeys(field, settings, SETTINGS_KEYS);
  requireKeys(field, settings, SETTINGS_KEYS);
  for (const key of ['displayName', 'tone', 'roastIntensity']) stringOrNull(`${field}.${key}`, settings[key]);
  if (settings.format !== null) {
    try {
      parseDeclaredFormatType(settings.format, { source: `${field}.format`, provider: providerDisplayName(league.provider) });
    } catch (error) {
      throw new LeagueFileError(`${field}.format`, error.message, { whole: true });
    }
    if (typeof settings.format !== 'string' || settings.format !== settings.format.toLowerCase().trim()) {
      throw new LeagueFileError(`${field}.format`, 'must be written in lower case');
    }
  }
  if (settings.season !== null) seasonName(`${field}.season`, settings.season);
  if (settings.week !== null) integerIn(`${field}.week`, settings.week, 0, MAX_WEEK);
  if (settings.espnRoute !== null) {
    if (league.provider !== 'espn') throw new LeagueFileError(`${field}.espnRoute`, 'is only for an ESPN league');
    if (!ESPN_ROUTES.includes(settings.espnRoute)) {
      throw new LeagueFileError(`${field}.espnRoute`, `must be one of ${ESPN_ROUTES.join(', ')}, or null`);
    }
  }
  if (!POST_FORMATS.includes(settings.postFormat)) {
    throw new LeagueFileError(`${field}.postFormat`, `must be one of ${POST_FORMATS.join(', ')}`);
  }
  if (settings.maxChars !== null) integerIn(`${field}.maxChars`, settings.maxChars, 1, 100_000);
  checkRankEmoji(settings.rankEmoji);
  for (const key of ['editorial', 'rankings']) {
    if (settings[key] !== null) mapAt(`${field}.${key}`, settings[key], 'a table, or null');
  }
  if (settings.editorial) {
    // Each of these has its own setting; carried twice, the two could disagree.
    // A ranking_emoji table may stay in editorial while emoji are switched off.
    const own = [...Object.values(NAMED_EDITORIAL), 'ranking_emoji', 'output.sleeper_max_chars', 'output.include_emoji'];
    for (const path of own) {
      const [head, tail] = path.split('.');
      const holder = tail ? settings.editorial[head] : settings.editorial;
      if (!isMap(holder) || !((tail ?? head) in holder)) continue;
      if (path === 'ranking_emoji' && settings.rankEmoji.mode === 'none') continue;
      throw new LeagueFileError(`${field}.editorial.${path}`, 'belongs in its own setting, not in editorial');
    }
  }

  const declared = mapAt(`${field}.declared`, settings.declared, 'a table of eliminations, rookieDraft and prospects');
  onlyKeys(`${field}.declared`, declared, DECLARED_KEYS);
  requireKeys(`${field}.declared`, declared, DECLARED_KEYS);
  for (const key of ['eliminations', 'rookieDraft']) {
    if (declared[key] !== null) mapAt(`${field}.declared.${key}`, declared[key], 'a table, or null');
  }
  mapAt(`${field}.declared.prospects`, declared.prospects, 'a table of draft year to board');
  for (const [year, board] of Object.entries(declared.prospects)) {
    const at = `${field}.declared.prospects.${year}`;
    seasonName(at, year);
    try {
      parseProspectBoard(board, { draftYear: Number(year), source: at });
    } catch (error) {
      throw new LeagueFileError(at, error.message, { whole: true });
    }
  }

  // The same merge and checks a league folder's files get: a bad weight set,
  // elimination ledger or draft order is refused here, not in the first run.
  // A declared format with a named preset is checked against that preset too,
  // as its first ranking would: one the format lacks, or a preset beside the
  // league's own set for the format (ranking or strength weights), is refused
  // here.
  try {
    const { rankings } = resolveSettings({ league: settingsLayers(settings) });
    if (settings.format !== null && rankings.preset !== null) {
      resolveRankingChoice(rankings, settings.format);
      resolveStrengthChoice(rankings, settings.format);
    }
  } catch (error) {
    throw new LeagueFileError(field, `${field} are refused: ${error.message}`, { whole: true });
  }
}

/** One history entry, checked for the shape its kind's readers rely on. */
function checkHistoryEntry(field, history, name, value) {
  const match = history.name.exec(name);
  if (!match) throw new LeagueFileError(field, `is not a ${history.key} entry (expected ${history.names})`);
  const week = match[1] === undefined ? null : Number(match[1]);
  if (week !== null && week > MAX_WEEK) throw new LeagueFileError(field, `names week ${week}; weeks run 0 to ${MAX_WEEK}`);
  mapAt(field, value, 'a table');

  const list = (key) => {
    if (!Array.isArray(value[key])) throw new LeagueFileError(`${field}.${key}`, 'must be a list');
  };
  switch (history.key) {
    case 'snapshots':
      if (value.week !== undefined && value.week !== week) {
        throw new LeagueFileError(`${field}.week`, `must be ${week}, the week the entry is named for`);
      }
      break;
    case 'rankings':
      list('rankings');
      break;
    case 'predictions':
      list('predictions');
      break;
    case 'tankWatch':
      if (!('draftOrder' in value)) throw new LeagueFileError(`${field}.draftOrder`, 'is missing');
      break;
    case 'import':
      if (!PROVIDER_NAMES.includes(value.provider)) {
        throw new LeagueFileError(`${field}.provider`, `must be one of ${PROVIDER_NAMES.join(', ')}`);
      }
      mapAt(`${field}.body`, value.body, 'the saved league page');
      break;
    case 'editions': {
      const task = match[2];
      if (!EDITIONS.some((edition) => edition.name === task)) {
        throw new LeagueFileError(field, `names "${task}", which is not an edition`);
      }
      if (typeof value.text !== 'string') throw new LeagueFileError(`${field}.text`, 'must be the reply text');
      if (value.task !== task) throw new LeagueFileError(`${field}.task`, `must be ${task}, the edition it is named for`);
      if (value.week !== week) throw new LeagueFileError(`${field}.week`, `must be ${week}, the week it is named for`);
      break;
    }
    default:
      break;
  }
}

function checkSeasons(seasons) {
  mapAt('seasons', seasons, 'a table of seasons');
  for (const [season, kinds] of Object.entries(seasons)) {
    const at = `seasons.${season}`;
    seasonName(at, season);
    mapAt(at, kinds, 'a table of kinds of history');
    onlyKeys(at, kinds, LEAGUE_FILE_HISTORY_KINDS);
    for (const history of HISTORY) {
      if (!(history.key in kinds)) continue;
      const entries = mapAt(`${at}.${history.key}`, kinds[history.key]);
      for (const [name, value] of Object.entries(entries)) {
        checkHistoryEntry(`${at}.${history.key}.${name}`, history, name, value);
      }
    }
  }
}

/**
 * Upgrades from each older schema version to the next. Keyed by the version
 * upgraded from; each returns the file at the next version. There is no older
 * version yet: v1 is the first.
 */
const MIGRATIONS = {};

function migrate(value) {
  let file = value;
  while (file.schemaVersion < LEAGUE_FILE_SCHEMA_VERSION) {
    const step = MIGRATIONS[file.schemaVersion];
    if (!step) {
      throw new LeagueFileError(
        'schemaVersion',
        `is ${file.schemaVersion}, which no version of Fantasy Pressbox wrote, so this file cannot be read`,
      );
    }
    file = step(file);
  }
  return file;
}

/**
 * Checks a parsed league file and returns it at the current schema version,
 * with every kind of history present in every season. An older schema version
 * is migrated; a newer one, an unknown key, kind or kind of history, or a
 * malformed entry is refused with a LeagueFileError naming the field.
 */
export function validateLeagueFile(value) {
  if (!isMap(value)) throw new LeagueFileError(null, 'A league file is a JSON object, and this is not one');
  if (value.kind !== LEAGUE_FILE_KIND) {
    throw new LeagueFileError(
      'kind',
      value.kind === undefined
        ? `is missing, so this is not a Fantasy Pressbox league file`
        : `is ${JSON.stringify(value.kind)}, so this is not a Fantasy Pressbox league file (expected "${LEAGUE_FILE_KIND}")`,
    );
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 0) {
    throw new LeagueFileError('schemaVersion', 'must be a whole number');
  }
  if (value.schemaVersion > LEAGUE_FILE_SCHEMA_VERSION) {
    throw new LeagueFileError(
      'schemaVersion',
      `is ${value.schemaVersion}: this league file was written by a newer version of Fantasy Pressbox, ` +
        `and this one (${PACKAGE_VERSION}) reads only version ${LEAGUE_FILE_SCHEMA_VERSION} and older. ` +
        'Update the package to read it: npm install -g fantasy-pressbox@latest',
    );
  }
  const file = migrate(value);
  onlyKeys('', file, TOP_LEVEL_KEYS);
  requireKeys('', file, TOP_LEVEL_KEYS);
  checkWrittenBy(file.writtenBy);
  if (typeof file.writtenAt !== 'string' || Number.isNaN(Date.parse(file.writtenAt))) {
    throw new LeagueFileError('writtenAt', 'must be a date and time');
  }
  checkLeague(file.league);
  checkSettings(file.settings, file.league);
  checkSeasons(file.seasons);

  const seasons = {};
  for (const [season, kinds] of Object.entries(file.seasons)) {
    seasons[season] = Object.fromEntries(HISTORY.map(({ key }) => [key, kinds[key] ?? {}]));
  }
  return { ...file, seasons };
}

/**
 * Reads a league file's text: the safe JSON reader (no prototype keys, and
 * the size, depth and string limits of LEAGUE_JSON_LIMITS), then
 * validateLeagueFile. `name` is how a refusal names the file.
 */
export function parseLeagueFile(text, { name = 'The league file' } = {}) {
  let value;
  try {
    value = parseJsonSafely(text, { file: name, limits: LEAGUE_JSON_LIMITS });
  } catch (error) {
    if (error instanceof SyntaxError) throw new LeagueFileError(null, `${name} is not JSON: ${error.message}`);
    throw error;
  }
  try {
    return validateLeagueFile(value);
  } catch (error) {
    if (error instanceof LeagueFileError) {
      throw new LeagueFileError(error.field, `${name} cannot be read: ${error.message}`, { whole: true });
    }
    throw error;
  }
}

/* ------------------------------------------------- personal data from ESPN */

/** A value shaped like an ESPN member ID (and the SWID cookie): a braced GUID. */
const MEMBER_ID = /\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}/i;

/** Keys whose value names a person: dropped from a saved ESPN page wherever they appear. */
const PERSONAL_KEYS = new Set(['firstName', 'lastName', 'owner', 'primaryOwner', 'memberId']);

/**
 * A saved ESPN page (or a raw week bundle built from one) without the people
 * in it, as the owner decided on 2026-10-13:
 *   - members[] and every team's owners[] are emptied: member IDs are in the
 *     same braced form as the SWID cookie and are probably the same value;
 *   - firstName, lastName, owner, primaryOwner and memberId are removed
 *     wherever they appear;
 *   - any other field holding a braced-GUID value is removed too, and a
 *     braced GUID in a list of text is dropped from it.
 * Nothing the code reads is lost: no edition names an ESPN manager
 * (docs/espn-data.md, managerNames), and the shape guards accept an empty
 * members[] and owners[]. Returns a new value; the one given is not changed.
 */
export function stripEspnPersonalData(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(typeof item === 'string' && MEMBER_ID.test(item)))
      .map((item) => stripEspnPersonalData(item));
  }
  if (!isMap(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (PERSONAL_KEYS.has(key)) continue;
    if (typeof item === 'string' && MEMBER_ID.test(item)) continue;
    if ((key === 'members' || key === 'owners') && Array.isArray(item)) {
      out[key] = [];
      continue;
    }
    out[key] = stripEspnPersonalData(item);
  }
  return out;
}

const isEspnPage = (value) => isMap(value) && value.provider === 'espn';

/** The first field holding a braced-GUID value, as a dotted path, or null. */
function findMemberId(value, path = []) {
  if (typeof value === 'string') return MEMBER_ID.test(value) ? path.join('.') || 'the file' : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findMemberId(value[i], [...path, i]);
      if (found) return found;
    }
    return null;
  }
  if (isMap(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (MEMBER_ID.test(key)) return [...path, key].join('.');
      const found = findMemberId(item, [...path, key]);
      if (found) return found;
    }
  }
  return null;
}

/* ------------------------------------------------------- making and writing */

/** Settings that declare nothing: every package default applies. */
function blankSettings() {
  return {
    displayName: null,
    format: null,
    season: null,
    week: null,
    espnRoute: null,
    tone: null,
    roastIntensity: null,
    postFormat: optionNamed('format').default,
    maxChars: null,
    rankEmoji: { mode: 'default' },
    editorial: null,
    rankings: null,
    declared: { eliminations: null, rookieDraft: null, prospects: {} },
  };
}

function writtenByFor(surface) {
  return { package: PACKAGE_NAME, version: PACKAGE_VERSION, surface };
}

/**
 * A league file with no history and default settings. `leagueId` null is the
 * blank template; `surface` is who is writing it ('cli', 'web').
 */
export function newLeagueFile({ provider = 'sleeper', leagueId = null, surface, writtenAt = new Date().toISOString() } = {}) {
  if (!surface) throw new TypeError('newLeagueFile needs the surface writing it, such as "cli" or "web"');
  return validateLeagueFile({
    schemaVersion: LEAGUE_FILE_SCHEMA_VERSION,
    kind: LEAGUE_FILE_KIND,
    writtenBy: writtenByFor(surface),
    writtenAt,
    league: { provider, leagueId },
    settings: blankSettings(),
    seasons: {},
  });
}

/**
 * A league file's text, ready to save. It is checked first, so nothing that
 * parseLeagueFile would refuse is ever written, and refused outright if any
 * value is shaped like an ESPN member ID. Refused as well when the text is
 * over LEAGUE_JSON_LIMITS.maxBytes, which parseLeagueFile and import-league
 * would refuse to read back.
 *
 * Written without indentation: indenting more than doubled a full invented
 * season (2.6 MB unindented, 6.5 MB indented; scripts/measure-league-file.mjs),
 * and the file is for carrying a league, not for reading by eye.
 */
export function serializeLeagueFile(file) {
  const checked = validateLeagueFile(file);
  const memberId = findMemberId(checked);
  if (memberId) {
    throw new LeagueFileError(memberId, 'holds a value shaped like an ESPN member ID, which a league file never carries');
  }
  const text = `${JSON.stringify(checked)}\n`;
  const bytes = utf8Length(text);
  if (bytes > LEAGUE_JSON_LIMITS.maxBytes) {
    throw new LeagueFileError(
      '',
      `The league file would be ${megabytes(bytes)} MB, over the ${megabytes(LEAGUE_JSON_LIMITS.maxBytes)} MB a league file may be. ` +
        'It was not written, because neither the command line nor the website could read it back.',
      { whole: true },
    );
  }
  return text;
}

const megabytes = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * A league file's history as a memory store's data (createMemoryStore in
 * src/storeCore.mjs): `data[kind][season]['<name>.json']`.
 */
export function storeDataFromLeagueFile(file) {
  const data = {};
  for (const [season, kinds] of Object.entries(file.seasons)) {
    for (const { key, kind } of HISTORY) {
      for (const [name, value] of Object.entries(kinds[key] ?? {})) {
        data[kind] ??= {};
        data[kind][season] ??= {};
        data[kind][season][`${name}.json`] = value;
      }
    }
  }
  return data;
}

/* ---------------------------------------------------- league folder mapping */

const CONFIG_FILES = {
  'config/editorial.yml': 'editorial',
  'config/rankings.yml': 'rankings',
  'config/rookie-draft.yml': 'rookieDraft',
  'config/guillotine.yml': 'guillotine',
};
const PROSPECTS_FILE = /^config\/prospects\.(\d{4})\.yml$/;
const DATA_FILE = /^data\/([a-z-]+)\/(\d{4})\/([^/]+)\.json$/;

/** A path that is safe to look up: relative, forward slashes, no `..`, no NUL. */
function isPlainPath(path) {
  return (
    typeof path === 'string' &&
    path !== '' &&
    !path.startsWith('/') &&
    !/[\\\0]/.test(path) &&
    !path.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

/**
 * Whether leagueFileFromWorkspace reads the file at `path` (relative to the
 * league folder). A caller listing a folder opens only these, and lists the
 * rest as skipped without reading them.
 */
export function readsLeagueFolderPath(path) {
  if (!isPlainPath(path)) return false;
  if (path === '.env' || CONFIG_FILES[path] || PROSPECTS_FILE.test(path)) return true;
  const data = DATA_FILE.exec(path);
  const history = data ? HISTORY.find(({ kind }) => kind === data[1]) : null;
  return Boolean(history && history.name.test(data[3]));
}

function readYamlEntry(path, text) {
  try {
    return parseYaml(text) ?? {};
  } catch (error) {
    throw new LeagueFileError(null, `Could not read ${path}: ${error.message}`);
  }
}

const TRUE_TEXT = /^(1|true|yes|on)$/i;

/** A whole number from .env, or a refusal naming the key. */
function envInteger(key, value) {
  if (!/^\d+$/.test(value)) throw new LeagueFileError(null, `${key} in .env is "${value}", which is not a whole number`);
  return Number.parseInt(value, 10);
}

/** The named settings and the rest of editorial.yml, from the .env values and the parsed editorial.yml. */
function settingsFromFolder(env, league, layers) {
  const editorial = isMap(layers.editorial) ? { ...layers.editorial } : {};
  const output = isMap(editorial.output) ? { ...editorial.output } : {};

  const postMaxLength = firstSet(env, ['POST_MAX_LENGTH', 'SLEEPER_POST_MAX_LENGTH']);
  const maxChars = postMaxLength !== null ? envInteger('POST_MAX_LENGTH', postMaxLength) : output.sleeper_max_chars ?? null;
  delete output.sleeper_max_chars;

  const emojiFromEnv = firstSet(env, ['INCLUDE_EMOJI']);
  const includeEmoji = emojiFromEnv !== null ? TRUE_TEXT.test(emojiFromEnv) : output.include_emoji ?? true;
  delete output.include_emoji;
  if (Object.keys(output).length) editorial.output = output;
  else delete editorial.output;

  // An empty `ranking_emoji:` line declares no table.
  if (editorial.ranking_emoji === null) delete editorial.ranking_emoji;
  let rankEmoji = { mode: 'default' };
  if (includeEmoji === false) {
    // The table, if any, stays in editorial: switched off, not forgotten.
    rankEmoji = { mode: 'none' };
  } else if (isMap(editorial.ranking_emoji)) {
    rankEmoji = { mode: 'custom', table: editorial.ranking_emoji };
    delete editorial.ranking_emoji;
  }

  const named = {};
  for (const [name, key] of Object.entries(NAMED_EDITORIAL)) {
    named[name] = editorial[key] ?? null;
    delete editorial[key];
  }
  const tone = firstSet(env, ['PRESSBOX_TONE']) ?? named.tone;

  const week = firstSet(env, ['FANTASY_WEEK']);
  const format = firstSet(env, ['LEAGUE_FORMAT']);
  return {
    displayName: firstSet(env, ['LEAGUE_DISPLAY_NAME']),
    format: format === null ? null : parseDeclaredFormatType(format, { provider: providerDisplayName(league.provider) }),
    season: league.season,
    week: week === null ? null : envInteger('FANTASY_WEEK', week),
    espnRoute: league.provider === 'espn' && firstSet(env, ['ESPN_ROUTE']) !== null ? league.route : null,
    tone,
    roastIntensity: named.roastIntensity,
    postFormat: optionNamed('format').default,
    maxChars,
    rankEmoji,
    editorial: Object.keys(editorial).length ? editorial : null,
    rankings: isMap(layers.rankings) ? layers.rankings : null,
    declared: {
      eliminations: isMap(layers.guillotine?.eliminations) ? layers.guillotine.eliminations : null,
      rookieDraft: isMap(layers.rookieDraft) ? layers.rookieDraft : null,
      prospects: layers.prospects,
    },
  };
}

/**
 * Builds a league file from a league folder's files, given as `{ path, text }`
 * pairs with paths relative to the folder (`.env`, `config/rankings.yml`,
 * `data/rankings/2026/week-3.json`). Reads an allowlist only:
 *   - from .env, LEAGUE_FILE_ENV_KEYS; every other line is dropped as it is read;
 *   - config/editorial.yml, rankings.yml, rookie-draft.yml, guillotine.yml and
 *     prospects.<YYYY>.yml;
 *   - data/<kind>/<YYYY>/<name>.json for every kind of history.
 * Everything else, data/cache/ among it, is listed in `skipped` and never
 * opened. A file that cannot be read refuses the whole folder, naming it.
 *
 * → `{ leagueFile, skipped, ignoredEnvKeys }`: `ignoredEnvKeys` names the
 *   .env keys that were dropped (never their values), so a caller can say so.
 */
export function leagueFileFromWorkspace(entries, { surface, writtenAt = new Date().toISOString() } = {}) {
  if (!surface) throw new TypeError('leagueFileFromWorkspace needs the surface writing it, such as "cli" or "web"');
  const byPath = new Map();
  const skipped = [];
  for (const entry of entries) {
    if (!isPlainPath(entry?.path)) {
      skipped.push(String(entry?.path));
      continue;
    }
    if (byPath.has(entry.path)) throw new LeagueFileError(null, `${entry.path} was given twice`);
    if (typeof entry.text !== 'string') throw new LeagueFileError(null, `${entry.path} has no text`);
    byPath.set(entry.path, entry.text);
  }
  if (!byPath.has('.env')) {
    throw new LeagueFileError(null, 'There is no .env, so this is not a league folder: the .env says which league it covers');
  }

  const { values: env, ignored: ignoredEnvKeys } = parseEnvAllowlist(byPath.get('.env'), LEAGUE_FILE_ENV_KEYS);
  const league = leagueSettingsFromEnv(env);

  const layers = { prospects: {} };
  const seasons = {};
  const historyByKind = new Map(HISTORY.map((history) => [history.kind, history]));
  for (const [path, text] of byPath) {
    if (path === '.env') continue;
    if (CONFIG_FILES[path]) {
      layers[CONFIG_FILES[path]] = readYamlEntry(path, text);
      continue;
    }
    const prospects = PROSPECTS_FILE.exec(path);
    if (prospects) {
      layers.prospects[prospects[1]] = readYamlEntry(path, text);
      continue;
    }
    const data = DATA_FILE.exec(path);
    const history = data ? historyByKind.get(data[1]) : null;
    if (!history || !history.name.test(data[3])) {
      skipped.push(path);
      continue;
    }
    const [, , season, name] = data;
    let value;
    try {
      value = parseJsonSafely(text, { file: path, limits: LEAGUE_JSON_LIMITS });
    } catch (error) {
      if (error instanceof SyntaxError) throw new LeagueFileError(null, `Could not read ${path}: it is not JSON`);
      throw error;
    }
    if ((history.key === 'raw' || history.key === 'import') && isEspnPage(value)) value = stripEspnPersonalData(value);
    seasons[season] ??= {};
    seasons[season][history.key] ??= {};
    seasons[season][history.key][name] = value;
  }

  const file = {
    schemaVersion: LEAGUE_FILE_SCHEMA_VERSION,
    kind: LEAGUE_FILE_KIND,
    writtenBy: writtenByFor(surface),
    writtenAt,
    league: { provider: league.provider, leagueId: league.id || null },
    settings: settingsFromFolder(env, league, layers),
    seasons: sortedSeasons(seasons),
  };
  let leagueFile;
  try {
    leagueFile = validateLeagueFile(file);
  } catch (error) {
    throw inFolderTerms(error);
  }
  return { leagueFile, skipped: skipped.sort(), ignoredEnvKeys };
}

/** A refusal of a history entry, naming the data/ file it was read from. */
function inFolderTerms(error) {
  const at = error instanceof LeagueFileError ? /^seasons\.(\d{4})\.(\w+)\.([^.]+)(?:\.(.+))?$/.exec(error.field ?? '') : null;
  const history = at ? HISTORY.find(({ key }) => key === at[2]) : null;
  if (!history) return error;
  const reason = error.message.slice(error.field.length + 1);
  const path = `data/${history.kind}/${at[1]}/${at[3]}.json`;
  return new LeagueFileError(error.field, `Could not read ${path}: ${at[4] ? `${at[4]} ` : ''}${reason}`, { whole: true });
}

/** Seasons, kinds and entries in a stable order, so the same folder writes the same file. */
function sortedSeasons(seasons) {
  const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  return Object.fromEntries(
    Object.keys(seasons)
      .sort(byName)
      .map((season) => [
        season,
        Object.fromEntries(
          HISTORY.map(({ key }) => [
            key,
            Object.fromEntries(Object.keys(seasons[season][key] ?? {}).sort(byName).map((name) => [name, seasons[season][key][name]])),
          ]),
        ),
      ]),
  );
}

/** One .env line, quoted when it has to be; a value no .env line can hold is refused. */
function envLine(key, value) {
  const text = String(value);
  if (/[\r\n]/.test(text)) throw new LeagueFileError(null, `${key} holds a line break, which a .env line cannot`);
  if (/^[A-Za-z0-9_.,:/@+-]*$/.test(text)) return `${key}=${text}`;
  if (!text.includes('"')) return `${key}="${text}"`;
  if (!text.includes("'")) return `${key}='${text}'`;
  throw new LeagueFileError(null, `${key} holds both kinds of quote, which a .env line cannot`);
}

/**
 * The league folder a league file describes, as `{ path, text }` pairs: the
 * .env, the config files the settings declare, and every data/ file. Each
 * data file is written as the file store writes it, so a folder exported and
 * imported again has the same data/ files byte for byte.
 */
export function workspaceFromLeagueFile(value) {
  const file = validateLeagueFile(value);
  const { league, settings } = file;
  const env = [
    '# Written by fantasy-pressbox import-league from a league file.',
    '# Add your AI key below if you use --generate; a league file never holds one.',
    envLine('LEAGUE_PROVIDER', league.provider),
    envLine(LEAGUE_ID_KEYS[league.provider], league.leagueId ?? ''),
  ];
  if (settings.season !== null) env.push(envLine('LEAGUE_SEASON', settings.season));
  if (settings.week !== null) env.push(envLine('FANTASY_WEEK', settings.week));
  if (settings.format !== null) env.push(envLine('LEAGUE_FORMAT', settings.format));
  if (settings.displayName !== null) env.push(envLine('LEAGUE_DISPLAY_NAME', settings.displayName));
  if (settings.espnRoute !== null) env.push(envLine('ESPN_ROUTE', settings.espnRoute));
  if (settings.tone !== null) env.push(envLine('PRESSBOX_TONE', settings.tone));
  if (settings.maxChars !== null) env.push(envLine('POST_MAX_LENGTH', settings.maxChars));
  if (settings.rankEmoji.mode === 'none') env.push(envLine('INCLUDE_EMOJI', 'false'));

  const entries = [{ path: '.env', text: `${env.join('\n')}\n` }];
  const yaml = (path, body) => {
    try {
      entries.push({ path, text: stringifyYaml(body) });
    } catch (error) {
      throw new LeagueFileError(null, `Could not write ${path}: ${error.message}`);
    }
  };

  const editorial = { ...(settings.editorial ?? {}) };
  if (settings.roastIntensity !== null) editorial.roast_intensity = settings.roastIntensity;
  if (settings.rankEmoji.mode === 'custom') editorial.ranking_emoji = settings.rankEmoji.table;
  if (Object.keys(editorial).length) yaml('config/editorial.yml', editorial);
  if (settings.rankings) yaml('config/rankings.yml', settings.rankings);
  if (settings.declared.rookieDraft) yaml('config/rookie-draft.yml', settings.declared.rookieDraft);
  if (settings.declared.eliminations) yaml('config/guillotine.yml', { eliminations: settings.declared.eliminations });
  for (const [year, board] of Object.entries(settings.declared.prospects)) yaml(`config/prospects.${year}.yml`, board);

  for (const [season, kinds] of Object.entries(file.seasons)) {
    for (const { key, kind } of HISTORY) {
      for (const [name, entry] of Object.entries(kinds[key])) {
        entries.push({ path: `data/${kind}/${season}/${name}.json`, text: `${JSON.stringify(entry, null, 2)}\n` });
      }
    }
  }
  return entries;
}

/** A file name for a league file: `<display-name-slug>.fantasy-pressbox.json`. */
export function leagueFileName(file) {
  const slug = (file.settings.displayName ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const name = slug || `${file.league.provider}-${file.league.leagueId ?? 'league'}`;
  return `${name}.fantasy-pressbox.json`;
}
