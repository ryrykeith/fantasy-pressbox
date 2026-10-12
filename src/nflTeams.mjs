/**
 * NFL team abbreviations: the one place the spellings are reconciled.
 *
 * Shared by the bye-week generator (scripts/fetch-bye-weeks.mjs) and the ESPN
 * normalizer (src/espn/). Canonical codes are the bye-week table's codes,
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
 * Washington: Sleeper says WAS, ESPN's scoreboard says WSH (the mapping
 * scripts/fetch-bye-weeks.mjs has always applied; the committed table's WAS
 * row is derived through it). Add another only when a cited source shows it.
 */
export const ESPN_TO_CANONICAL = Object.freeze({ WSH: 'WAS' });

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
