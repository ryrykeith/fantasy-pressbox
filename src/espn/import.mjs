/**
 * ESPN's manual import route (ESPN_ROUTE=import, the default).
 *
 * The operator opens ESPN's own JSON addresses (src/espn/urls.mjs,
 * espnImportLinks) in their own signed-in browser and saves each page. This
 * module reads the saved text. Nothing here contacts ESPN, and nothing here
 * reads a cookie: the route needs none.
 *
 * SAVED FILES ARE UNTRUSTED. Each one is refused, naming the file, when it is
 * too large, is not JSON, does not hold a JSON object, holds a key named
 * __proto__, constructor or prototype, is for another league or season, or
 * does not match its documented shape (src/espn/shape.mjs). No value from a
 * file is echoed in a refusal.
 *
 * Copying ESPN's data is the operator's own manual, personal use. Nothing
 * here, or in the docs, says ESPN permits it (docs/espn-data.md, "Importing
 * saved files").
 *
 * NODE-FREE: this module and everything it imports use no node: module, so
 * the browser core can reuse it. Reading files and saving them is the
 * provider's job (src/espn/provider.mjs).
 */
import { unnamedPlayer } from '../league/players.mjs';
import { matchupPeriodFor, normalizeLeague, normalizePlayer, normalizeTeams } from './normalize.mjs';
import {
  guardDraftDetail,
  guardRosters,
  guardSchedule,
  guardSettings,
  guardTeams,
  guardTransactions,
} from './shape.mjs';
import { espnImportLinks } from './urls.mjs';

/** The largest saved file read, in bytes. A week with every lineup is well under it. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** Keys that could reach an object's prototype if anything merged the parsed file. */
const HOSTILE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** What each saved file is: the three addresses espnImportLinks lists. */
export const IMPORT_KINDS = Object.freeze({
  league: 'the league address (settings, teams, rosters, draft)',
  matchups: "a week's matchups address (lineups and scores)",
  transactions: "a week's transactions address",
});

/** A saved file this route refuses. The message names the file. */
export class EspnImportError extends Error {
  constructor(message, { file = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'EspnImportError';
    this.file = file;
  }
}

class HostileKeyError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value);

/** UTF-8 length without allocating the encoded text. */
function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * One saved file's text as a JSON object. `file` is how the file is named in
 * a refusal (its path).
 */
export function parseSavedFile(text, { file }) {
  if (typeof text !== 'string') throw new TypeError('parseSavedFile needs the file text');
  if (text.length > MAX_IMPORT_BYTES || utf8Length(text) > MAX_IMPORT_BYTES) {
    throw new EspnImportError(
      `${file} is larger than ${MAX_IMPORT_BYTES / (1024 * 1024)} MB, so it was not read. ` +
        'A saved ESPN league or week is far smaller: check that this is the right file.',
      { file },
    );
  }
  let body;
  try {
    // A browser may save a byte order mark ahead of the JSON.
    body = JSON.parse(text.replace(/^﻿/, ''), (key, value) => {
      if (HOSTILE_KEYS.has(key)) throw new HostileKeyError(key);
      return value;
    });
  } catch (error) {
    if (error instanceof HostileKeyError) {
      throw new EspnImportError(
        `${file} holds a key named "${error.key}", which no ESPN response has. ` +
          'It was refused as unsafe to read. Save the page from ESPN again.',
        { file },
      );
    }
    throw new EspnImportError(
      `${file} is not JSON. Open the ESPN address in your browser and save the page as it is shown ` +
        '(the raw JSON text), not as a web page around it.',
      { file },
    );
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new EspnImportError(`${file} must hold a JSON object, the way ESPN's league addresses answer; it holds ${typeOf(body)}.`, {
      file,
    });
  }
  return body;
}

/**
 * Which address a saved body came from, by what it holds: a league's teams
 * and draft, a week's schedule, or a week's transactions. A body that looks
 * like none, or like more than one, is refused.
 */
export function classifySaved(body, { file }) {
  const has = (key) => Object.hasOwn(body, key);
  const kinds = [];
  if (has('draftDetail') || has('members')) kinds.push('league');
  if (has('schedule')) kinds.push('matchups');
  if (has('transactions')) kinds.push('transactions');
  if (kinds.length === 1) return kinds[0];
  const expected = Object.values(IMPORT_KINDS).join('; ');
  throw new EspnImportError(
    kinds.length === 0
      ? `${file} is not one of the ESPN pages the import reads. Expected one of: ${expected}.`
      : `${file} holds more than one kind of ESPN page (${kinds.join(', ')}). Save each address on its own: ${expected}.`,
    { file },
  );
}

