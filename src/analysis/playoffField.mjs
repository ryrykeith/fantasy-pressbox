import { seededTeams, winScore } from './standings.mjs';

/**
 * The playoff field, and the bubble that decides it.
 *
 * Sleeper's default seeding (playoff_seed_type 0) is wins, then points-for, and
 * the league's playoff_teams sets the cut. Mid-season this is a PROJECTION from
 * today's standings; once the regular season is over it is the actual field.
 * `status` says which, so nothing downstream can present one as the other.
 */

/**
 * Has the regular season finished? It ends the week before
 * league.playoffWeekStart. With either number unknown we cannot say it has, so
 * the field stays labelled a projection.
 */
export function isRegularSeasonOver(league) {
  const { lastScoredWeek, playoffWeekStart } = league ?? {};
  if (!Number.isInteger(lastScoredWeek) || !Number.isInteger(playoffWeekStart)) return false;
  return lastScoredWeek >= playoffWeekStart - 1;
}

function entry(team, seed) {
  return {
    seed,
    rosterId: team.rosterId,
    name: team.name,
    record: team.record,
    pointsFor: team.seasonPointsFor ?? 0,
  };
}

/**
 * @returns {{
 *   status: 'projected' | 'actual',
 *   playoffTeams: number,
 *   field: object[],     seeds 1..playoffTeams, best first
 *   out: object[],       the rest, best first
 *   bubble: null | {
 *     lastIn: object, firstOut: object,
 *     gamesApart: number,       wins separating them (a tie is half a win)
 *     pointsForApart: number,   last in minus first out
 *     decidedBy: 'record' | 'points_for',
 *   },
 * }}
 */
export function projectPlayoffField({ league, teams }) {
  const cut = league?.playoffTeams;
  if (!Number.isInteger(cut) || cut < 1) {
    throw new Error(
      'The league does not report how many teams make the playoffs, so the playoff field cannot be projected.',
    );
  }
  const ordered = seededTeams(teams).map((team, index) => entry(team, index + 1));
  const field = ordered.slice(0, cut);
  const out = ordered.slice(cut);

  let bubble = null;
  if (field.length === cut && out.length > 0) {
    const lastIn = field[cut - 1];
    const firstOut = out[0];
    const gamesApart = winScore(lastIn) - winScore(firstOut);
    bubble = {
      lastIn,
      firstOut,
      gamesApart,
      pointsForApart: Math.round((lastIn.pointsFor - firstOut.pointsFor) * 100) / 100,
      decidedBy: gamesApart === 0 ? 'points_for' : 'record',
    };
  }

  return {
    status: isRegularSeasonOver(league) ? 'actual' : 'projected',
    playoffTeams: cut,
    field,
    out,
    bubble,
  };
}
