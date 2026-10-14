/**
 * A whole invented season of a 12-team superflex dynasty league on Sleeper,
 * in the raw shapes Sleeper's API returns: 28 players a roster (three on the
 * taxi squad), 17 weeks of matchups, eight transactions a week (one failed
 * waiver claim) and a trade every third week. Generated from a fixed seed,
 * so every run is the same season.
 *
 * Built to measure a full season's league file
 * (scripts/measure-league-file.mjs). `installFakeSleeper` replaces the global
 * fetch with a stand-in for every endpoint src/sleeper/client.mjs calls, and
 * `fakeFantasyCalc` answers the trade-value market. Neither touches the
 * network; an address they do not know is an error.
 *
 * Team names are the test cast's (mock-dynasty-league.mjs); every other name,
 * ID and number is invented. Not a test file itself: `npm test` only runs
 * tests/*.test.mjs.
 */
import { TEAMS_AFTER_WEEK_4 } from './mock-dynasty-league.mjs';

export const LEAGUE_ID = '000000000000000000';
export const SEASON = '2026';
export const WEEKS = 17;
export const TEAMS = 12;
const STARTERS = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX', 'K', 'DEF'];
const BENCH = 13;
const TAXI = 3;
const FREE_AGENTS = 150;
const ROSTER_SHAPE = ['QB', 'QB', 'QB', 'RB', 'RB', 'RB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'WR', 'WR', 'WR', 'WR',
  'TE', 'TE', 'TE', 'K', 'DEF', 'RB', 'WR', 'TE'];
export const ROSTER_SIZE = ROSTER_SHAPE.length + TAXI;

/** A seeded generator of numbers from 0 to 1. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = random(20261014);
const pick = (list) => list[Math.floor(rand() * list.length)];
const round2 = (n) => Math.round(n * 100) / 100;

const NFL = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];
const FIRST = ['Quinn', 'Rex', 'Wes', 'Tad', 'Case', 'Dale', 'Wade', 'Lane', 'Moss', 'Pike', 'Holt', 'Bloom', 'Arlo', 'Brock', 'Cy'];
const LAST = ['Arms', 'Carter', 'Lane', 'Bloom', 'Holt', 'Moss', 'Pike', 'Stone', 'Vale', 'Reed', 'Fox', 'Hart', 'Cole', 'Shaw'];

/** Sleeper's /players/nfl, cut to the players this league uses. */
const players = {};
let nextId = 9000;
function addPlayer(position) {
  const id = String(nextId++);
  players[id] = {
    full_name: position === 'DEF' ? `${pick(NFL)} Defense` : `${pick(FIRST)} ${pick(LAST)}`,
    first_name: 'Invented',
    last_name: 'Player',
    position,
    fantasy_positions: [position],
    team: pick(NFL),
    age: position === 'DEF' ? null : 21 + Math.floor(rand() * 13),
    injury_status: rand() < 0.08 ? 'Questionable' : null,
    years_exp: Math.floor(rand() * 10),
  };
  return id;
}

const users = [];
const rosters = [];
for (let r = 1; r <= TEAMS; r++) {
  const ids = ROSTER_SHAPE.map(addPlayer);
  const taxi = [addPlayer('WR'), addPlayer('RB'), addPlayer('QB')];
  const byPos = (pos) => ids.filter((id) => players[id].position === pos);
  const starters = [
    byPos('QB')[0], byPos('RB')[0], byPos('RB')[1], byPos('WR')[0], byPos('WR')[1], byPos('WR')[2], byPos('TE')[0],
    byPos('RB')[2], byPos('WR')[3], byPos('QB')[1], byPos('K')[0], byPos('DEF')[0],
  ];
  users.push({ user_id: `u${r}`, display_name: `invented_manager_${r}`, metadata: { team_name: TEAMS_AFTER_WEEK_4[r - 1].name } });
  rosters.push({
    roster_id: r,
    owner_id: `u${r}`,
    players: [...ids, ...taxi],
    starters,
    taxi,
    reserve: [],
    settings: { wins: 0, losses: 0, ties: 0, fpts: 0, fpts_decimal: 0, ppts: 0, waiver_budget_used: 0 },
  });
}
const freeAgents = Array.from({ length: FREE_AGENTS }, () => addPlayer(pick(['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'])));

const league = {
  league_id: LEAGUE_ID,
  name: 'Invented Full Season League',
  season: SEASON,
  season_type: 'regular',
  sport: 'nfl',
  status: 'in_season',
  total_rosters: TEAMS,
  roster_positions: [...STARTERS, ...Array(BENCH).fill('BN')],
  scoring_settings: {
    pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rec: 0.5, bonus_rec_te: 0.5,
    rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2, fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5,
    xpm: 1, fgmiss: -1, def_td: 6, sack: 1, int: 2, fum_rec: 2, safe: 2, blk_kick: 2, pts_allow_0: 10, pts_allow_1_6: 7,
  },
  settings: {
    num_teams: TEAMS, leg: WEEKS, last_scored_leg: WEEKS, playoff_teams: 6, playoff_week_start: 15, draft_rounds: 4,
    taxi_slots: TAXI, reserve_slots: 0, waiver_budget: 100, type: 2,
  },
};