/** Runs a shape guard or normalizer, naming the file in whatever it refuses. */
function inFile(file, check) {
  try {
    return check();
  } catch (error) {
    if (error instanceof EspnImportError) throw error;
    if (error instanceof TypeError || error instanceof RangeError) throw error;
    throw new EspnImportError(`${file}: ${error.message}`, { file, cause: error });
  }
}

/** The file must be for ESPN_LEAGUE_ID and LEAGUE_SEASON. The league ID found is never echoed. */
function checkLeagueAndSeason(body, { file, leagueId, season }) {
  const id = body.id;
  if (id === undefined || id === null) {
    throw new EspnImportError(
      `${file} names no league ID, so it cannot be checked against ESPN_LEAGUE_ID (${leagueId}). ` +
        'Save the page from the address the import lists for this league.',
      { file },
    );
  }
  if (!(typeof id === 'number' || typeof id === 'string') || String(id) !== String(leagueId)) {
    throw new EspnImportError(
      `${file} is for another ESPN league, not ESPN_LEAGUE_ID (${leagueId}). ` +
        'A league folder holds one league: save the pages for this league, or check ESPN_LEAGUE_ID in .env.',
      { file },
    );
  }
  if (body.seasonId !== Number(season)) {
    const found = Number.isInteger(body.seasonId) ? `the ${body.seasonId} season` : 'no season';
    throw new EspnImportError(`${file} is for ${found}, not LEAGUE_SEASON (${season}).`, { file });
  }
}

/** A saved league page: guarded, and normalized once so a league this version refuses is refused now. */
function readLeague(body, { file, leagueId, declaredFormatType }) {
  inFile(file, () => {
    guardSettings(body);
    guardDraftDetail(body);
    guardTeams(body, { faab: body.settings.acquisitionSettings.isUsingAcquisitionBudget });
    guardRosters(body);
    normalizeLeague({ mSettings: body, mDraftDetail: body }, { leagueId, declaredFormatType });
    normalizeTeams({ mTeam: body, mRoster: body, mSettings: body });
  });
  return body;
}

/** Every lineup entry in the week's own matchup period. */
function periodEntries(body, periodId) {
  return body.schedule
    .filter((m) => m.matchupPeriodId === periodId)
    .flatMap((m) => [m.home, m.away])
    .filter(Boolean)
    .flatMap((side) => side.rosterForCurrentScoringPeriod?.entries ?? []);
}

/**
 * A saved week's matchups page for `week`. The body's own top-level
 * scoringPeriodId is the league's current period, not the one asked for
 * (doc, "Working out the week"), so the week comes from the operator and the
 * body must agree: the week is in one of the league's matchup periods, and
 * the lineups carry stats for that scoring period.
 */
function readMatchups(body, { file, week }) {
  return inFile(file, () => {
    guardSettings(body);
    const period = matchupPeriodFor(body.settings.scheduleSettings, week);
    if (!period) {
      throw new EspnImportError(
        `${file}: week ${week} is in none of this league's matchup periods (scheduleSettings.matchupPeriods), ` +
          'so it is not a week of this season. Check --week.',
        { file },
      );
    }
    guardSchedule(body, { week, matchupPeriodId: period.id });
    const entries = periodEntries(body, period.id);
    const forWeek = entries.some((entry) => entry.playerPoolEntry.player.stats.some((s) => s && s.scoringPeriodId === week));
    if (!forWeek) {
      throw new EspnImportError(
        `${file} does not hold the lineups for week ${week}: no player in them has a stats entry for scoring ` +
          `period ${week}. Save the matchups address for week ${week}, or check --week.`,
        { file },
      );
    }
    return body;
  });
}

/** A saved week's transactions page. Every transaction in it must be for `week` (doc: one scoring period). */
function readTransactions(body, { file, week }) {
  return inFile(file, () => {
    guardTransactions(body);
    if (body.transactions.some((t) => t.scoringPeriodId !== week)) {
      throw new EspnImportError(
        `${file} lists transactions from a scoring period other than week ${week}, so it is not the transactions ` +
          `address for week ${week}. Save that address, or check --week.`,
        { file },
      );
    }
    return body;
  });
}

/**
 * Reads a set of saved files: at most one of each kind. Every file is checked
 * before anything is returned, so a bad file stops the whole import.
 *
 * @param {{ file: string, text: string }[]} files
 * @param {{ leagueId: string, season: string|number, week?: number|null, declaredFormatType?: string|null }} options
 * @returns {{ league: object|null, matchups: object|null, transactions: object|null, files: Record<string, string> }}
 *          `files` maps each kind found to the file it came from.
 */
