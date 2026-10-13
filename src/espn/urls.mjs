/**
 * Every ESPN address this package knows how to build, in one place.
 *
 * Two readers share it so they cannot drift apart:
 *   - src/espn/client.mjs, which requests these addresses (ESPN_ROUTE=fetch);
 *   - espnImportLinks below, which lists the same addresses for a person to
 *     open in their own signed-in browser and save (ESPN_ROUTE=import).
 *
 * NODE-FREE: this module imports nothing, so the browser core can reuse it.
 *
 * The host, the path and the view names are from docs/espn-data.md ("Host",
 * "Endpoints used", "League views"); most are labelled assumed there.
 */

export const HOST = 'lm-api-reads.fantasy.espn.com';
export const BASE = `https://${HOST}/apis/v3/games/ffl`;

/** The league views openLeague reads, in one request (doc, "League views"). */
export const LEAGUE_VIEWS = Object.freeze(['mSettings', 'mTeam', 'mRoster', 'mDraftDetail']);

/**
 * One week's lineups and scores, with the settings that say which matchup
 * period the week is in (doc, "Matchups and weekly scores").
 */
export const WEEK_VIEWS = Object.freeze(['mMatchupScore', 'mScoreboard', 'mSettings']);

/** One week's transactions: a request of its own (doc, "Transactions and waivers"). */
export const TRANSACTION_VIEWS = Object.freeze(['mTransactions2']);

/** `seasons/<year>`: season info. */
export function seasonUrl(season) {
  return `${BASE}/seasons/${season}`;
}

/** The player list (`players_wl`). The request also needs a header, so it cannot be opened in a browser. */
export function playersUrl(season) {
  return `${seasonUrl(season)}/players?view=players_wl`;
}

/** A league, with no views. */
export function leagueUrl({ leagueId, season }) {
  return `${seasonUrl(season)}/segments/0/leagues/${leagueId}`;
}

/**
 * A league for one or several views in one request (`view=` repeated), and
 * optionally one scoring period (`scoringPeriodId=`).
 */
export function leagueViewsUrl({ leagueId, season, views, week }) {
  if (!Array.isArray(views) || views.length === 0) throw new TypeError('a league address needs a list of views');
  const query = views.map((v) => `view=${encodeURIComponent(v)}`);
  if (week !== undefined) query.push(`scoringPeriodId=${encodeURIComponent(week)}`);
  return `${leagueUrl({ leagueId, season })}?${query.join('&')}`;
}

/**
 * The addresses to open and save for the manual import route: exactly the
 * requests the ESPN provider makes for the same league, season and weeks.
 *
 *   league         LEAGUE_VIEWS, as openLeague reads
 *   weeks[].matchups      WEEK_VIEWS for that scoring period, as fetchWeek reads
 *   weeks[].transactions  TRANSACTION_VIEWS for that scoring period, fetchWeek's second request
 *
 * There is no player-list address: that request needs a header a browser
 * visit cannot send, so the import names players from the saved rosters.
 *
 * @param {{ leagueId: string|number, season: string|number, weeks?: number[] }} options
 * @returns {{ league: string, weeks: { week: number, matchups: string, transactions: string }[] }}
 */
export function espnImportLinks({ leagueId, season, weeks = [] } = {}) {
  if (!/^\d+$/.test(String(leagueId ?? ''))) {
    throw new TypeError('espnImportLinks needs the ESPN league ID (ESPN_LEAGUE_ID), as digits');
  }
  if (!/^\d{4}$/.test(String(season ?? ''))) {
    throw new TypeError('espnImportLinks needs the season (LEAGUE_SEASON), a four-digit year');
  }
  for (const week of weeks) {
    if (!Number.isInteger(week) || week < 1) throw new TypeError(`espnImportLinks: week ${week} is not a week number`);
  }
  return {
    league: leagueViewsUrl({ leagueId, season, views: LEAGUE_VIEWS }),
    weeks: weeks.map((week) => ({
      week,
      matchups: leagueViewsUrl({ leagueId, season, views: WEEK_VIEWS, week }),
      transactions: leagueViewsUrl({ leagueId, season, views: TRANSACTION_VIEWS, week }),
    })),
  };
}
