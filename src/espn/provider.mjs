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
 * The pipeline never imports this file: src/providers.mjs is the only door.
 */
import { createClient, EspnError } from './client.mjs';
import { normalizeLeague, normalizePlayers, normalizeTeams, normalizeWeek } from './normalize.mjs';
import { guardSeason } from './shape.mjs';

const NAME = 'espn';
const DISPLAY_NAME = 'ESPN';

/** The league views openLeague reads, in one request (doc, "League views"). */
const LEAGUE_VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mDraftDetail'];

/**
 * One week's lineups and scores, with the settings that say which matchup
 * period the week is in (doc, "Matchups and weekly scores").
 */
const WEEK_VIEWS = ['mMatchupScore', 'mScoreboard', 'mSettings'];

/** The season ESPN is asked about: LEAGUE_SEASON. The client refuses a missing one, naming the key. */
const seasonOf = (config) => config?.league?.season ?? config?.season ?? null;

/**
 * Binds the descriptor to a client. `league` is the League this client
 * covers, when the caller already has it; openLeague sets it otherwise.
 */
function instance(client, { config = null, league = null } = {}) {
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
        client.league(['mTransactions2'], { week }),
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

  /** An instance for the league in `config.league`: `{ id, season, secrets }`. */
  fromConfig(config) {
    const id = config?.league?.id ?? '';
    if (!id) {
      throw new EspnError("No ESPN league ID configured. Set ESPN_LEAGUE_ID in the league folder's .env, or run init.");
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

  /** An instance around a client that already exists: a test's stand-in, or an earlier openLeague's. */
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

  /** A saved bundle as WeekData. Reads nothing but the bye table, and that only when a player has no points. */
  normalizeWeek(rawBundle, context = {}) {
    return normalizeWeek(rawBundle, context);
  },
});
