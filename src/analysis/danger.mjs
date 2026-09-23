/**
 * How close each surviving team is to the chop, and how thin their margin
 * for error has been across the season so far.
 *
 * In a guillotine league the number that matters every week is not who
 * scored the most — it is who scored the least, and by how much. This module
 * answers that from the same weekly scores src/analysis/elimination.mjs
 * already reads, plus who was still alive going into each week
 * (elimination.mjs#survivorsAt).
 *
 * Numbers only, never prose — src/promptContext.mjs is where a fact turns
 * into an instruction to a model, the same separation src/analysis/week.mjs
 * already keeps.
 */
import { survivorsAt } from './elimination.mjs';

/** Roster ids still alive entering a week, with or without a ledger to ask. */
function aliveEntering(week, teams, ledger) {
  if (!ledger) return new Set(teams.map((team) => team.rosterId));
  return new Set(survivorsAt(ledger, week - 1).map((entry) => entry.rosterId));
}

/**
 * One week's chop-line picture.
 *
 * `chopLine` is this week's lowest score among the teams that were still
 * alive going into it — the score a team needed to beat to survive.
 * `survivalMargin` is the gap between that lowest score and the next-lowest:
 * how close the team that was *not* chopped came to being chopped instead.
 *
 * `teams` is the week's scoring order — highest points first, same
 * convention as src/analysis/week.mjs#scoringOrder — with each entry's
 * distance above the chop line attached. The team on the chop line itself
 * carries a `marginAboveChopLine` of 0: it does not sit outside its own line.
 *
 * A week where fewer than two teams contended (the field is already down to
 * a champion, or nobody who was still alive has a score yet) has no chop to
 * describe, and `chopLine`/`survivalMargin` are null rather than a number
 * that would misstate the guaranteed-safe case as some kind of margin.
 *
 * @param week    the week number
 * @param scores  `[{ rosterId, points }]` for every team that scored this
 *                week — src/pipeline.mjs#storedWeekScores' per-week shape
 * @param teams   normalized teams (src/sleeper/normalize.mjs#normalizeTeams),
 *                for names and, absent a ledger, the full roster
 * @param ledger  the elimination ledger (src/analysis/elimination.mjs), read
 *                only to know who was still alive entering this week; omit it
 *                to treat every team in `teams` as a contender
 */
export function weekDanger({ week, scores = [], teams = [], ledger = null }) {
  const nameOf = new Map(teams.map((team) => [team.rosterId, team.name]));
  const alive = aliveEntering(week, teams, ledger);
  const contenders = scores.filter((entry) => alive.has(entry.rosterId));

  if (contenders.length < 2) {
    return { week, chopLine: null, survivalMargin: null, teams: [] };
  }

  const descending = [...contenders].sort((a, b) => b.points - a.points);
  const chopLine = descending.at(-1).points;
  const survivalMargin = Number((descending.at(-2).points - descending.at(-1).points).toFixed(2));

  return {
    week,
    chopLine,
    survivalMargin,
    teams: descending.map((entry, index) => ({
      rank: index + 1,
      rosterId: entry.rosterId,
      team: nameOf.get(entry.rosterId) ?? `Roster ${entry.rosterId}`,
      points: entry.points,
      marginAboveChopLine: Number((entry.points - chopLine).toFixed(2)),
    })),
  };
}

/** The middle value of an already-sorted array, averaging the two middle values for an even count. */
function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Number(value.toFixed(2));
}

/**
 * A team's floor across the season so far: the lowest and median weekly
 * score among the weeks it has actually played. Ceiling is deliberately not
 * tracked here — floor is the number that keeps a roster alive in this
 * format, not the one that wins it a week.
 *
 * A roster's own history is read exactly as it happened: a week after this
 * team was chopped carries no score for it (buildEliminationLedger's
 * contenders filter already stops crediting an eliminated roster with
 * scores), so a floor is never diluted by weeks that were not really this
 * team's to play.
 *
 * Sorted worst-floor-first, since that is the team the coverage should be
 * watching hardest.
 *
 * @param weeks `[{ week, played, scores: [{ rosterId, points }] }]`, the same
 *              shape src/pipeline.mjs#storedWeekScores already builds
 * @param teams normalized teams, for names
 */
export function rollingFloor({ weeks = [], teams = [] } = {}) {
  const nameOf = new Map(teams.map((team) => [team.rosterId, team.name]));
  const pointsByRoster = new Map();

  for (const weekData of weeks) {
    if (!weekData?.played) continue;
    for (const entry of weekData.scores ?? []) {
      if (!pointsByRoster.has(entry.rosterId)) pointsByRoster.set(entry.rosterId, []);
      pointsByRoster.get(entry.rosterId).push(entry.points);
    }
  }

  return [...pointsByRoster.entries()]
    .map(([rosterId, points]) => {
      const sorted = [...points].sort((a, b) => a - b);
      return {
        rosterId,
        team: nameOf.get(rosterId) ?? `Roster ${rosterId}`,
        lowest: sorted[0],
        median: median(sorted),
        weeksPlayed: sorted.length,
      };
    })
    .sort((a, b) => a.lowest - b.lowest);
}

/**
 * The full danger board through the weeks supplied: every played week's
 * chop-line picture, plus each team's rolling floor.
 *
 * `weeks` mirrors buildEliminationLedger's own input exactly, so a caller
 * already assembling that (src/pipeline.mjs#storedWeekScores) can hand this
 * function the identical array rather than building a second shape.
 *
 * A week that was not played, or that resolves to fewer than two contenders
 * (the field already has its champion), contributes nothing to `weeks` —
 * there is no chop-line fact for a week where nothing was at stake.
 *
 * @param teams  normalized teams
 * @param weeks  `[{ week, played, scores }]`
 * @param ledger the elimination ledger; omit it to treat every team as alive
 *               for every week
 */
export function buildDangerBoard({ teams = [], weeks = [], ledger = null } = {}) {
  return {
    weeks: weeks
      .filter((entry) => entry?.played)
      .map((entry) => weekDanger({ week: entry.week, scores: entry.scores, teams, ledger }))
      .filter((entry) => entry.teams.length > 0),
    floors: rollingFloor({ weeks, teams }),
  };
}
