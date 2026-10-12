/**
 * One week of a made-up four-team dynasty league, the team names taken from
 * mock-dynasty-league.mjs, with a raw Sleeper player file chosen to reach
 * every branch of a player line: a full name, a name built from first and
 * last, a name that falls back to the id, a free agent (team null and team
 * ''), an age of 0, an injury, and a rostered id the file does not have.
 * Every name and number is invented; none of it is a real league's data.
 *
 * `rankingsContext` takes the modules it calls as arguments, so the same
 * fixture can be built against any version of src/ when the pinned context
 * needs re-checking. Not a test file itself: `npm test` only runs
 * tests/*.test.mjs.
 */
import { BYE_WEEK_BLUES, LOWERED_EXPECTATIONS, PUNT_INTENDED, SUNDAY_SCARIES } from './mock-dynasty-league.mjs';

export const STARTING_SLOTS = ['QB', 'RB', 'WR', 'FLEX'];

/** The shape of Sleeper's /players/nfl file, cut to the fields a line reads. */
export const RAW_PLAYERS = {
  qb1: { full_name: 'Quinn Arms', first_name: 'Quinn', last_name: 'Arms', position: 'QB', team: 'BUF', age: 27, years_exp: 5, injury_status: null, status: 'Active' },
  rb1: { first_name: 'Rex', last_name: 'Carter', position: 'RB', team: 'DAL', age: 24, years_exp: 2, injury_status: 'Questionable', status: 'Active' },
  wr1: { full_name: 'Wes Lane', position: 'WR', team: null, age: 26, years_exp: 4, status: 'Active' },
  te1: { full_name: 'Tad Bloom', position: 'TE', team: 'MIA', age: 0, years_exp: 0, status: 'Active' },
  qb2: { full_name: 'Case Holt', position: 'QB', team: 'KC', age: 29, years_exp: 7, injury_status: 'Out', status: 'Injured Reserve' },
  rb2: { full_name: '', first_name: '', last_name: '', position: 'RB', team: 'GB', age: 23, years_exp: 1, status: 'Active' },
  wr2: { full_name: 'Wade Pike', position: 'WR', team: '', age: 25, years_exp: 3, status: 'Active' },
  te2: { full_name: 'Bo Tanner', position: 'TE', team: 'SF', years_exp: 6, injury_status: 'Doubtful', status: 'Active' },
  fa1: { full_name: 'Wire Pickup', position: 'WR', team: 'NYG', age: 22, years_exp: 0, status: 'Active' },
};

/** In the file nowhere: a rostered id Sleeper no longer lists. */
export const MISSING_ID = '9999';

const ROSTERS = {
  [BYE_WEEK_BLUES]: { name: 'Bye Week Blues', players: ['qb1', 'rb1', 'wr1', 'te1', 'fa1'], starters: ['qb1', 'rb1', 'wr1', 'te1'] },
  [PUNT_INTENDED]: { name: 'Punt Intended', players: ['qb2', 'rb2', 'wr2', 'te2'], starters: ['qb2', 'rb2', 'wr2', 'te2'] },
  [LOWERED_EXPECTATIONS]: { name: 'Lowered Expectations', players: ['qb1', 'rb2', 'wr1', MISSING_ID], starters: ['qb1', 'rb2', 'wr1', MISSING_ID] },
  [SUNDAY_SCARIES]: { name: 'Sunday Scaries', players: ['qb2', 'rb1', 'wr2', 'te2'], starters: ['qb2', 'rb1', 'wr2', 'te2'] },
};

export const LEAGUE = {
  id: '100000000',
  name: 'Invented Dynasty League',
  season: '2026',
  status: 'in_season',
  startingSlots: STARTING_SLOTS,
  benchSlots: 2,
  taxiSlots: 0,
  playoffTeams: 2,
  playoffWeekStart: 15,
  format: { type: 'dynasty', source: 'declared', declaredType: 'dynasty', detectedType: 'dynasty' },
};

export const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 1,
    ranking_emoji: '',
    output: { sleeper_max_chars: 500, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: {
    weights: {
      dynasty: {
        starting_lineup: 0.3,
        dynasty_value: 0.25,
        depth: 0.15,
        quarterback: 0.1,
        future_draft_capital: 0.1,
        roster_flexibility: 0.05,
        contender_viability: 0.05,
      },
    },
    weekly: {},
  },
};

export const TEAMS = Object.entries(ROSTERS).map(([rosterId, roster], index) => ({
  rosterId: Number(rosterId),
  name: roster.name,
  manager: `manager${rosterId}`,
  record: { wins: 3 - index, losses: index, ties: 0 },
  seasonPointsFor: 300 + index * 7,
  seasonPointsAgainst: 290 - index,
  seasonPotentialPoints: 350 + index,
  playerIds: roster.players,
  starterIds: roster.starters,
  taxiIds: [],
  reserveIds: [],
}));

/** Week 3 in the shape Sleeper's /matchups endpoint returns: 1 v 2, 3 v 4. */
export const RAW_MATCHUPS = TEAMS.map((team, index) => {
  const playersPoints = Object.fromEntries(
    team.playerIds.map((id, slot) => [id, Number((12.5 + index * 3.1 + slot * 4.25).toFixed(2))]),
  );
  const startersPoints = team.starterIds.map((id) => playersPoints[id]);
  return {
    roster_id: team.rosterId,
    matchup_id: index < 2 ? 1 : 2,
    points: Number(startersPoints.reduce((total, value) => total + value, 0).toFixed(2)),
    starters: team.starterIds,
    starters_points: startersPoints,
    players: team.playerIds,
    players_points: playersPoints,
  };
});

/** Week 3's completed moves, in the shape Sleeper's /transactions endpoint returns. */
export const RAW_TRANSACTIONS = [
  {
    transaction_id: 't-trade',
    type: 'trade',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 22, 15),
    roster_ids: [BYE_WEEK_BLUES, PUNT_INTENDED],
    adds: { wr1: PUNT_INTENDED, te2: BYE_WEEK_BLUES },
    drops: { wr1: BYE_WEEK_BLUES, te2: PUNT_INTENDED },
    draft_picks: [],
    waiver_budget: [],
  },
  {
    transaction_id: 't-free-agent',
    type: 'free_agent',
    status: 'complete',
    leg: 3,
    status_updated: Date.UTC(2026, 8, 23, 15),
    roster_ids: [LOWERED_EXPECTATIONS],
    adds: { fa1: LOWERED_EXPECTATIONS },
    drops: { [MISSING_ID]: LOWERED_EXPECTATIONS },
    draft_picks: [],
    waiver_budget: [],
  },
];

/**
 * The weekly rankings context for week 3, with `generatedAt` removed. Every
 * roster line goes through describePlayer, and the week's starters and bench
 * through the player dictionary.
 */
export function rankingsContext({ analyzeWeek, normalizeTransactions, buildContext, describePlayer }, players) {
  const teamsByRosterId = new Map(TEAMS.map((team) => [team.rosterId, team]));
  const weekAnalysis = analyzeWeek({ league: LEAGUE, teams: TEAMS, matchups: RAW_MATCHUPS, players, week: 3 });
  const transactions = normalizeTransactions(RAW_TRANSACTIONS, { teamsByRosterId, players, describePlayer, league: LEAGUE });
  const context = buildContext({
    task: 'rankings',
    config: CONFIG,
    league: LEAGUE,
    teams: TEAMS,
    players,
    week: 3,
    weekAnalysis,
    transactions,
  });
  delete context.generatedAt;
  return context;
}
