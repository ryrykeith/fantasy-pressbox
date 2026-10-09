/**
 * The operator's league as it stood on 2026-10-09, after week 4: records,
 * points-for and max points-for exactly as Sleeper reported them, and the 2027
 * picks that had moved by then. Taken from output/2026-week04-rankings-prompt.md;
 * roster ids 1-12 are assigned in that file's order, not Sleeper's real ids.
 *
 * The rule is the league's own: the six teams that miss the playoffs pick 1-6,
 * then the six playoff teams pick 7-12, each group lowest max points-for first.
 *
 * Shared by every test that projects this league's rookie draft, so they all
 * reason about the same table. Not a test file itself: `npm test` only runs
 * tests/*.test.mjs.
 */

export const RULE = {
  groups: [
    { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
    { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
  ],
};

export function team(rosterId, name, wins, pointsFor, maxPointsFor) {
  return {
    rosterId,
    name,
    record: { wins, losses: 4 - wins, ties: 0 },
    seasonPointsFor: pointsFor,
    seasonPotentialPoints: maxPointsFor,
  };
}

export const BYE_WEEK_BLUES = 1;
export const PUNT_INTENDED = 2;
export const LOWERED_EXPECTATIONS = 3;
export const SUNDAY_SCARIES = 4;
export const PICK_SIX = 5;
export const KICKOFF_KINGS = 6;
export const REBUILD_SZN = 7;
export const WAIVER_WIRE = 8;
export const BENCH_MOB = 9;
export const HAIL_MARY = 10;
export const TACO_TUESDAY = 11;
export const SACK_LUNCH = 12;

export const TEAMS_2026_10_09 = [
  team(BYE_WEEK_BLUES, 'Bye Week Blues', 3, 587.57, 662.63),
  team(PUNT_INTENDED, 'Punt Intended', 3, 524.77, 632.91),
  team(LOWERED_EXPECTATIONS, 'Lowered Expectations', 2, 505.21, 637.69),
  team(SUNDAY_SCARIES, 'Sunday Scaries', 2, 507.11, 629.91),
  team(PICK_SIX, 'Pick Six Appeal', 3, 576.67, 673.79),
  team(KICKOFF_KINGS, 'Kickoff Kings', 1, 515.53, 593.69),
  team(REBUILD_SZN, 'Rebuild Szn', 1, 486.67, 597.05),
  team(WAIVER_WIRE, 'The Waiver Wire', 3, 582.97, 684.77),
  team(BENCH_MOB, 'Bench Mob', 2, 546.89, 640.49),
  team(HAIL_MARY, 'Hail Mary Heroes', 1, 532.33, 618.93),
  team(TACO_TUESDAY, 'Taco Tuesday', 2, 537.47, 594.37),
  team(SACK_LUNCH, 'Sack Lunch', 1, 513.05, 611.75),
];

export const LEAGUE = {
  season: '2026',
  status: 'in_season',
  playoffTeams: 6,
  playoffWeekStart: 15,
  lastScoredWeek: 4,
  draftRounds: 5,
  format: { type: 'dynasty', source: 'detected' },
};

/** Sleeper's traded_picks as of 2026-10-09: only the picks that moved. */
export const TRADED_PICKS = [
  { season: '2027', round: 1, roster_id: TACO_TUESDAY, owner_id: REBUILD_SZN, previous_owner_id: TACO_TUESDAY },
  { season: '2027', round: 2, roster_id: TACO_TUESDAY, owner_id: LOWERED_EXPECTATIONS, previous_owner_id: TACO_TUESDAY },
  { season: '2027', round: 3, roster_id: LOWERED_EXPECTATIONS, owner_id: TACO_TUESDAY, previous_owner_id: LOWERED_EXPECTATIONS },
  { season: '2027', round: 3, roster_id: REBUILD_SZN, owner_id: TACO_TUESDAY, previous_owner_id: REBUILD_SZN },
  { season: '2028', round: 2, roster_id: REBUILD_SZN, owner_id: TACO_TUESDAY, previous_owner_id: REBUILD_SZN },
  { season: '2028', round: 3, roster_id: TACO_TUESDAY, owner_id: REBUILD_SZN, previous_owner_id: TACO_TUESDAY },
];

export const ROSTER_IDS = TEAMS_2026_10_09.map((t) => t.rosterId);
