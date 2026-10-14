/**
 * Everything the publication remembers, independent of where it is kept.
 *
 * The project's central editorial rule is that history must not be rewritten.
 * A ranking published in week 2 was based on what was known in week 2, and it
 * stays that way forever. That is only possible if each week is written down
 * before the next one happens, which is what the store is for.
 *
 * Layout, by kind (a directory under data/ for the file back end, a key of the
 * memory back end):
 *   raw/<season>/week-<n>.json          exactly what the provider returned (or the saved files it was imported from)
 *   import/<season>/league.json         an imported league (ESPN's manual route)
 *   snapshots/<season>/week-<n>.json    normalized league + analysis
 *   rankings/<season>/<label>.json      a published ranking and its movement
 *   predictions/<season>/week-<n>.json  what we said would happen
 *   market/<season>/week-<n>.json       trade values as fetched for that week
 *   tank-watch/<season>/week-<n>.json   the draft order a tank watch reported
 *
 * This module has no node: imports. A back end supplies four operations:
 *   read(kind, season, file)         → the saved value, or null
 *   write(kind, season, file, value) → where it was written (a path, or a key)
 *   list(kind, season)               → the file names saved for that kind and season
 *   locate(kind, season, file)       → where that file is, saved or not
 */

const WEEK_FILE = /^week-(\d+)\.json$/;

/** The week numbers of the `week-<n>.json` files in a listing, ascending. */
function weeksIn(files) {
  return files
    .map((file) => WEEK_FILE.exec(file))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .sort((a, b) => a - b);
}

/** The store's methods, over any back end. */
export function createStoreOver(backend) {
  const { read, write, list, locate } = backend;
  const weekFile = (week) => `week-${week}.json`;

  const store = {
    /** Where a week's raw bundle and snapshot live, whether or not they exist yet. */
    rawPath(season, week) {
      return locate('raw', season, weekFile(week));
    },
    snapshotPath(season, week) {
      return locate('snapshots', season, weekFile(week));
    },

    saveRaw(season, week, bundle) {
      return write('raw', season, weekFile(week), bundle);
    },
    loadRaw(season, week) {
      return read('raw', season, weekFile(week));
    },
    /**
     * Every raw bundle already saved up to and including `throughWeek`,
     * oldest first. Mirrors loadSnapshotsThrough: fetches nothing, and a week
     * nobody has captured yet is simply absent from the result rather than an
     * error — the FAAB market (src/analysis/faab.mjs) reads a chopped
     * roster's matchup entry out of exactly this, for the week it happened.
     */
    loadRawThrough(season, throughWeek) {
      return weeksIn(list('raw', season))
        .filter((week) => week <= throughWeek)
        .map((week) => store.loadRaw(season, week))
        .filter(Boolean);
    },

    /**
     * A league as the operator saved it from the platform themselves (ESPN's
     * manual import route): `{ provider, importedAt, leagueId, body }`, at
     * import/<season>/league.json. Always under the league folder's data/,
     * never under the package; the provider reads it instead of asking the
     * platform. The newest import replaces the last.
     */
    importedLeaguePath(season) {
      return locate('import', season, 'league.json');
    },
    saveImportedLeague(season, record) {
      return write('import', season, 'league.json', record);
    },
    loadImportedLeague(season) {
      return read('import', season, 'league.json');
    },

    saveSnapshot(season, week, snapshot) {
      return write('snapshots', season, weekFile(week), {
        savedAt: new Date().toISOString(),
        ...snapshot,
      });
    },
    loadSnapshot(season, week) {
      return read('snapshots', season, weekFile(week));
    },
    /** Every completed week up to and including `throughWeek`, oldest first. */
    loadSnapshotsThrough(season, throughWeek) {
      return weeksIn(list('snapshots', season))
        .filter((week) => week <= throughWeek)
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
      return write('rankings', season, `${label}.json`, rankings);
    },
    loadRankings(season, label) {
      return read('rankings', season, `${label}.json`);
    },
    /**
     * The ranking a new edition should measure movement against: the most
     * recent published ranking at or before `beforeWeek`, falling back to the
     * preseason edition.
     */
    loadPreviousRankings(season, beforeWeek) {
      const earlier = weeksIn(list('rankings', season)).filter((week) => week < beforeWeek);
      if (earlier.length) return store.loadRankings(season, `week-${earlier[earlier.length - 1]}`);
      return store.loadRankings(season, 'preseason');
    },

    savePredictions(season, week, predictions) {
      return write('predictions', season, weekFile(week), {
        season: String(season),
        week,
        savedAt: new Date().toISOString(),
        predictions,
      });
    },
    loadPredictions(season, week) {
      return read('predictions', season, weekFile(week));
    },

    /**
     * The trade-value market a week's trades were graded against. Values move
     * daily, so the first fetch for a week is the one that counts: a re-run
     * reads it back and grades against the same numbers.
     */
    saveMarketValues(season, week, snapshot) {
      return write('market', season, weekFile(week), snapshot);
    },
    loadMarketValues(season, week) {
      return read('market', season, weekFile(week));
    },

    /**
     * The draft order a tank watch reported, saved when the edition is built.
     * Kept apart from the week's snapshot so the next tank watch measures
     * movement against what the last one actually printed, however many weeks
     * ago that was.
     */
    saveTankWatch(season, week, draftOrder) {
      return write('tank-watch', season, weekFile(week), {
        season: String(season),
        week,
        savedAt: new Date().toISOString(),
        draftOrder,
      });
    },
    /** The most recent tank watch strictly before `beforeWeek`, or null. */
    loadPreviousTankWatch(season, beforeWeek) {
      const earlier = weeksIn(list('tank-watch', season)).filter((week) => week < beforeWeek);
      if (!earlier.length) return null;
      return read('tank-watch', season, weekFile(earlier[earlier.length - 1]));
    },
  };

  return store;
}

/** A copy that is plain JSON: no Maps, Dates or class instances, and no shared references. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * A store that keeps everything in memory, as plain objects keyed by kind,
 * season and file: `store.data[kind][season][file]`. `initial` has that same
 * shape. Values are copied through JSON on the way in and out, so what is held
 * is always plain JSON and a caller can never alter history by mutating an
 * object it was handed.
 */
export function createMemoryStore(initial = {}) {
  const data = plain(initial);
  const keyOf = (kind, season, file) => `${kind}/${season}/${file}`;

  const store = createStoreOver({
    read(kind, season, file) {
      const value = data[kind]?.[String(season)]?.[file];
      return value === undefined ? null : plain(value);
    },
    write(kind, season, file, value) {
      data[kind] ??= {};
      data[kind][String(season)] ??= {};
      data[kind][String(season)][file] = plain(value);
      return keyOf(kind, season, file);
    },
    list(kind, season) {
      return Object.keys(data[kind]?.[String(season)] ?? {});
    },
    locate: keyOf,
  });

  return Object.assign(store, { data });
}
