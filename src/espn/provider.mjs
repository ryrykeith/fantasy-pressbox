/**
 * ESPN, behind the provider interface (docs/plans/espn-football.md §6).
 *
 * EXPERIMENTAL. Every response shape this reads is from docs/espn-data.md,
 * mostly "assumed", and none has been checked against a live league. Each
 * response passes its shape guard (src/espn/shape.mjs) before it is read.
 *
 * Built like src/sleeper/provider.mjs:
 *   - the descriptor (`espnProvider`): what ESPN is and can do, plus the pure
 *     `normalizeWeek` that reading saved history needs without a client;
 *   - an instance (`fromConfig`, `forClient`): the descriptor bound to a
 *     client for one league, which fetches.
 *
 * Two routes (ESPN_ROUTE, config.league.route):
 *   - import, the default: the operator saves ESPN's pages from their own
 *     browser and `import-espn` reads them (src/espn/import.mjs). The
 *     instance (`importInstance`) reads only what was saved under the league
 *     folder's data/ and NEVER contacts ESPN, for openLeague, fetchWeek and
 *     currentWeek alike. No cookie is read.
 *   - fetch, an opt-in: the client asks ESPN's servers (`instance`).
 *
 * The pipeline never imports this file: src/providers.mjs is the only door.
 */
import { createStore } from '../store.mjs';
import { createClient, EspnError } from './client.mjs';
import {
  EspnImportError,
  MAX_IMPORT_BYTES,
  importInstructions,
  importedPlayers,
  classifySaved,
  importedWeekBundle,
  latestScoringPeriod,
  parseSavedFile,
  leagueAsOf,
  readSavedFiles,
} from './import.mjs';
import { normalizeLeague, normalizePlayers, normalizeTeams, normalizeWeek } from './normalize.mjs';
import { guardSeason } from './shape.mjs';
import { LEAGUE_VIEWS, TRANSACTION_VIEWS, WEEK_VIEWS, espnImportLinks } from './urls.mjs';

const NAME = 'espn';
const DISPLAY_NAME = 'ESPN';

/** ESPN_ROUTE when .env has none (src/config.mjs, DEFAULT_ESPN_ROUTE). */
const DEFAULT_ROUTE = 'import';

/** The season ESPN is asked about: LEAGUE_SEASON. The client refuses a missing one, naming the key. */
const seasonOf = (config) => config?.league?.season ?? config?.season ?? null;

/**
 * Binds the descriptor to a client. `league` is the League this client
 * covers, when the caller already has it; openLeague sets it otherwise.
 * An import source (createImportSource) gets the import instance instead.
 */
function instance(client, { config = null, league = null } = {}) {
  if (client?.route === 'import') return importInstance(client, { config, league });
  let current = league;
  return {
    ...espnProvider,
    client,

    /**
     * → { league, teams, players, draftCapital }. draftCapital is null: ESPN
     * reports no traded future picks (plan §6; doc, "Draft picks").
     */
    async openLeague({ refreshPlayers = false } = {}) {
      const body = await client.league(LEAGUE_VIEWS);
      current = normalizeLeague(
        { mSettings: body, mDraftDetail: body },
        { leagueId: client.leagueId, declaredFormatType: config?.leagueFormat ?? null },
      );
      const teams = normalizeTeams({ mTeam: body, mRoster: body, mSettings: body });
      const players = normalizePlayers(await client.players({ refresh: refreshPlayers }));
      return { league: current, teams, players, draftCapital: null };
    },

    /**
     * One week as ESPN reports it, saved as is (the caller adds `provider`).
     * Two requests: the week's matchups with settings, and its transactions.
     * Nothing in either carries a cookie.
     */
    async fetchWeek(week) {
      const [matchups, transactions] = await Promise.all([
        client.league(WEEK_VIEWS, { week }),
        client.league(TRANSACTION_VIEWS, { week }),
      ]);
      return {
        fetchedAt: new Date().toISOString(),
        leagueId: current?.id ?? (client.leagueId === undefined ? null : String(client.leagueId)),
        week,
        matchups,
        transactions,
      };
    },

    /**
     * ESPN's current week: the League's (the league's scoring period, capped
     * at the final one), else the season endpoint's current scoring period.
     */
    async currentWeek({ league: known = current } = {}) {
      let week = known?.currentWeek ?? null;
      if (!week) week = guardSeason(await client.seasonInfo()).currentScoringPeriod.id;
      return { week, source: `${DISPLAY_NAME} (current week)` };
    },
  };
}

