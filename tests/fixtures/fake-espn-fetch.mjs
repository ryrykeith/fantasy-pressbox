/**
 * A stand-in for ESPN's fantasy API, so no ESPN test touches the network.
 *
 * SOURCE OF THE SHAPES, AND THEY ARE UNVERIFIED: the URLs, views, headers,
 * cookie names and status codes follow docs/espn-data.md ("Host", "Endpoints
 * used", "Authentication"), which is itself built from community clients and
 * unchecked against a live league. The one 401 fact the doc marks
 * operator-checked is the message text; the body structure around it is a
 * placeholder. Responses come from mock-espn-league.mjs, all invented.
 *
 * Modelled on fake-sleeper-fetch.mjs. It serves:
 *   - a public league (PUBLIC_LEAGUE_ID), a rolling-waiver one and one with a
 *     two-week matchup period, none needing cookies;
 *   - a private league (PRIVATE_LEAGUE_ID) that answers 401 without both
 *     fixture cookies, and the same payload with them;
 *   - 404 for any other league ID or any season but the fixture's;
 *   - the season endpoint and players_wl, which need no login;
 *   - week 4's transactions, and none for any other week.
 * Any other URL rejects, as a stranded network call would fail loudly, so a
 * request this file doesn't know about can never go anywhere.
 *
 * Two ways in:
 *   - in process: `import { createFakeEspnFetch } ...` and pass it as the
 *     client's fetch, or assign it to globalThis.fetch for the test;
 *   - spawned: `FAKE_ESPN_INSTALL=1 node --import ./tests/fixtures/fake-espn-fetch.mjs ...`
 *     replaces the global fetch. FAKE_ESPN_LOG, when set, gets each URL asked
 *     for, one per line (never a cookie), so a test can show what was fetched.
 */
import { appendFileSync } from 'node:fs';

import {
  FIXTURE_COOKIES,
  LEAGUE_BY_ID,
  PLAYERS_WL,
  SEASON,
  SEASON_RESPONSE,
} from './mock-espn-league.mjs';

const HOST = 'lm-api-reads.fantasy.espn.com';
const MATCHUP_VIEWS = ['mMatchup', 'mMatchupScore', 'mScoreboard', 'mBoxscore'];
const OTHER_VIEWS = ['mSettings', 'mTeam', 'mRoster', 'mTransactions2', 'mDraftDetail'];

/** The 401 body. Only the message text is operator-checked (doc, "Authentication"). */
const UNAUTHORIZED = { details: [{ message: 'You are not authorized to view this League.' }] };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

/** True only when the Cookie header carries both fixture cookies with the fixture values. */
export function hasFixtureCookies(cookieHeader) {
  if (!cookieHeader) return false;
  const sent = Object.fromEntries(
    String(cookieHeader).split(';').map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
    }),
  );
  return Object.entries(FIXTURE_COOKIES).every(([name, value]) => sent[name] === value);
}

function mergeById(a = [], b = []) {
  const byId = new Map(a.map((item) => [item.id, item]));
  for (const item of b) byId.set(item.id, { ...byId.get(item.id), ...item });
  return [...byId.values()];
}

/** The league response for the views asked for, as one request with several view= parameters returns them. */
function leagueResponse(league, views, scoringPeriodId) {
  // Transactions are fixtures for week 4 only; any other week has none.
  if (scoringPeriodId !== undefined && scoringPeriodId !== league.scoredWeek && views.includes('mTransactions2')) {
    views = views.filter((view) => view !== 'mTransactions2');
    const rest = views.length ? leagueResponse(league, views, scoringPeriodId) : {};
    const { transactions, ...base } = league.views.mTransactions2;
    return { ...base, ...rest, transactions: [] };
  }
  let body = {};
  for (const view of views) {
    let part;
    if (MATCHUP_VIEWS.includes(view)) {
      // A week the fixture has lineups for (week 4, and week 5 unplayed), else the season schedule.
      part = (scoringPeriodId !== undefined && league.views[`mMatchupWeek${scoringPeriodId}`]) || league.views.mMatchup;
    } else if (OTHER_VIEWS.includes(view)) {
      part = league.views[view];
    } else {
      throw new Error(`fake ESPN fetch: no fixture for view "${view}"`);
    }
    body = { ...body, ...part, ...(body.teams || part.teams ? { teams: mergeById(body.teams, part.teams) } : {}) };
  }
  return body;
}

/**
 * @param {{ log?: (url: string) => void }} [options]
 * @returns {(url: string | URL, init?: { headers?: object }) => Promise<Response>}
 */
export function createFakeEspnFetch({ log } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    log?.(String(input));
    if (url.host !== HOST) {
      throw new Error(`fake ESPN fetch: refusing a request outside the fixture host: ${url.host}`);
    }

    const season = /\/apis\/v3\/games\/ffl\/seasons\/(\d+)(\/.*)?$/.exec(url.pathname);
    if (!season) throw new Error(`fake ESPN fetch: no fixture for ${url.pathname}`);
    if (Number(season[1]) !== SEASON) return json({ message: 'No such season' }, 404);
    const rest = season[2] ?? '';

    if (rest === '' && !url.searchParams.has('view')) return json(SEASON_RESPONSE);
    if (rest === '/players' && url.searchParams.get('view') === 'players_wl') return json(PLAYERS_WL);

    const leagueMatch = /^\/segments\/0\/leagues\/([^/]+)$/.exec(rest);
    if (!leagueMatch) throw new Error(`fake ESPN fetch: no fixture for ${url.pathname}${url.search}`);
    const entry = LEAGUE_BY_ID[leagueMatch[1]];
    if (!entry) return json({ message: 'No such league' }, 404);
    if (entry.private && !hasFixtureCookies(headerValue(init.headers, 'cookie'))) return json(UNAUTHORIZED, 401);

    const views = url.searchParams.getAll('view');
    if (views.length === 0) throw new Error('fake ESPN fetch: a league request with no view');
    const week = url.searchParams.get('scoringPeriodId');
    return json(leagueResponse(entry.league, views, week === null ? undefined : Number(week)));
  };
}

if (process.env.FAKE_ESPN_INSTALL === '1') {
  const log = process.env.FAKE_ESPN_LOG
    ? (url) => appendFileSync(process.env.FAKE_ESPN_LOG, `${url}\n`)
    : undefined;
  globalThis.fetch = createFakeEspnFetch({ log });
}
