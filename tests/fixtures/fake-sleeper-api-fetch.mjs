/**
 * A stand-in for the whole Sleeper API, preloaded into a spawned process with
 * `node --import ./tests/fixtures/fake-sleeper-api-fetch.mjs ...`.
 *
 * It answers every endpoint src/sleeper/client.mjs calls (state, league, users,
 * rosters, players/nfl, matchups/<week>, transactions/<week>, traded_picks,
 * drafts) for the invented league in week-data-league.mjs, and refuses any
 * other address with an error, so a test cannot reach the network or miss an
 * endpoint the client started using. Every URL asked for is appended to
 * FAKE_SLEEPER_API_LOG, when set.
 *
 * Distinct from fake-sleeper-fetch.mjs, which serves only `/league/<id>` for
 * the init questionnaire.
 */
import { appendFileSync } from 'node:fs';

import { RAW_PLAYERS, RAW_ROSTERS, RAW_USERS, RAW_WEEKS, STARTING_SLOTS } from './week-data-league.mjs';

export const FAKE_LEAGUE_ID = '000000000000000000';
const BASE = 'https://api.sleeper.app/v1';

const RAW_LEAGUE = {
  league_id: FAKE_LEAGUE_ID,
  name: 'Invented Week Data League',
  season: '2026',
  season_type: 'regular',
  sport: 'nfl',
  status: 'in_season',
  roster_positions: [...STARTING_SLOTS, 'BN', 'BN'],
  scoring_settings: { rec: 1, pass_td: 4 },
  settings: { num_teams: 4, leg: 2, last_scored_leg: 1, playoff_teams: 2, draft_rounds: 3 },
};

const NFL_STATE = { season: '2026', season_type: 'regular', week: 2, leg: 2 };

function answer(url) {
  if (!String(url).startsWith(BASE)) return undefined;
  const path = String(url).slice(BASE.length);
  const league = `/league/${FAKE_LEAGUE_ID}`;
  if (path === '/state/nfl') return NFL_STATE;
  if (path === '/players/nfl') return RAW_PLAYERS;
  if (path === league) return RAW_LEAGUE;
  if (path === `${league}/users`) return RAW_USERS;
  if (path === `${league}/rosters`) return RAW_ROSTERS;
  if (path === `${league}/traded_picks`) return [];
  if (path === `${league}/drafts`) return [];
  const week = /^\/league\/(\d+)\/(matchups|transactions)\/(\d+)$/.exec(path);
  if (week && week[1] === FAKE_LEAGUE_ID) return RAW_WEEKS[week[3]]?.[week[2]] ?? [];
  return undefined;
}

globalThis.fetch = async (url) => {
  if (process.env.FAKE_SLEEPER_API_LOG) appendFileSync(process.env.FAKE_SLEEPER_API_LOG, `${url}\n`);
  const body = answer(url);
  if (body === undefined) throw new Error(`the fake Sleeper API does not answer ${url}`);
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
