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
 * @returns {Map<number, number>} roster id → current seed, 1 being the best
 */
export function currentSeeds(teams) {
  return new Map(seededTeams(teams).map((team, index) => [team.rosterId, index + 1]));
}