export function readSavedFiles(files, { leagueId, season, week = null, declaredFormatType = null }) {
  if (!leagueId) throw new EspnImportError('No ESPN league ID configured. Set ESPN_LEAGUE_ID in .env.');
  if (!/^\d{4}$/.test(String(season ?? ''))) {
    throw new EspnImportError('No ESPN season configured. Set LEAGUE_SEASON in .env (a four-digit year).');
  }
  if (week !== null && (!Number.isInteger(week) || week < 1)) {
    throw new EspnImportError('--week must be a week number (1, 2, 3, ...).');
  }

  const found = { league: null, matchups: null, transactions: null };
  const from = {};
  for (const { file, text } of files) {
    const body = parseSavedFile(text, { file });
    const kind = classifySaved(body, { file });
    if (found[kind]) {
      throw new EspnImportError(`${from[kind]} and ${file} are both ${IMPORT_KINDS[kind]}. Import one of each at a time.`, {
        file,
      });
    }
    if (kind !== 'league' && week === null) {
      throw new EspnImportError(
        `${file} is ${IMPORT_KINDS[kind]}, and the week it is for must be given: add --week <n>. ` +
          "ESPN's saved page does not say which week was asked for.",
        { file },
      );
    }
    inFile(file, () => checkLeagueAndSeason(body, { file, leagueId, season }));
    if (kind === 'league') readLeague(body, { file, leagueId, declaredFormatType });
    else if (kind === 'matchups') readMatchups(body, { file, week });
    else readTransactions(body, { file, week });
    found[kind] = body;
    from[kind] = file;
  }
  return { ...found, files: from };
}

/**
 * The week bundle the import saves: the same `{ leagueId, week, matchups,
 * transactions }` fetchWeek returns, stamped `importedAt` instead of
 * `fetchedAt`. `transactions` is null when that file was not imported, and
 * the week's transactions then read as unavailable (normalizeWeek).
 */
export function importedWeekBundle({ leagueId, week, matchups, transactions = null, importedAt }) {
  return { importedAt, leagueId: String(leagueId), week, matchups, transactions };
}

/**
 * The latest scoring period any saved page shows: the league's current
 * period as of the newest save. A week is settled only once this is past it
 * (plan risk R6), so a week saved while still being played stays unsettled
 * until a later save shows the period has moved on. The furthest period seen
 * is used, so re-importing an older page never un-settles a week: `seen` is
 * the furthest any earlier league page showed (the import record keeps it).
 */
export function latestScoringPeriod({ league = null, bundles = [], seen = null } = {}) {
  const periods = [league?.scoringPeriodId, seen];
  for (const bundle of bundles) periods.push(bundle?.matchups?.scoringPeriodId, bundle?.transactions?.scoringPeriodId);
  const known = periods.filter(Number.isInteger);
  return known.length === 0 ? null : Math.max(...known);
}

/**
 * Is the saved league page behind the other saved pages? The league page
 * holds the standings, records, points-for, rosters, settings and draft; the
 * week pages hold only their week. A league page saved at period 3 next to a
 * week page saved at period 6 would put week 5's scores beside week-2
 * standings, so every edition on the import route refuses a stale one
 * (owner decision, 2026-10-13) rather than compute around it.
 *
 * `seen` is the furthest period any earlier league page showed: replacing the
 * league page with an older save makes it stale too.
 *
 * → { leaguePeriod, latestPeriod, stale, latestFrom } where `latestFrom` says
 *   which saved page showed `latestPeriod`: `{ kind: 'week', week }`, or
 *   `{ kind: 'league' }` when only an earlier league page did.
 */
export function leaguePageFreshness({ league = null, bundles = [], seen = null } = {}) {
  const leaguePeriod = Number.isInteger(league?.scoringPeriodId) ? league.scoringPeriodId : null;
  const latestPeriod = latestScoringPeriod({ league, bundles, seen });
  let latestFrom = null;
  for (const bundle of bundles) {
    const periods = [bundle?.matchups?.scoringPeriodId, bundle?.transactions?.scoringPeriodId];
    if (periods.includes(latestPeriod) && (latestFrom === null || bundle.week > latestFrom.week)) {
      latestFrom = { kind: 'week', week: bundle.week };
    }
  }
  if (latestFrom === null && latestPeriod !== null && latestPeriod !== leaguePeriod) latestFrom = { kind: 'league' };
  const stale = leaguePeriod !== null && latestPeriod !== null && leaguePeriod < latestPeriod;
  return { leaguePeriod, latestPeriod, stale, latestFrom: stale ? latestFrom : null };
}

