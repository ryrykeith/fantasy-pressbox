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

    saveRaw(season, week, bundle) {
      return writeJson(pathFor('raw', season, `week-${week}.json`), bundle);
    },
    loadRaw(season, week) {
      return readJson(pathFor('raw', season, `week-${week}.json`));
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
  };

  return store;
}

/**
 * Attaches previous rank and movement to a ranking list.
 * Teams absent from the previous edition get movement `null`, not 0 — a team
 * that was never ranked did not "hold steady".
 */
export function withMovement(rankings, previous) {
  const previousByTeam = new Map(
    (previous?.rankings || []).map((entry) => [entry.team, entry.rank]),
  );
  return rankings.map((entry) => {
    const previousRank = previousByTeam.get(entry.team) ?? null;
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

/**
 * Grades last week's predictions against what actually happened.
 * Used so a recap can admit, in print, that it was wrong.
 */
export function gradePredictions(predictions, weekAnalysis) {
  if (!predictions?.length) return null;
  const resultByTeam = new Map(weekAnalysis.teamWeeks.map((t) => [t.team, t]));

  const graded = predictions.map((prediction) => {
    const a = resultByTeam.get(prediction.team_a);
    const b = resultByTeam.get(prediction.team_b);
    if (!a || !b) return { ...prediction, graded: false, reason: 'team not found in results' };
    const actualWinner = a.points === b.points ? null : a.points > b.points ? prediction.team_a : prediction.team_b;
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
      correct: actualWinner !== null && actualWinner === prediction.predicted_winner,
      total_score_error: scoreError,
    };
  });

  const scored = graded.filter((g) => g.graded);
  const correct = scored.filter((g) => g.correct).length;
  return {
    results: graded,
    correct,
    total: scored.length,
    accuracy: scored.length ? Number(((correct / scored.length) * 100).toFixed(1)) : null,
  };
}
