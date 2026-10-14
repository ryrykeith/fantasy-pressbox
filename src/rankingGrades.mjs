/**
 * Ranking movement and prediction grading: the pure half of what the
 * publication remembers. No storage and no node: imports, so the browser
 * entry can use it; src/store.mjs and src/storeCore.mjs hold the storage.
 */

/**
 * Attaches previous rank and movement to a ranking list.
 * Teams absent from the previous edition get movement `null`, not 0 — a team
 * that was never ranked did not "hold steady".
 */
export function withMovement(rankings, previous) {
  // A roster id survives a rename and a name does not, so entries are matched
  // on the id whenever one is known. Name matching remains only for callers
  // that have no league to resolve names against.
  const keyOf = (entry) =>
    entry.rosterId !== undefined && entry.rosterId !== null ? `roster:${entry.rosterId}` : `name:${entry.team}`;
  const previousByTeam = new Map((previous?.rankings || []).map((entry) => [keyOf(entry), entry.rank]));
  return rankings.map((entry) => {
    const previousRank = previousByTeam.get(keyOf(entry)) ?? null;
    return {
      ...entry,
      previousRank,
      movement: previousRank === null ? null : previousRank - entry.rank,
    };
  });
}

/** "↑2" / "↓3" / "—" — the notation the league reads every week. */
export function movementLabel(movement) {
  if (movement === null || movement === undefined) return 'NEW';
  if (movement > 0) return `↑${movement}`;
  if (movement < 0) return `↓${Math.abs(movement)}`;
  return '—';
}

/** One called game: who won, and how close the projected score was. */
function gradeMatchupPrediction(prediction, results) {
  const a = results.find(prediction.team_a, prediction.roster_a);
  const b = results.find(prediction.team_b, prediction.roster_b);
  if (!a || !b) return { ...prediction, graded: false, reason: 'team not found in results' };
  const actualWinner =
    a.points === b.points ? null : a.points > b.points ? prediction.team_a : prediction.team_b;
  // Who won is settled by roster, not by spelling: a team renamed between the
  // preview and the result is still the team that was called.
  const winningRoster = a.points === b.points ? null : a.points > b.points ? a.rosterId : b.rosterId;
  const calledRoster = results.rosterOf(prediction.predicted_winner, prediction.predicted_winner_roster);
  const correct =
    actualWinner !== null &&
    (calledRoster !== null && winningRoster !== undefined
      ? calledRoster === winningRoster
      : actualWinner === prediction.predicted_winner);
  const scoreError =
    prediction.predicted_score_a !== undefined && prediction.predicted_score_b !== undefined
      ? Number(
          (
            Math.abs(prediction.predicted_score_a - a.points) +
            Math.abs(prediction.predicted_score_b - b.points)
          ).toFixed(2),
        )
      : null;
  return {
    ...prediction,
    graded: true,
    actual_winner: actualWinner,
    actual_score_a: a.points,
    actual_score_b: b.points,
    correct,
    total_score_error: scoreError,
  };
}

/**
 * One called chop: the shape a survival preview predicts in.
 *
 * A format with no games has nothing to pick a winner of, so the called shot
 * is who goes out instead. What actually happened is not a score comparison —
 * it is whatever the elimination ledger settled on for that week, which is the
 * only thing in this project entitled to say a team was chopped.
 *
 * A week the ledger has not settled is left UNGRADED, never scored wrong. That
 * is the state of every guillotine league every Monday: the scores are in but
 * the commissioner has not processed the chop, or two teams tied for lowest and
 * there is no lowest scorer to speak of. Marking those wrong would invent a
 * result, which is the one thing this project refuses to do — and it would also
 * punish a correct call for a commissioner's timing. `chop_source` travels with
 * a graded result so a reader can tell a declaration from a derivation.
 */
function gradeChopPrediction(prediction, { week, eliminationLedger, results }) {
  if (!eliminationLedger) {
    return {
      ...prediction,
      graded: false,
      reason: 'no elimination ledger was supplied, so who went cannot be checked',
    };
  }

  const chop = (eliminationLedger.history ?? []).find((entry) => entry.week === week) ?? null;
  if (!chop) {
    const record = (eliminationLedger.weeks ?? []).find((entry) => entry.week === week) ?? null;
    return {
      ...prediction,
      graded: false,
      reason: record?.note
        ? `week ${week} is unresolved — ${record.note}`
        : `no elimination is recorded for week ${week} yet`,
    };
  }

  return {
    ...prediction,
    graded: true,
    actual_chop: chop.team,
    chop_source: chop.source,
    // Matched by roster: comparing names would mark a correct call WRONG the
    // moment the chopped team renamed itself, which is worse than ungraded.
    correct: (() => {
      const calledRoster = results.rosterOf(prediction.predicted_chop, prediction.predicted_chop_roster);
      return calledRoster !== null && chop.rosterId !== undefined
        ? calledRoster === chop.rosterId
        : chop.team === prediction.predicted_chop;
    })(),
  };
}

/**
 * Grades last week's predictions against what actually happened.
 * Used so a recap can admit, in print, that it was wrong.
 *
 * Two prediction shapes are scored, told apart by their own fields rather than
 * by the league's format: a called game (`predicted_winner`) and a called chop
 * (`predicted_chop`). A format decides which shape gets *recorded*; by the time
 * a prediction is being graded it already says which it is, and reading that
 * off the record keeps a season that changed format — or a mixed file — from
 * being graded against the wrong rule.
 *
 * @param predictions      whatever was recorded for the week
 * @param weekAnalysis     that week's analysis (src/analysis/week.mjs)
 * @param eliminationLedger the ledger for the same week, required to grade a
 *                          called chop; absent means those go ungraded
 * @param identity         resolves a published team name to its roster
 *                         (src/teamIdentity.mjs), so a rename between the call
 *                         and the result does not change the grade
 */
export function gradePredictions(predictions, weekAnalysis, { eliminationLedger = null, identity = null } = {}) {
  if (!predictions?.length) return null;
  const week = weekAnalysis.week;
  const byRoster = new Map(weekAnalysis.teamWeeks.map((t) => [t.rosterId, t]));
  const byName = new Map(weekAnalysis.teamWeeks.map((t) => [t.team, t]));
  const results = {
    /** A recorded roster id wins; otherwise the name is resolved as published that week. */
    rosterOf(name, recorded) {
      if (recorded !== undefined && recorded !== null) return recorded;
      return identity ? identity.rosterIdFor(name, { week }) : null;
    },
    find(name, recorded) {
      const rosterId = results.rosterOf(name, recorded);
      return (rosterId !== null && byRoster.get(rosterId)) || byName.get(name) || null;
    },
  };

  const graded = predictions.map((prediction) =>
    prediction?.predicted_chop === undefined
      ? gradeMatchupPrediction(prediction, results)
      : gradeChopPrediction(prediction, { week, eliminationLedger, results }),
  );

  const scored = graded.filter((g) => g.graded);
  const correct = scored.filter((g) => g.correct).length;
  return {
    results: graded,
    correct,
    total: scored.length,
    accuracy: scored.length ? Number(((correct / scored.length) * 100).toFixed(1)) : null,
  };
}
