/**
 * Thin wrapper around ESPN's unofficial fantasy football API.
 *
 * HTTP only, like src/sleeper/client.mjs: it retrieves raw ESPN shapes and
 * knows nothing about league concepts. Every URL, view, header and cookie name
 * is from docs/espn-data.md, where most are labelled "assumed": no test league
 * exists, so nothing here has been checked against a live response.
 *
 * COOKIES ARE PASSWORDS. `espn_s2` and `SWID` come in through `secrets` (which
 * the config reads from .env) and nowhere else. They are sent only as a Cookie
 * header on league requests to the ESPN host. They are never logged, never put
 * in an error (every message is scrubbed of them, as a backstop), and never
 * written anywhere: the only thing this client hands out for storage is the
 * player list, through `playerCache`, and its request carries no cookie.
 *
 * Responses are checked by src/espn/shape.mjs. The client checks only what it
 * must to be sure it holds JSON of the right outer kind, and the player list
 * before it is cached.
 */
import { cachedPlayers } from '../playerCache.mjs';
import { EspnShapeError, guardPlayers } from './shape.mjs';
import { HOST, leagueViewsUrl, playersUrl, seasonUrl as seasonAddress } from './urls.mjs';

// Doc, "Players": the filter value is assumed (espn-api requests/espn_requests.py:163-168).
const ACTIVE_PLAYERS_FILTER = JSON.stringify({ filterActive: { value: true } });

class EspnError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EspnError';
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {string} options.leagueId
 * @param {number|string} options.season
 * @param {{get: Function, set: Function}|null} [options.playerCache]  see src/playerCache.mjs;
 *   without one the player list is fetched every time
 * @param {{ ESPN_S2?: string, ESPN_SWID?: string }} [options.secrets]  config.league.secrets
 * @param {typeof fetch} [options.fetch]  injected by tests; defaults to the global fetch
 * @param {(ms: number) => Promise<void>} [options.sleep]  injected by tests so backoff costs no time
 * @param {number} [options.retries]
 */
export function createClient({
  leagueId,
  season,
  playerCache = null,
  secrets = {},
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  sleep = defaultSleep,
  retries = 2,
}) {
  if (!leagueId) throw new EspnError('No ESPN league ID configured. Set ESPN_LEAGUE_ID in .env.');
  if (!/^\d{4}$/.test(String(season ?? ''))) {
    throw new EspnError('No ESPN season configured. Set LEAGUE_SEASON in .env (a four-digit year).');
  }

  const s2 = secrets.ESPN_S2 || undefined;
  const swid = secrets.ESPN_SWID || undefined;
  if ((s2 === undefined) !== (swid === undefined)) {
    throw new EspnError(
      `A private ESPN league needs both cookies, and ${s2 === undefined ? 'ESPN_S2' : 'ESPN_SWID'} is missing. ` +
        'Add it to .env, or remove the other to read a public league.',
    );
  }
  const cookie = s2 === undefined ? undefined : `espn_s2=${s2}; SWID=${swid}`;
  const hasCookies = cookie !== undefined;
  const seasonUrl = seasonAddress(season);

  /** Backstop: no message leaves this module carrying a cookie value, however it was built. */
  const scrub = (text) =>
    [s2, swid, cookie]
      .filter(Boolean)
      .reduce((out, secret) => out.split(secret).join('[cookie removed]'), String(text));
  const refuse = (message, status) => Object.assign(new EspnError(scrub(message)), status ? { status } : {});

  /**
   * One GET, parsed as JSON. 401 and 404 are refusals, not retried. 429 and
   * network failures back off and retry. `withCookies` is true only for league
   * requests: the season and player endpoints need no login (doc).
   */
  async function getJson(url, { headers = {}, withCookies = false, what } = {}) {
    if (new URL(url).host !== HOST) throw refuse(`Refusing to send a request outside ${HOST}.`);
    const sent = { accept: 'application/json', ...headers };
    if (withCookies && hasCookies) sent.cookie = cookie;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, { headers: sent });
      } catch (error) {
        lastError = refuse(`Could not reach ESPN. Check your internet connection. ${error?.message ?? ''}`.trim());
        if (attempt < retries) await sleep(500 * (attempt + 1));
        continue;
      }

      if (response.status === 401) {
        throw refuse(
          hasCookies
            ? `ESPN refused the cookies for ${what} (HTTP 401). This is a private league: ESPN_S2 and ESPN_SWID ` +
                'in .env are wrong or have expired. Copy fresh values of the espn_s2 and SWID cookies from a ' +
                'browser signed in to fantasy.espn.com.'
            : `ESPN says ${what} is a private league (HTTP 401). Add ESPN_S2 and ESPN_SWID to .env: copy the ` +
                'espn_s2 and SWID cookies from a browser signed in to fantasy.espn.com. If they worked before, ' +
                'refresh them.',
          401,
        );
      }
      if (response.status === 404) {
        throw refuse(
          `ESPN has no ${what} (HTTP 404). Check ESPN_LEAGUE_ID (${leagueId}) and LEAGUE_SEASON (${season}) in .env.`,
        );
      }
      if (response.status === 429) {
        lastError = refuse('ESPN rate-limited this request (HTTP 429).');
        if (attempt < retries) await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw refuse(`ESPN returned HTTP ${response.status} for ${what}.`);

      try {
        return await response.json();
      } catch {
        throw new EspnShapeError(what, '(response)', 'is not valid JSON');
      }
    }
    throw refuse(`${lastError?.message ?? 'The request failed.'} Gave up on ${what} after ${retries + 1} tries.`);
  }

  return {
    leagueId,
    seasonId: Number(season),

    /** `seasons/<year>`: season info, no login needed. */
    seasonInfo: () => getJson(seasonUrl, { what: `season ${season}` }),

    /**
     * The league, for one or several views in one request (`view=` repeated),
     * and optionally one scoring period. Returns the raw body, which the
     * caller passes to the matching guard in shape.mjs.
     */
    async league(views, { week } = {}) {
      if (!Array.isArray(views) || views.length === 0) throw new TypeError('league() needs a list of views');
      const what = `league ${leagueId} (${views.join(' + ')})`;
      // Built by src/espn/urls.mjs, as espnImportLinks's are, so the two cannot drift.
      const body = await getJson(leagueViewsUrl({ leagueId, season, views, week }), { withCookies: true, what });
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new EspnShapeError(views.join(' + '), '(response)', 'must be an object');
      }
      return body;
    },

    /**
     * The player list (`players_wl`), cached for a day through `playerCache`
     * (Doc "Players": as Sleeper's is). The request needs no login and carries
     * no cookie, and only a list that passed the shape guard is ever cached or
     * trusted back out of the cache.
     */
    players: ({ refresh = false } = {}) =>
      cachedPlayers({
        cache: playerCache,
        key: `players-espn-${season}`,
        refresh,
        accept: guardPlayers,
        fetchFresh: async () =>
          guardPlayers(
            await getJson(playersUrl(season), {
              headers: { 'x-fantasy-filter': ACTIVE_PLAYERS_FILTER },
              what: `the player list for ${season}`,
            }),
          ),
      }),
  };
}

export { EspnError };