/** The sentence that says how far behind the league page is. */
function stalenessSentence({ leaguePeriod, latestPeriod, latestFrom }) {
  const newer =
    latestFrom?.kind === 'week'
      ? `the latest week page (week ${latestFrom.week}) at scoring period ${latestPeriod}`
      : `an earlier save of the league page showed scoring period ${latestPeriod}`;
  return (
    `The league page (standings and rosters) was saved at scoring period ${leaguePeriod}, ` +
    `${latestFrom?.kind === 'week' ? 'and ' : 'but '}${newer}. ` +
    "Its standings, records, points-for and rosters are older than the weeks you imported, and they are never " +
    "mixed with a newer week's scores."
  );
}

/** A stale league page, refused by every edition on the import route. */
export class EspnStaleLeagueError extends EspnImportError {
  constructor(message, { leaguePeriod, latestPeriod }) {
    super(message);
    this.name = 'EspnStaleLeagueError';
    this.leaguePeriod = leaguePeriod;
    this.latestPeriod = latestPeriod;
  }
}

/**
 * The refusal an edition gives for a stale league page (leaguePageFreshness):
 * both periods, the league address to save again and the command to import it.
 */
export function staleLeagueError({ leagueId, season, freshness }) {
  return new EspnStaleLeagueError(
    `${stalenessSentence(freshness)} Save the league page again, then import it.\n\n` +
      importInstructions({ leagueId, season }),
    freshness,
  );
}

/**
 * What import-espn prints when the league page is behind after an import:
 * the same explanation, then every address for the week's routine together
 * (the league page and `week`'s two pages), so the next save is one sitting.
 */
export function staleLeagueNotice({ leagueId, season, freshness, week = null }) {
  return (
    `${stalenessSentence(freshness)}\n` +
    'Every edition refuses until the league page is saved again and imported. ' +
    `This week's routine is all of these pages together:\n\n` +
    importInstructions({ leagueId, season, week })
  );
}

/** The saved league page as of `period`: what openLeague reads under the import route. */
export function leagueAsOf(body, period) {
  return Number.isInteger(period) && period > body.scoringPeriodId ? { ...body, scoringPeriodId: period } : body;
}

const lineupPlayers = (matchups) =>
  (matchups?.schedule ?? [])
    .flatMap((m) => [m.home, m.away])
    .filter(Boolean)
    .flatMap((side) => side.rosterForCurrentScoringPeriod?.entries ?? [])
    .map((entry) => entry.playerPoolEntry.player);

const rosterPlayers = (league) =>
  (league?.teams ?? []).flatMap((team) => team.roster?.entries ?? []).map((entry) => entry.playerPoolEntry.player);

/**
 * The player dictionary under the import route, without a player list: the
 * players list address needs a header a browser cannot send (doc, "Players").
 *
 * Built from the `playerPoolEntry.player` records in the league page's
 * rosters and in every saved week's lineups, oldest save first so the newest
 * record of a player wins (the league page wins a tie). A player who appears
 * only in a transaction is in no roster, so his name is not on file: he gets
 * unnamedPlayer, which prints as "name unavailable", never as his ESPN ID.
 */
export function importedPlayers({ league = null, bundles = [] } = {}) {
  const sources = [];
  bundles.forEach((bundle, i) => {
    if (bundle?.matchups) sources.push({ period: bundle.matchups.scoringPeriodId, order: i, players: lineupPlayers(bundle.matchups) });
  });
  if (league) sources.push({ period: league.scoringPeriodId, order: bundles.length, players: rosterPlayers(league) });
  sources.sort((a, b) => a.period - b.period || a.order - b.order);

  const players = {};
  for (const source of sources) for (const player of source.players) players[String(player.id)] = normalizePlayer(player);
  for (const bundle of bundles) {
    for (const txn of bundle?.transactions?.transactions ?? []) {
      for (const item of txn.items) {
        const id = String(item.playerId);
        if (!players[id]) players[id] = unnamedPlayer(id);
      }
    }
  }
  return players;
}

/**
 * What to open and save, and the command that imports it, as lines of text.
 * Used by every refusal that sends the operator to the import.
 */
export function importInstructions({ leagueId, season, week = null }) {
  const links = espnImportLinks({ leagueId, season, weeks: week === null ? [] : [week] });
  const lines = [
    'ESPN_ROUTE is import: Fantasy Pressbox never contacts ESPN. It reads pages you save yourself, for your own',
    "personal use. Open each address below in a browser signed in to ESPN, save the page into this league's",
    'folder, then import the files:',
    '',
    `  league                ${links.league}`,
  ];
  for (const { week: w, matchups, transactions } of links.weeks) {
    lines.push(`  week ${w} matchups      ${matchups}`, `  week ${w} transactions  ${transactions}`);
  }
  lines.push('', `  import-espn ${week === null ? '' : `--week ${week} `}<the saved files>`);
  return lines.join('\n');
}
