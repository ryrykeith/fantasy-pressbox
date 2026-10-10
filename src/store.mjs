/**
 * Everything the publication remembers.
 *
 * The project's central editorial rule is that history must not be rewritten.
 * A ranking published in week 2 was based on what was known in week 2, and it
 * stays that way forever. That is only possible if each week is written down
 * before the next one happens, which is what this module is for.
 *
 * Layout under data/:
 *   raw/<season>/week-<n>.json          exactly what Sleeper returned
 *   snapshots/<season>/week-<n>.json    normalized league + analysis
 *   rankings/<season>/<label>.json      a published ranking and its movement
 *   predictions/<season>/week-<n>.json  what we said would happen
 *   market/<season>/week-<n>.json       trade values as fetched for that week
 *   tank-watch/<season>/week-<n>.json   the draft order a tank watch reported
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function createStore({ dataDir }) {
  const pathFor = (kind, season, file) => join(dataDir, kind, String(season), file);

  const store = {
    dataDir,

    /** Where a week's raw bundle and snapshot live, whether or not they exist yet. */
    rawPath(season, week) {
      return pathFor('raw', season, `week-${week}.json`);
    },
    snapshotPath(season, week) {
      return pathFor('snapshots', season, `week-${week}.json`);
    },

    saveRaw(season, week, bundle) {
      return writeJson(pathFor('raw', season, `week-${week}.json`), bundle);
    },
    loadRaw(season, week) {
      return readJson(pathFor('raw', season, `week-${week}.json`));
    },
    /**
     * Every raw bundle already on disk up to and including `throughWeek`,
     * oldest first. Mirrors loadSnapshotsThrough: fetches nothing, and a week
     * nobody has captured yet is simply absent from the result rather than an
     * error — the FAAB market (src/analysis/faab.mjs) reads a chopped
     * roster's matchup entry out of exactly this, for the week it happened.
     */
    loadRawThrough(season, throughWeek) {
      const dir = join(dataDir, 'raw', String(season));
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .map((file) => /^week-(\d+)\.json$/.exec(file))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))
        .filter((week) => week <= throughWeek)
        .sort((a, b) => a - b)
        .map((week) => store.loadRaw(season, week))
        .filter(Boolean);
    },

    saveSnapshot(season, week, snapshot) {
      return writeJson(pathFor('snapshots', season, `week-${week}.json`), {
        savedAt: new Date().toISOString(),
        ...snapshot,
      });
    },
    loadSnapshot(season, week) {
      return readJson(pathFor('snapshots', season, `week-${week}.json`));
    },
    /** Every completed week up to and including `throughWeek`, oldest first. */
    loadSnapshotsThrough(season, throughWeek) {
      const dir = join(dataDir, 'snapshots', String(season));
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .map((file) => /^week-(\d+)\.json$/.exec(file))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))
        .filter((week) => week <= throughWeek)
        .sort((a, b) => a - b)
        .map((week) => store.loadSnapshot(season, week))
        .filter(Boolean);
    },
    /**
     * Every name each roster has been captured under this season, week by week.
     *
     * Published rankings and predictions are written in team names, and teams
     * rename themselves mid-season. A week's snapshot records which roster each
     * name meant that week, which is what lets src/teamIdentity.mjs match a name
     * printed in week 3 to the roster that goes by something else in week 5.
     */
    loadTeamNameHistory(season) {
      return store
        .loadSnapshotsThrough(season, Number.POSITIVE_INFINITY)
        .flatMap((snapshot) =>
          (snapshot.teams || []).map((team) => ({ week: snapshot.week, rosterId: team.rosterId, name: team.name })),
        );
    },

    saveRankings(season, label, rankings) {
      return writeJson(pathFor('rankings', season, `${label}.json`), rankings);
    },
    loadRankings(season, label) {
      return readJson(pathFor('rankings', season, `${label}.json`));
    },
    /**
     * The ranking a new edition should measure movement against: the most
     * recent published ranking at or before `beforeWeek`, falling back to the
     * preseason edition.
     */
    loadPreviousRankings(season, beforeWeek) {
      const dir = join(dataDir, 'rankings', String(season));
      if (!existsSync(dir)) return null;
      const weekly = readdirSync(dir)
        .map((file) => /^week-(\d+)\.json$/.exec(file))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))
        .filter((week) => week < beforeWeek)
        .sort((a, b) => b - a);
      if (weekly.length) return store.loadRankings(season, `week-${weekly[0]}`);
      return store.loadRankings(season, 'preseason');
    },

    savePredictions(season, week, predictions) {
      return writeJson(pathFor('predictions', season, `week-${week}.json`), {
        season: String(season),
        week,
        savedAt: new Date().toISOString(),
        predictions,
      });
    },
    loadPredictions(season, week) {
      return readJson(pathFor('predictions', season, `week-${week}.json`));
    },

    /**
     * The trade-value market a week's trades were graded against. Values move
     * daily, so the first fetch for a week is the one that counts: a re-run
     * reads it back and grades against the same numbers.
     */
    saveMarketValues(season, week, snapshot) {
      return writeJson(pathFor('market', season, `week-${week}.json`), snapshot);
    },
    loadMarketValues(season, week) {
      return readJson(pathFor('market', season, `week-${week}.json`));
    },

    /**
     * The draft order a tank watch reported, saved when the edition is built.
     * Kept apart from the week's snapshot so the next tank watch measures
     * movement against what the last one actually printed, however many weeks
     * ago that was.
     */
    saveTankWatch(season, week, draftOrder) {
      return writeJson(pathFor('tank-watch', season, `week-${week}.json`), {
        season: String(season),
        week,
        savedAt: new Date().toISOString(),
        draftOrder,
      });
    },
    /** The most recent tank watch strictly before `beforeWeek`, or null. */
    loadPreviousTankWatch(season, beforeWeek) {
      const dir = join(dataDir, 'tank-watch', String(season));
      if (!existsSync(dir)) return null;
      const latest = readdirSync(dir)
        .map((file) => /^week-(\d+)\.json$/.exec(file))
        .filter(Boolean)
        .map((match) => Number.parseInt(match[1], 10))
        .filter((week) => week < beforeWeek)
        .sort((a, b) => b - a)[0];
      return latest === undefined ? null : readJson(pathFor('tank-watch', season, `week-${latest}.json`));
    },
  };

  return store;
}

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