/**
 * Where an imported league is read from: the league folder's data/, through
 * the store. It stands where a client would (`instance.client`), so a caller
 * that wraps "the client" again (providerInstance) gets the import instance
 * back, never a fetching one. It has no fetch and no cookies.
 */
export function createImportSource({ leagueId, season, dataDir, store = null }) {
  if (!leagueId) throw new EspnError('No ESPN league ID configured. Set ESPN_LEAGUE_ID in .env.');
  if (!/^\d{4}$/.test(String(season ?? ''))) {
    throw new EspnError('No ESPN season configured. Set LEAGUE_SEASON in .env (a four-digit year).');
  }
  return Object.freeze({
    route: 'import',
    leagueId: String(leagueId),
    seasonId: Number(season),
    season: String(season),
    store: store ?? createStore({ dataDir }),
  });
}

/** Every saved ESPN week bundle for the season, oldest week first. */
function savedEspnBundles(source) {
  return source.store
    .loadRawThrough(source.season, Number.POSITIVE_INFINITY)
    .filter((bundle) => bundle?.provider === NAME && bundle.matchups);
}

/** The refusal for anything not yet imported: what to save, and the command. */
function notImported(source, what, { week = null } = {}) {
  return new EspnImportError(
    `${what} has not been imported yet.\n\n${importInstructions({ leagueId: source.leagueId, season: source.season, week })}`,
  );
}

/**
 * The import route's instance. Reads only what `import-espn` saved:
 * import/<season>/league.json and the raw week bundles. Nothing here calls
 * fetch, and no cookie is read.
 */
