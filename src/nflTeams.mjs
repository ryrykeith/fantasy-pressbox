/**
 * NFL team abbreviations: the one place the spellings are reconciled.
 *
 * Shared by the bye-week generator (scripts/fetch-bye-weeks.mjs, which reads
 * nflverse's schedule) and the ESPN normalizer (src/espn/). Canonical codes are the bye-week table's codes,
 * which today are Sleeper's spelling (config/bye-weeks.2026.yml). Every alias
 * below is backed by that committed table or by a comment citing where it
 * comes from; nothing here is guessed. An unknown code is refused, never
 * passed through — a team the table does not know would silently read as one
 * that never has a bye.
 */

/** The 32 canonical codes — exactly the keys of config/bye-weeks.2026.yml. */
export const NFL_TEAM_CODES = Object.freeze([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);

/**
 * ESPN spellings that differ from the canonical code.
 *
 * Washington: Sleeper says WAS, ESPN's fantasy API says WSH. Add another only
 * when a cited source shows it.
 */
export const ESPN_TO_CANONICAL = Object.freeze({ WSH: 'WAS' });

/**
 * nflverse spellings that differ from the canonical code.
 *
 * The Rams: nflverse's schedule (games.csv, nflverse-data 'schedules' release)
 * says LA; Sleeper and the committed table say LAR. Checked 2026-10-13: with
 * LA mapped to LAR, nflverse's 2026 byes match config/bye-weeks.2026.yml
 * exactly, and the other 31 codes (including WAS) already match.
 */
export const NFLVERSE_TO_CANONICAL = Object.freeze({ LA: 'LAR' });

/**
 * Codes still seen on old player records that no longer field a team.
 * OAK is the pre-move Raiders; the committed table carries `OAK: LV`.
 */
export const STALE_CODES = Object.freeze({ OAK: 'LV' });

/**
 * Resolve a team code (canonical, ESPN spelling, or stale) to the canonical
 * code. Throws on anything else.
 */
export function canonicalTeamCode(code) {
  if (typeof code === 'string') {
    if (NFL_TEAM_CODES.includes(code)) return code;
    if (Object.hasOwn(ESPN_TO_CANONICAL, code)) return ESPN_TO_CANONICAL[code];
    if (Object.hasOwn(STALE_CODES, code)) return STALE_CODES[code];
  }
  throw new Error(
    `Unknown NFL team code ${JSON.stringify(code)}. It is not a canonical code, a known ESPN spelling or a stale code; ` +
      'add it to src/nflTeams.mjs only with a cited source.',
  );
}

/**
 * Resolve a team code read from nflverse's schedule to the canonical code:
 * a canonical code or an nflverse spelling. Throws on anything else,
 * including ESPN and stale spellings, which nflverse's schedule does not use.
 */
export function nflverseTeamCode(code) {
  if (typeof code === 'string') {
    if (NFL_TEAM_CODES.includes(code)) return code;
    if (Object.hasOwn(NFLVERSE_TO_CANONICAL, code)) return NFLVERSE_TO_CANONICAL[code];
  }
  throw new Error(
    `Unknown NFL team code ${JSON.stringify(code)} in the nflverse schedule. It is not a canonical code or a known nflverse spelling; ` +
      'add it to src/nflTeams.mjs only with a cited source.',
  );
}
