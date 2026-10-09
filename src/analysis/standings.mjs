/**
 * Where each team sits in the standings today.
 *
 * Sleeper's default playoff seeding (playoff_seed_type 0) is wins, then
 * points-for; a tie counts as half a win here. This is the order as it stands,
 * not a projection of the final field — that is the "Project the playoff field
 * from current standings" task, which should build on this rather than beside
 * it.
 *
 * @returns {Map<number, number>} roster id → current seed, 1 being the best
 */
export function currentSeeds(teams) {
  const winScore = (team) => (team.record?.wins ?? 0) + (team.record?.ties ?? 0) / 2;
  const ordered = [...teams].sort(
    (a, b) => winScore(b) - winScore(a) || (b.seasonPointsFor ?? 0) - (a.seasonPointsFor ?? 0),
  );
  return new Map(ordered.map((team, index) => [team.rosterId, index + 1]));
}