function importInstance(source, { config = null, league = null } = {}) {
  let current = league;
  return {
    ...espnProvider,
    client: source,
    route: 'import',

    /**
     * → { league, teams, players, draftCapital } from the saved league page.
     * The League's current week and last scored week come from the latest
     * scoring period any saved page shows (latestScoringPeriod). Players come
     * from the saved rosters and lineups (importedPlayers). `refreshPlayers`
     * means nothing here: there is no player list to download.
     */
    async openLeague() {
      const saved = source.store.loadImportedLeague(source.season);
      if (!saved?.body) throw notImported(source, `The ESPN league (${source.leagueId}, ${source.season})`);
      const bundles = savedEspnBundles(source);
      const latest = latestScoringPeriod({ league: saved.body, bundles, seen: saved.seenScoringPeriod ?? null });
      const body = leagueAsOf(saved.body, latest);
      current = normalizeLeague(
        { mSettings: body, mDraftDetail: body },
        { leagueId: source.leagueId, declaredFormatType: config?.leagueFormat ?? null },
      );
      const teams = normalizeTeams({ mTeam: body, mRoster: body, mSettings: body });
      const players = importedPlayers({ league: saved.body, bundles });
      return { league: current, teams, players, draftCapital: null };
    },

    /**
     * The imported week, as fetchWeek on the fetch route returns it. A week
     * not imported is refused, naming the addresses to save.
     */
    async fetchWeek(week) {
      const bundle = source.store.loadRaw(source.season, week);
      if (bundle?.provider !== NAME || !bundle.matchups) throw notImported(source, `Week ${week}`, { week });
      const { provider, ...rest } = bundle;
      return rest;
    },

    /** The League's current week, else the latest scoring period any saved page shows. */
    async currentWeek({ league: known = current } = {}) {
      let week = known?.currentWeek ?? null;
      if (!week) {
        const record = source.store.loadImportedLeague(source.season);
        const saved = record?.body ?? null;
        const latest = latestScoringPeriod({
          league: saved,
          bundles: savedEspnBundles(source),
          seen: record?.seenScoringPeriod ?? null,
        });
        const final = saved?.status?.finalScoringPeriod;
        week = latest === null ? null : Number.isInteger(final) ? Math.min(latest, final) : latest;
      }
      if (!week) throw notImported(source, `The ESPN league (${source.leagueId}, ${source.season})`);
      return { week, source: `${DISPLAY_NAME} (the latest saved page)` };
    },

    /**
     * Reads saved files (`[{ file, text }]`), checks every one, then saves
     * them under the league folder's data/: the league page as the imported
     * league, a week's pages as that week's raw bundle tagged `espn`.
     * Nothing is saved unless every file passes.
     *
     * A week imported without its transactions file keeps the transactions
     * an earlier import of that week saved; with none, they are unavailable
     * (`transactions: null`). A transactions file alone needs the week's
     * matchups saved already.
     *
     * → { leaguePath, rawPath, week, transactionsUnavailable, files }
     */
    importFiles({ files, week = null, importedAt = new Date().toISOString() }) {
      const read = readSavedFiles(files, {
        leagueId: source.leagueId,
        season: source.season,
        week,
        declaredFormatType: config?.leagueFormat ?? null,
      });
      if (!read.league && !read.matchups && !read.transactions) {
        throw new EspnImportError(`No saved files were given.\n\n${importInstructions({ ...source, week })}`);
      }

      let bundle = null;
      if ((read.matchups || read.transactions) && !read.league && !source.store.loadImportedLeague(source.season)?.body) {
        throw new EspnImportError(
          `The league page has not been imported, and a week cannot be read without it (its teams and settings). ` +
            `Import it with the week's files.\n\n${importInstructions({ ...source, week })}`,
        );
      }
      if (read.matchups || read.transactions) {
        const earlier = source.store.loadRaw(source.season, week);
        const earlierEspn = earlier?.provider === NAME ? earlier : null;
        const matchups = read.matchups ?? earlierEspn?.matchups ?? null;
        if (!matchups) {
          throw new EspnImportError(
            `${read.files.transactions} is week ${week}'s transactions, but week ${week}'s matchups have not been ` +
              `imported. Import them together.\n\n${importInstructions({ ...source, week })}`,
            { file: read.files.transactions },
          );
        }
        bundle = {
          provider: NAME,
          ...importedWeekBundle({
            leagueId: source.leagueId,
            week,
            matchups,
            transactions: read.transactions ?? earlierEspn?.transactions ?? null,
            importedAt,
          }),
        };
      }

      // The furthest period any league page has shown is kept, so replacing
      // the page with an older save never moves the season backwards.
      const previous = read.league ? source.store.loadImportedLeague(source.season) : null;
      const leaguePath = read.league
        ? source.store.saveImportedLeague(source.season, {
            provider: NAME,
            importedAt,
            leagueId: source.leagueId,
            seenScoringPeriod: latestScoringPeriod({
              league: read.league,
              seen: previous?.seenScoringPeriod ?? previous?.body?.scoringPeriodId ?? null,
            }),
            body: read.league,
          })
        : null;
      const rawPath = bundle ? source.store.saveRaw(source.season, week, bundle) : null;
      return {
        leaguePath,
        rawPath,
        week: bundle ? week : null,
        transactionsUnavailable: bundle ? bundle.transactions === null : false,
        files: read.files,
      };
    },
  };
}

