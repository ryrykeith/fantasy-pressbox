/**
 * Two teams' head-to-head record, from the weeks the publication saved.
 *
 * A rivalry is declared (src/rivalries.mjs); its record is a fact, so it comes
 * only from saved snapshots, across every season the store holds. Nothing is
 * fetched: Sleeper's API serves the current season alone, so an older meeting
 * exists here only if its week was captured at the time.
 *
 * What counts:
 *   - A week counts only when it is settled, analysed, and both teams' sides
 *     were saved in it. A week still being played (`settled: false`), one with
 *     no scores (`played: false`) and a matchup period over several NFL weeks
 *     (ESPN; the snapshot has no analysis) are left out.
 *   - A meeting is a saved game whose two sides are the two teams. A format
 *     with no matchups (guillotine) saves no games, so its weeks give none.
 *   - Teams are matched by roster id, which survives a rename
 *     (src/teamIdentity.mjs), never by the name printed that week. Sleeper and
 *     ESPN keep a team's id when a league renews into a new season.
 *
 * With no meeting saved the record is `unavailable: 'no meeting saved'`, never
 * 0-0: "they have never played" and "we did not save it" are different facts,
 * and only the store can say which weeks it saw. So the result always says
 * which seasons and weeks were covered, and names every season that was not.
 *
 * PURE: no node: imports, no I/O of its own. The reader takes a store
 * (src/storeCore.mjs), so it works on the file store and on a league file's
 * memory store alike.
 */

/** The reason a pair has no record. Never shown as 0-0. */
export const NO_MEETING_SAVED = 'no meeting saved';

/** Why a season is not covered. */
export const SEASON_NOT_COVERED = {
  NO_WEEK_SAVED: 'no week saved',
  NO_WEEK_WITH_BOTH: 'no settled week saved with both teams in it',
};

const round2 = (n) => Number(n.toFixed(2));

/**
 * Every saved snapshot, season by season, from the first season with one up to
 * `through.season` (the newest saved, when not given). A season in that span
 * with nothing saved is listed with no snapshots, so it can be named as not
 * covered. In `through.season`, only weeks up to `through.week` are read.
 *
 * @returns `[{ season, snapshots }]`, oldest season first, weeks ascending
 */
export function readSavedSeasons(store, { through = {} } = {}) {
  const saved = store.snapshotSeasons();
  if (!saved.length) return through.season === undefined ? [] : [{ season: String(through.season), snapshots: [] }];
  const first = Number(saved[0]);
  const last = through.season === undefined ? Number(saved.at(-1)) : Number(through.season);
  const seasons = [];
  for (let year = first; year <= last; year += 1) {
    const throughWeek = year === last && Number.isInteger(through.week) ? through.week : Number.POSITIVE_INFINITY;
    seasons.push({ season: String(year), snapshots: store.loadSnapshotsThrough(String(year), throughWeek) });
  }
  return seasons;
}

/** Whether a saved week is a result: settled, scored, and analysed. */
function isResult(snapshot) {
  return snapshot.settled !== false && snapshot.played !== false && Boolean(snapshot.analysis);
}

/** Whether both teams have a side saved in an analysed week. */
function bothSaved(analysis, [a, b]) {
  const ids = new Set((analysis.teamWeeks || []).map((entry) => entry.rosterId));
  return ids.has(a) && ids.has(b);
}

/** The saved game between the two teams in an analysed week, as [points of a, points of b], or null. */
function meetingIn(analysis, [a, b]) {
  for (const game of analysis.games || []) {
    const [x, y] = game.teams || [];
    if (!x || !y) continue;
    if (x.rosterId === a && y.rosterId === b) return [x.points, y.points];
    if (x.rosterId === b && y.rosterId === a) return [y.points, x.points];
  }
  return null;
}

/**
 * The head-to-head record of two teams.
 *
 * @param seasons  readSavedSeasons' result
 * @param teams    the two roster ids, `[a, b]`; every pair of numbers in the
 *                 result is in this order
 * @returns `{ teams, covered, notCovered }` and either `unavailable` or:
 *   - `meetings`: how many saved games they played
 *   - `record`: `{ wins, losses, ties }`, the first team's
 *   - `points`: `[a, b]`, each team's total over the meetings
 *   - `lastMeeting`: `{ season, week, points: [a, b], winner }` (winner a roster id, null for a tie)
 *   - `streak`: `{ holder, result, length }` — the team on a run of wins
 *     (`result: 'W'`) or a run of ties (`result: 'T'`, holder null), ending at the last meeting
 *   - `biggestMargin`: `{ season, week, points: [a, b], winner, margin }`, the earliest on a tie
 *   `covered` is `[{ season, weeks }]` (the weeks both teams' sides were saved);
 *   `notCovered` is `[{ season, reason }]`.
 */
export function headToHead(seasons, teams) {
  const [a, b] = teams;
  if (a === b) throw new Error('A head-to-head record needs two different teams.');

  const covered = [];
  const notCovered = [];
  const meetings = [];
  for (const { season, snapshots } of seasons) {
    if (!snapshots.length) {
      notCovered.push({ season, reason: SEASON_NOT_COVERED.NO_WEEK_SAVED });
      continue;
    }
    const weeks = [];
    for (const snapshot of snapshots) {
      if (!isResult(snapshot) || !bothSaved(snapshot.analysis, teams)) continue;
      weeks.push(snapshot.week);
      const points = meetingIn(snapshot.analysis, teams);
      if (points) meetings.push({ season, week: snapshot.week, points });
    }
    if (weeks.length) covered.push({ season, weeks });
    else notCovered.push({ season, reason: SEASON_NOT_COVERED.NO_WEEK_WITH_BOTH });
  }

  if (!meetings.length) return { teams: [a, b], unavailable: NO_MEETING_SAVED, covered, notCovered };

  const winnerOf = ([pa, pb]) => (pa > pb ? a : pb > pa ? b : null);
  const record = { wins: 0, losses: 0, ties: 0 };
  const points = [0, 0];
  let biggest = null;
  for (const meeting of meetings) {
    const winner = winnerOf(meeting.points);
    if (winner === a) record.wins += 1;
    else if (winner === b) record.losses += 1;
    else record.ties += 1;
    points[0] += meeting.points[0];
    points[1] += meeting.points[1];
    const margin = round2(Math.abs(meeting.points[0] - meeting.points[1]));
    if (!biggest || margin > biggest.margin) biggest = { ...meeting, winner, margin };
  }

  const last = meetings.at(-1);
  const holder = winnerOf(last.points);
  let length = 0;
  for (let i = meetings.length - 1; i >= 0 && winnerOf(meetings[i].points) === holder; i -= 1) length += 1;

  return {
    teams: [a, b],
    meetings: meetings.length,
    record,
    points: points.map(round2),
    lastMeeting: { ...last, winner: holder },
    streak: { holder, result: holder === null ? 'T' : 'W', length },
    biggestMargin: biggest,
    covered,
    notCovered,
  };
}