/** A week's pairings, as roster IDs: a round robin of the twelve rosters. */
export function pairings(week) {
  const ids = Array.from({ length: TEAMS }, (_, i) => i + 1);
  const rest = ids.slice(1);
  for (let i = 0; i < (week - 1) % (TEAMS - 1); i++) rest.push(rest.shift());
  const order = [ids[0], ...rest];
  return Array.from({ length: TEAMS / 2 }, (_, i) => [order[i], order[TEAMS - 1 - i]]);
}

const weeks = {};
let transactionId = 1;
for (let week = 1; week <= WEEKS; week++) {
  const matchups = [];
  pairings(week).forEach((pair, index) => {
    for (const rosterId of pair) {
      const roster = rosters[rosterId - 1];
      const points = Object.fromEntries(roster.players.map((id) => [id, round2(rand() * 30)]));
      const startersPoints = roster.starters.map((id) => points[id]);
      matchups.push({
        roster_id: rosterId,
        matchup_id: index + 1,
        points: round2(startersPoints.reduce((a, b) => a + b, 0)),
        custom_points: null,
        starters: roster.starters,
        starters_points: startersPoints,
        players: roster.players,
        players_points: points,
      });
    }
  });
  const transactions = [];
  const stamp = Date.UTC(2026, 8, 9 + 7 * week);
  for (let i = 0; i < 8; i++) {
    const rosterId = 1 + Math.floor(rand() * TEAMS);
    const add = pick(freeAgents);
    const drop = pick(rosters[rosterId - 1].players);
    const waiver = i < 5;
    transactions.push({
      transaction_id: String(100000 + transactionId++),
      type: waiver ? 'waiver' : 'free_agent',
      status: waiver && i === 4 ? 'failed' : 'complete',
      leg: week,
      roster_ids: [rosterId],
      adds: { [add]: rosterId },
      drops: { [drop]: rosterId },
      settings: waiver ? { waiver_bid: Math.floor(rand() * 30), seq: i } : null,
      draft_picks: [],
      waiver_budget: [],
      creator: `u${rosterId}`,
      consenter_ids: [rosterId],
      created: stamp + i,
      status_updated: stamp + i + 1000,
      metadata: waiver ? { notes: 'Invented waiver claim.' } : null,
    });
  }
  if (week % 3 === 0) {
    const [a, b] = pairings(week)[0];
    const give = rosters[a - 1].players[10];
    const get = rosters[b - 1].players[11];
    transactions.push({
      transaction_id: String(100000 + transactionId++),
      type: 'trade',
      status: 'complete',
      leg: week,
      roster_ids: [a, b],
      adds: { [give]: b, [get]: a },
      drops: { [give]: a, [get]: b },
      settings: null,
      draft_picks: [{ season: '2027', round: 2, roster_id: a, previous_owner_id: a, owner_id: b }],
      waiver_budget: [{ sender: b, receiver: a, amount: 5 }],
      creator: `u${a}`,
      consenter_ids: [a, b],
      created: stamp + 50,
      status_updated: stamp + 60,
      metadata: null,
    });
  }
  weeks[week] = { matchups, transactions };
}

const BASE = 'https://api.sleeper.app/v1';
function answer(url) {
  const path = String(url).slice(BASE.length);
  const own = `/league/${LEAGUE_ID}`;
  if (path === '/state/nfl') return { season: SEASON, season_type: 'regular', week: WEEKS + 1, leg: WEEKS + 1 };
  if (path === '/players/nfl') return players;
  if (path === own) return league;
  if (path === `${own}/users`) return users;
  if (path === `${own}/rosters`) return rosters;
  if (path === `${own}/traded_picks`) return [];
  if (path === `${own}/drafts`) return [];
  const match = /^\/league\/\d+\/(matchups|transactions)\/(\d+)$/.exec(path);
  if (match) return weeks[match[2]]?.[match[1]] ?? [];
  throw new Error(`the stand-in Sleeper API does not answer ${url}`);
}

/** Replaces the global fetch with the stand-in Sleeper API for this league. */
export function installFakeSleeper() {
  globalThis.fetch = async (url) => new Response(JSON.stringify(answer(url)), { status: 200 });
}

/** FantasyCalc's answer: every player in the league, and the next two drafts' picks. */
const marketEntries = [
  ...Object.entries(players).map(([sleeperId, player], index) => ({
    player: { name: player.full_name, position: player.position, sleeperId, maybeAge: player.age, maybeTeam: player.team },
    value: Math.max(1, 10000 - index * 17),
    overallRank: index + 1,
    positionRank: 1 + (index % 60),
    trend30Day: Math.round(rand() * 400 - 200),
  })),
  ...['2027', '2028'].flatMap((season) =>
    [1, 2, 3, 4].map((round) => ({ player: { name: `${season} Round ${round}`, position: 'PICK' }, value: 5000 / round })),
  ),
];

/** A fetch for readMarketValues' `fetchImpl` that answers as FantasyCalc would. */
export const fakeFantasyCalc = async () => new Response(JSON.stringify(marketEntries), { status: 200 });
