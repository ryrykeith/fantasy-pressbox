/**
 * Sleeper, behind the provider interface (docs/plans/espn-football.md §6).
 *
 * The pipeline never imports this file: it asks src/providers.mjs, the
 * registry, for the league's provider and calls the methods below. Everything
 * here hands back the shared shapes (League, Team, Player, WeekData,
 * DraftCapital); Sleeper's field names stay in src/sleeper/.
 *
 * Two layers:
 *   - the descriptor (`sleeperProvider`): what Sleeper is and can do, plus the
 *     pure `normalizeWeek`, which reading saved history needs without a client;
 *   - an instance (`fromConfig`, `forClient`): the descriptor bound to a
 *     client for one league, which fetches.
 */
import { createClient, SleeperError } from './client.mjs';
import {
  normalizeLeague,
  normalizePlayers,
  normalizeTeams,
  normalizeTradedPicks,
  normalizeWeek,
} from './normalize.mjs';

const NAME = 'sleeper';
const DISPLAY_NAME = 'Sleeper';

/** A normalized League, tagged with the provider it came from. */
function leagueFrom(rawLeague, { declaredFormatType = null } = {}) {
  return { ...normalizeLeague(rawLeague, { declaredFormatType }), provider: NAME };
}

/**
 * Binds the descriptor to a client.
 *
 * `league` is the League this client covers, when it is already known (a
 * caller that opened it earlier); openLeague sets it otherwise. fetchWeek
 * stamps its id into the saved bundle, as every bundle has always carried.
 */
function instance(client, { config = null, league = null } = {}) {
  let current = league;
  return {
    ...sleeperProvider,
    client,

    /** → { league, teams, players, draftCapital } */
    async openLeague({ refreshPlayers = false } = {}) {
      const [rawLeague, users, rosters, tradedPicks] = await Promise.all([
        client.league(),
        client.users(),
        client.rosters(),
        client.tradedPicks(),
      ]);
      // Normalized once per run (src/league/players.mjs): the file is around
      // 12,000 players, and nothing past src/sleeper/ reads Sleeper's field names.
      const players = normalizePlayers(await client.players({ refresh: refreshPlayers }));
      current = leagueFrom(rawLeague, { declaredFormatType: config?.leagueFormat ?? null });
      return {
        league: current,
        teams: normalizeTeams({ rosters, users }),
        players,
        draftCapital: { tradedPicks: normalizeTradedPicks(tradedPicks) },
      };
    },

    /** One week as Sleeper reports it, saved as is. The caller adds `provider`. */
    async fetchWeek(week) {
      const [matchups, transactions] = await Promise.all([client.matchups(week), client.transactions(week)]);
      return {
        fetchedAt: new Date().toISOString(),
        leagueId: current?.id ?? client.leagueId ?? null,
        week,
        matchups,
        transactions,
      };
    },

    /**
     * Sleeper's own idea of the current week: the league's, else the NFL
     * state's. Null when neither says.
     */
    async currentWeek({ league: known = current } = {}) {
      let week = known?.currentWeek ?? null;
      if (!week) {
        const state = await client.state();
        week = state?.week ?? null;
      }
      return { week, source: `${DISPLAY_NAME} (current week)` };
    },
  };
}

export const sleeperProvider = Object.freeze({
  name: NAME,
  displayName: DISPLAY_NAME,
  experimental: false,
  capabilities: Object.freeze({
    futurePicks: true,
    taxi: true,
    guillotine: true,
    lastScoredWeek: true,
    seasonPotentialPoints: true,
    playerAge: true,
    managerNames: true,
    scoringDefaults: true,
  }),
  // FantasyCalc keys its players by Sleeper ID.
  playerIdSpace: 'sleeper',

  /** An instance for the league in `config.league`; refuses a missing ID, naming the fix. */
  fromConfig(config) {
    const id = config?.league?.id ?? config?.leagueId ?? '';
    if (!id) {
      throw new SleeperError(
        'No Sleeper league ID configured. Set SLEEPER_LEAGUE_ID in the league folder\'s .env, or run init.',
      );
    }
    return instance(createClient({ leagueId: id, playerCache: config.playerCache ?? null }), { config });
  },

  /**
   * An instance around a client that already exists: a test's stand-in, or
   * a caller that holds the client from an earlier openLeague.
   */
  forClient(client, { config = null, league = null } = {}) {
    return instance(client, { config, league });
  },

  /** The League with this ID, for setup's confirmation. Sleeper needs no secrets. */
  async lookupLeague({ id, declaredFormatType = null } = {}) {
    const raw = await createClient({ leagueId: id }).league();
    return leagueFrom(raw, { declaredFormatType });
  },

  /** A saved bundle as WeekData. Pure: reads nothing, fetches nothing. */
  normalizeWeek(rawBundle, context = {}) {
    return normalizeWeek(rawBundle, context);
  },
});