export const espnProvider = Object.freeze({
  name: NAME,
  displayName: DISPLAY_NAME,
  // Unchecked against a live league (docs/espn-data.md).
  experimental: true,
  capabilities: Object.freeze({
    futurePicks: false,
    taxi: false,
    guillotine: false,
    // ESPN reports no last scored week. The League's lastScoredWeek follows
    // plan risk R6 instead: a week is settled once the league's current
    // scoring period is past it (src/espn/normalize.mjs; doc, "Working out
    // the week"), so a week still being played is never settled.
    lastScoredWeek: true,
  }),
  // FantasyCalc's espnId (task 6.1 keys market values by it).
  playerIdSpace: 'espn',

  /** The largest saved file the import reads, in bytes: the CLI checks it before reading one. */
  importMaxBytes: MAX_IMPORT_BYTES,

  /**
   * The addresses to save for the import route: exactly the requests the
   * fetch route makes (src/espn/urls.mjs, espnImportLinks).
   */
  importLinks({ leagueId, season, weeks = [] }) {
    return espnImportLinks({ leagueId, season, weeks });
  },

  /** The import route's instructions as text: the addresses and the command. */
  importInstructions({ leagueId, season, week = null }) {
    return importInstructions({ leagueId, season, week });
  },

  /**
   * An instance for the league in `config.league`: `{ id, season, route,
   * secrets }`. The route decides which: import (the default, also when
   * absent) reads only saved files; fetch asks ESPN with the cookies.
   */
  fromConfig(config) {
    const id = config?.league?.id ?? '';
    if (!id) {
      throw new EspnError("No ESPN league ID configured. Set ESPN_LEAGUE_ID in the league folder's .env, or run init.");
    }
    if ((config.league.route ?? DEFAULT_ROUTE) === 'import') {
      // Never reads config.league.secrets: the import route needs no cookies.
      return importInstance(createImportSource({ leagueId: id, season: seasonOf(config), dataDir: config.dataDir }), {
        config,
      });
    }
    return instance(
      createClient({
        leagueId: id,
        season: seasonOf(config),
        dataDir: config.dataDir,
        secrets: config.league.secrets ?? {},
      }),
      { config },
    );
  },

  /**
   * An instance around a client that already exists: a test's stand-in, or an
   * earlier openLeague's. An import source gives the import instance.
   */
  forClient(client, { config = null, league = null } = {}) {
    return instance(client, { config, league });
  },

  /**
   * The League with this ID, for setup's confirmation. A private league needs
   * its cookies (`secrets`: ESPN_S2 and ESPN_SWID), and ESPN needs the season.
   * Nothing is written: the player list, the one thing the client caches, is
   * not fetched.
   */
  async lookupLeague({ id, season = null, secrets = {}, declaredFormatType = null } = {}) {
    const client = createClient({ leagueId: id, season, dataDir: null, secrets });
    const body = await client.league(['mSettings', 'mDraftDetail']);
    return normalizeLeague({ mSettings: body, mDraftDetail: body }, { leagueId: id, declaredFormatType });
  },

  /**
   * The League a saved league page shows, for setup to show back. Reads the
   * text it is given and nothing else: no request, no cookie, nothing saved.
   * The page must be the league address's, for this league and season.
   */
  readImportedLeague({ file, text, leagueId, season, declaredFormatType = null }) {
    const body = parseSavedFile(text, { file });
    if (classifySaved(body, { file }) !== 'league') {
      throw new EspnImportError(
        `${file} is not the league page. Save the league address (the first one listed) and give that file.`,
        { file },
      );
    }
    readSavedFiles([{ file, text }], { leagueId, season, declaredFormatType });
    return normalizeLeague({ mSettings: body, mDraftDetail: body }, { leagueId, declaredFormatType });
  },

  /** A saved bundle as WeekData. Reads nothing but the bye table, and that only when a player has no points. */
  normalizeWeek(rawBundle, context = {}) {
    return normalizeWeek(rawBundle, context);
  },
});
