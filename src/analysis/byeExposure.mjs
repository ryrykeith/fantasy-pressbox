/**
 * Which rostered starters are on an NFL bye in the next few weeks.
 *
 * A bye week is not a Sleeper field — see scripts/fetch-bye-weeks.mjs for how
 * the committed config/bye-weeks.<season>.yml tables are derived from the
 * real NFL schedule instead. This module only ever reads an already-parsed
 * table: turning it into a lookup a week number can query (`parseByeWeekTable`),
 * and turning that lookup plus a roster's starters into the fact that matters
 * for a guillotine edition — how many starters a survivor is about to lose to
 * a bye, in each of the next few weeks (`upcomingByeExposure`).
 *
 * Numbers and player ids only, never prose — the same split
 * src/analysis/danger.mjs and src/analysis/faab.mjs keep. Turning a player id
 * into a name a model can read is src/promptContext.mjs's job, same as it is
 * for a roster (rosterView) or a released FAAB pool (faabMarketView).
 */

/** How many weeks ahead to report exposure for, when a caller does not say. */
export const DEFAULT_WEEK_COUNT = 3;

const MIN_WEEK = 1;
const MAX_WEEK = 18;
const EXPECTED_TEAM_COUNT = 32;

/** Where an operator regenerates a season's bye-week table. Named in every error this module throws. */
export function byeWeekTableSource(season) {
  return `config/bye-weeks.${season}.yml`;
}

/**
 * Validates a parsed bye-week table and resolves it into one team -> week lookup.
 *
 * Mirrors `parseDeclaredEliminations` (src/analysis/elimination.mjs): every
 * complaint here is about a file that is either hand-edited or was written by
 * a broken run of scripts/fetch-bye-weeks.mjs, so every one of them stops the
 * run rather than silently reporting a partial table. A team that looks like
 * it never has a bye is exactly the kind of wrong fact this project refuses
 * to print.
 *
 * Aliases (a stale abbreviation Sleeper still reports on old players, e.g.
 * OAK -> LV) are resolved into the same lookup the real teams live in, so a
 * caller never special-cases them: looking up "OAK" and looking up "LV"
 * return the identical week.
 */
