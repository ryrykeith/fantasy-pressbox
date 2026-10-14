/**
 * Where each team sits in the standings today.
 *
 * Sleeper's default playoff seeding (playoff_seed_type 0) is wins, then
 * points-for; a tie counts as half a win here. `projectPlayoffField` builds on
 * this order to project the final playoff field.
 */

/** A team's wins, counting a tie as half a win. */
export function winScore(team) {
  return (team.record?.wins ?? 0) + (team.record?.ties ?? 0) / 2;
}

/** Teams best-first by wins, then points-for. Does not mutate its input. */
export function seededTeams(teams) {
  return [...teams].sort(
    (a, b) => winScore(b) - winScore(a) || (b.seasonPointsFor ?? 0) - (a.seasonPointsFor ?? 0),
  );
}

/**
 * The seeding rules this module's order stands for. A League that reports no
 * rule (`playoffSeeding` absent: Sleeper's) is taken to use Sleeper's default,
 * as it always has been. ESPN's head-to-head record rule seeds on record
 * first; its tiebreak is taken to be points for (assumed: docs/espn-data.md).
 */
const SEEDING_BY_RECORD = ['head_to_head_record'];

/**
 * Does this league seed its playoffs by wins, then points for? False for any
 * other rule, and for a rule the provider reported as unknown (null): a seed
 * or a projected playoff field from this order would then be made up.
 */
export function seedsByWinsThenPointsFor(league) {
  if (league?.playoffSeeding === undefined) return true;
  return SEEDING_BY_RECORD.includes(league.playoffSeeding);
}

/**
 * @returns {Map<number, number>} roster id → current seed, 1 being the best
 */
export function currentSeeds(teams) {
  return new Map(seededTeams(teams).map((team, index) => [team.rosterId, index + 1]));
}