export function parseByeWeekTable(parsed, { season, source } = {}) {
  const name = source ?? (season !== undefined && season !== null ? byeWeekTableSource(season) : 'the bye-week table');

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} could not be read as a map. Regenerate it with scripts/fetch-bye-weeks.mjs.`);
  }

  if (season !== undefined && season !== null && String(parsed.season) !== String(season)) {
    throw new Error(
      `${name} declares season ${parsed.season}, not ${season}. ` +
        `Regenerate it with: node scripts/fetch-bye-weeks.mjs ${season}`,
    );
  }

  const byeWeeks = parsed.bye_weeks;
  if (!byeWeeks || typeof byeWeeks !== 'object' || Array.isArray(byeWeeks)) {
    throw new Error(`${name} has no "bye_weeks" map. Regenerate it with scripts/fetch-bye-weeks.mjs.`);
  }

  const teams = Object.keys(byeWeeks);
  if (teams.length !== EXPECTED_TEAM_COUNT) {
    throw new Error(
      `${name} lists ${teams.length} team${teams.length === 1 ? '' : 's'}, expected ${EXPECTED_TEAM_COUNT}. ` +
        'A partial table under-counts bye exposure for every team it is missing rather than saying so. ' +
        'Regenerate it with scripts/fetch-bye-weeks.mjs.',
    );
  }

  const resolved = new Map();
  for (const [team, week] of Object.entries(byeWeeks)) {
    if (!Number.isInteger(week) || week < MIN_WEEK || week > MAX_WEEK) {
      throw new Error(
        `${name}: "${team}" has bye week "${week}", which is not an integer from ${MIN_WEEK} to ${MAX_WEEK}.`,
      );
    }
    resolved.set(team, week);
  }

  const aliases = parsed.aliases ?? {};
  if (typeof aliases !== 'object' || Array.isArray(aliases)) {
    throw new Error(`${name} "aliases" must be a map of stale team code to current team code.`);
  }
  for (const [stale, current] of Object.entries(aliases)) {
    if (!resolved.has(current)) {
      throw new Error(`${name}: alias "${stale}" points to "${current}", which has no bye week listed.`);
    }
    if (Object.hasOwn(byeWeeks, stale)) {
      throw new Error(`${name}: "${stale}" is listed as both a team and an alias.`);
    }
    resolved.set(stale, resolved.get(current));
  }

  return resolved;
}

/**
 * A rostered starter's NFL team's bye week — refused, never guessed at, if
 * the team is not in the table.
 *
 * `nflTeam` is null for a free agent and for a player Sleeper has no team
 * recorded for; neither can be on a bye, so both return null without a
 * lookup. Anything else not found in `byeWeeks` (parseByeWeekTable already
 * folds every alias into it) is refused: an abbreviation this table does not
 * recognise is not "no bye" — it is a gap in the table, or a franchise code
 * the generator does not know about yet — and reporting zero exposure for it
 * would be exactly the kind of wrong, confident fact this project refuses to
 * print.
 */
export function byeWeekFor(byeWeeks, nflTeam, { source = 'the bye-week table' } = {}) {
  if (!nflTeam) return null;
  if (!byeWeeks.has(nflTeam)) {
    throw new Error(
      `${source} has no entry for NFL team "${nflTeam}". If this is a new franchise code or ` +
        "relocation, add it to scripts/fetch-bye-weeks.mjs's alias table and regenerate.",
    );
  }
  return byeWeeks.get(nflTeam);
}

/** A roster's real starters — Sleeper pads an incomplete lineup with "0" placeholders for an empty slot. */
function starterIdsFor(team) {
  return (team.starterIds ?? []).filter((id) => id && id !== '0');
}

/**
 * Per surviving team, how many rostered starters are on a bye in each of the
 * next few weeks.
 *
 * Reads the roster's *current* starters (src/sleeper/normalize.mjs#normalizeTeams'
 * `starterIds`) rather than a specific week's Sleeper matchup entry — this is
 * a forward-looking risk report about weeks that have not been played yet,
 * not a record of one that already was, so there is no per-week starter list
 * to read.
 *
 * Restricted to `ledger.survivors` when a ledger is supplied, the same
 * convention src/analysis/danger.mjs#weekDanger and
 * src/analysis/faab.mjs#faabBalances use: a chopped team has no more weeks
 * left to be exposed in. Omit the ledger to treat every team as alive.
 *
 * @param teams      normalized teams (src/sleeper/normalize.mjs#normalizeTeams)
 * @param players    the raw Sleeper player dictionary, keyed by player id
 * @param byeWeeks   a resolved table from parseByeWeekTable
 * @param fromWeek   the first week to report exposure for
 * @param weekCount  how many weeks ahead to report; defaults to DEFAULT_WEEK_COUNT
 * @param ledger     the elimination ledger; omit it to treat every team as alive
 * @param source     named in the error if a starter's NFL team is not in byeWeeks
 */
export function upcomingByeExposure({
  teams = [],
  players = {},
  byeWeeks,
  fromWeek,
  weekCount = DEFAULT_WEEK_COUNT,
  ledger = null,
  source,
} = {}) {
  const survivorIds = ledger ? new Set((ledger.survivors ?? []).map((entry) => entry.rosterId)) : null;
  const weeks = Array.from({ length: weekCount }, (_, index) => fromWeek + index).filter(
    (week) => week >= MIN_WEEK && week <= MAX_WEEK,
  );

  return teams
    .filter((team) => !survivorIds || survivorIds.has(team.rosterId))
    .map((team) => {
      const starters = starterIdsFor(team).map((id) => {
        const nflTeam = players[id]?.team ?? null;
        return { id, byeWeek: byeWeekFor(byeWeeks, nflTeam, { source }) };
      });

      return {
        rosterId: team.rosterId,
        team: team.name,
        weeks: weeks.map((week) => {
          const onBye = starters.filter((entry) => entry.byeWeek === week);
          return {
            week,
            startersOnBye: onBye.length,
            playerIds: onBye.map((entry) => entry.id),
          };
        }),
      };
    });
}
