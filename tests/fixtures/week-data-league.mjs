/**
 * Two weeks of a made-up four-team league in the raw shapes Sleeper's
 * /matchups and /transactions endpoints return, saved as the untagged raw
 * bundles every league folder written before the provider boundary holds (no
 * `provider` field). Team names come from mock-dynasty-league.mjs. Every name
 * and number is invented; none of it is a real league's data.
 *
 * The weeks are chosen to reach every branch of the readers of saved weeks:
 * a bye (null matchup_id), a matchup_id with only one side, an empty starting
 * slot ("0"), a starters_points array shorter than the lineup, an entry with
 * no points, won and lost waiver bids, a bid placed in another week, a
 * free-agent add with no bid, a trade with a pick and FAAB, and a transaction
 * that never completed.
 *
 * `readSavedWeeks` takes the modules it calls as arguments, so the same reads
 * can be made against any version of src/ when the pinned output
 * (week-data-reads.json) needs re-checking. Not a test file itself: `npm test`
 * only runs tests/*.test.mjs.
 */
import { assets } from './assets.mjs';
import { BYE_WEEK_BLUES, LOWERED_EXPECTATIONS, PUNT_INTENDED, SUNDAY_SCARIES } from './mock-dynasty-league.mjs';

export const STARTING_SLOTS = ['QB', 'RB', 'WR', 'FLEX'];

/** Sleeper's /players/nfl shape, cut to the fields a line reads. */
export const RAW_PLAYERS = {
  qb1: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF', age: 31 },
  qb2: { full_name: 'Case Holt', position: 'QB', team: 'KC', age: 24 },
  rb1: { full_name: 'Rex Carter', position: 'RB', team: 'DAL', age: 23, injury_status: 'Questionable' },
  rb2: { full_name: 'Dale Moss', position: 'RB', team: 'GB', age: 28 },
  wr1: { full_name: 'Wes Lane', position: 'WR', team: 'MIA', age: 26 },
  wr2: { full_name: 'Wade Pike', position: 'WR', team: 'SF', age: 30 },
  te1: { full_name: 'Tad Bloom', position: 'TE', team: 'NYG', age: 25 },
  fa1: { full_name: 'Wire Pickup', position: 'WR', team: 'DEN', age: 22 },
  fa2: { full_name: 'Late Claim', position: 'RB', team: 'ATL', age: 21 },
};

/** Sleeper's /users and /rosters shapes. Sunday Scaries has been emptied: no owner, no players. */
export const RAW_USERS = [
  { user_id: 'u1', display_name: 'manager1', metadata: { team_name: 'Bye Week Blues' } },
  { user_id: 'u2', display_name: 'manager2', metadata: { team_name: 'Punt Intended' } },
  { user_id: 'u3', display_name: 'manager3', metadata: { team_name: 'Lowered Expectations' } },
];

export const RAW_ROSTERS = [
  {
    roster_id: BYE_WEEK_BLUES,
    owner_id: 'u1',
    players: ['qb2', 'rb1', 'te1', 'wr2'],
    starters: ['qb2', 'rb1', '0', 'te1'],
    settings: { wins: 1, losses: 1, fpts: 200, fpts_decimal: 50, waiver_budget_used: 5 },
  },
  {
    roster_id: PUNT_INTENDED,
    owner_id: 'u2',
    players: ['qb1', 'rb2', 'wr1'],
    starters: ['qb1', 'rb2', 'wr1', '0'],
    settings: { wins: 1, losses: 1, fpts: 190, fpts_decimal: 25, waiver_budget_used: 0 },
  },
  {
    roster_id: LOWERED_EXPECTATIONS,
    owner_id: 'u3',
    players: ['fa1', 'fa2'],
    starters: ['fa1', 'fa2'],
    settings: { wins: 1, losses: 0, fpts: 150, waiver_budget_used: 12 },
  },
  { roster_id: SUNDAY_SCARIES, owner_id: null, players: [], starters: [], settings: {} },
];

/** Week 1: 1 v 2; Lowered Expectations on a bye; Sunday Scaries alone on matchup 2. */
export const WEEK_1_MATCHUPS = [
  {
    roster_id: BYE_WEEK_BLUES,
    matchup_id: 1,
    points: 72.6,
    // An empty WR slot, and one fewer starters_points than starters.
    starters: ['qb1', 'rb1', '0', 'te1'],
    starters_points: [30.2, 20.1, 0],
    players: ['qb1', 'rb1', 'te1', 'wr2'],
    players_points: { qb1: 30.2, rb1: 20.1, te1: 22.3, wr2: 25.55 },
  },
  {
    roster_id: PUNT_INTENDED,
    matchup_id: 1,
    points: 81.4,
    starters: ['qb2', 'rb2', 'wr1', 'wr1'],
    starters_points: [25, 18.4, 19, 19],
    players: ['qb2', 'rb2', 'wr1'],
    players_points: { qb2: 25, rb2: 18.4, wr1: 19 },
  },
  {
    roster_id: LOWERED_EXPECTATIONS,
    matchup_id: null,
    points: 40.25,
    starters: ['fa1', 'fa2'],
    starters_points: [30.25, 10],
    players: ['fa1', 'fa2'],
    players_points: { fa1: 30.25, fa2: 10 },
  },
  {
    // No points field at all.
    roster_id: SUNDAY_SCARIES,
    matchup_id: 2,
    starters: ['wr1'],
    starters_points: [3],
    players: ['wr1', 'fa1'],
    players_points: { wr1: 3, fa1: 1.5 },
  },
];

/** Week 2: 1 v 3 on matchup 1; 2 and 4 both on matchup 2 with 3 also listed on it (three sides). */
export const WEEK_2_MATCHUPS = [
  {
    roster_id: BYE_WEEK_BLUES,
    matchup_id: 1,
    points: 95.15,
    starters: ['qb2', 'rb1', 'wr2', 'te1'],
    starters_points: [28.1, 22, 25.05, 20],
    players: ['qb2', 'rb1', 'wr2', 'te1'],
    players_points: { qb2: 28.1, rb1: 22, wr2: 25.05, te1: 20 },
  },
  {
    roster_id: LOWERED_EXPECTATIONS,
    matchup_id: 1,
    points: 61,
    starters: ['fa1', 'fa2', '0', '0'],
    starters_points: [31, 30, 0, 0],
    players: ['fa1', 'fa2'],
    players_points: { fa1: 31, fa2: 30 },
  },
  {
    roster_id: PUNT_INTENDED,
    matchup_id: 2,
    points: 70.5,
    starters: ['qb1', 'rb2', 'wr1', '0'],
    starters_points: [33, 17.5, 20, 0],
    players: ['qb1', 'rb2', 'wr1'],
    players_points: { qb1: 33, rb2: 17.5, wr1: 20 },
  },
  {
    roster_id: SUNDAY_SCARIES,
    matchup_id: 2,
    points: 0,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
  },
  {
    roster_id: 5,
    matchup_id: 2,
    points: 0,
    starters: [],
    starters_points: [],
    players: [],
    players_points: {},
  },
];

/** Week 1: a trade (with a pick and FAAB) and a move that never completed. */
export const WEEK_1_TRANSACTIONS = [
  {
    transaction_id: 'w1-trade',
    type: 'trade',
    status: 'complete',
    leg: 1,
    status_updated: Date.UTC(2026, 8, 15, 15),
    roster_ids: [BYE_WEEK_BLUES, PUNT_INTENDED],
    adds: { qb1: PUNT_INTENDED, qb2: BYE_WEEK_BLUES },
    drops: { qb1: BYE_WEEK_BLUES, qb2: PUNT_INTENDED },
    draft_picks: [{ season: '2027', round: 2, roster_id: PUNT_INTENDED, owner_id: BYE_WEEK_BLUES, previous_owner_id: PUNT_INTENDED }],
    waiver_budget: [{ sender: BYE_WEEK_BLUES, receiver: PUNT_INTENDED, amount: 5 }],
    settings: null,
  },
  {
    transaction_id: 'w1-pending',
    type: 'trade',
    status: 'pending',
    leg: 1,
    roster_ids: [BYE_WEEK_BLUES, LOWERED_EXPECTATIONS],
    adds: { te1: LOWERED_EXPECTATIONS },
    drops: { te1: BYE_WEEK_BLUES },
  },
];

/**
 * Week 2: Lowered Expectations wins wr2 for $12 over a $9 losing bid, a
 * losing $4 bid on fa2, a free-agent add with no bid, and a claim filed under
 * week 1 that only reached the week 2 bundle.
 */
export const WEEK_2_TRANSACTIONS = [
  {
    transaction_id: 'w2-claim',
    type: 'waiver',
    status: 'complete',
    leg: 2,
    status_updated: Date.UTC(2026, 8, 23, 9),
    roster_ids: [LOWERED_EXPECTATIONS],
    adds: { wr2: LOWERED_EXPECTATIONS },
    drops: null,
    settings: { waiver_bid: 12 },
  },
  {
    transaction_id: 'w2-lost',
    type: 'waiver',
    status: 'failed',
    leg: 2,
    roster_ids: [PUNT_INTENDED],
    adds: { wr2: PUNT_INTENDED },
    drops: { rb2: PUNT_INTENDED },
    settings: { waiver_bid: 9 },
  },
  {
    transaction_id: 'w2-lost-fa2',
    type: 'waiver',
    status: 'failed',
    leg: 2,
    roster_ids: [BYE_WEEK_BLUES],
    adds: { fa2: BYE_WEEK_BLUES },
    settings: { waiver_bid: 4 },
  },
  {
    transaction_id: 'w2-free-agent',
    type: 'free_agent',
    status: 'complete',
    leg: 2,
    status_updated: Date.UTC(2026, 8, 24, 12),
    roster_ids: [PUNT_INTENDED],
    adds: { fa1: PUNT_INTENDED },
    drops: { rb2: PUNT_INTENDED },
    settings: null,
  },
  {
    transaction_id: 'w2-late',
    type: 'waiver',
    status: 'complete',
    leg: 1,
    status_updated: Date.UTC(2026, 8, 17, 9),
    roster_ids: [BYE_WEEK_BLUES],
    adds: { fa2: BYE_WEEK_BLUES },
    drops: {},
    settings: { waiver_bid: 2 },
  },
];

export const RAW_WEEKS = {
  1: { matchups: WEEK_1_MATCHUPS, transactions: WEEK_1_TRANSACTIONS },
  2: { matchups: WEEK_2_MATCHUPS, transactions: WEEK_2_TRANSACTIONS },
};

/** A normalized league, as normalizeLeague returns it, cut to what the readers use. */
export function leagueOf(type) {
  return {
    id: '200000000',
    name: 'Invented Week Data League',
    season: '2026',
    status: 'in_season',
    draftStatus: 'complete',
    startingSlots: STARTING_SLOTS,
    lastScoredWeek: 2,
    draftRounds: 3,
    playoffTeams: 2,
    waiverBudget: 100,
    format: { type, source: 'declared' },
  };
}

function fakeClient() {
  return {
    matchups: async (week) => RAW_WEEKS[week].matchups,
    transactions: async (week) => RAW_WEEKS[week].transactions,
  };
}

/** Paths and clock times differ run to run; nothing else may. */
function stable(value) {
  return JSON.parse(
    JSON.stringify(value, (key, inner) => (['rawPath', 'snapshotPath', 'savedAt', 'fetchedAt'].includes(key) ? undefined : inner)),
  );
}

/**
 * Every read of the saved weeks, in a dynasty and a guillotine folder:
 * captureWeek for each week (fresh, then again once settled), readTransactions,
 * readRosterWindow and readFaabMarket.
 *
 * `transactionsOf(captured)` returns a capture's normalized transactions, so
 * this can run against code that returned them raw.
 */
export async function readSavedWeeks(api, { dataDir, transactionsOf }) {
  const { normalizePlayers, normalizeTeams, createStore, captureWeek, readTransactions, readRosterWindow, readFaabMarket, describePlayer } = api;
  const players = normalizePlayers(RAW_PLAYERS);
  const teams = normalizeTeams({ rosters: RAW_ROSTERS, users: RAW_USERS });
  const reads = {};

  for (const type of ['dynasty', 'guillotine']) {
    const store = createStore({ dataDir: `${dataDir}/${type}` });
    const league = leagueOf(type);
    const config = type === 'guillotine' ? { guillotine: { eliminations: [] } } : null;
    const ctx = { client: fakeClient(), store, assets, league, teams, players, config };

    const out = {};
    for (const week of [1, 2]) {
      const fresh = await captureWeek({ ...ctx, week });
      const settled = await captureWeek({ ...ctx, week });
      out[`week${week}`] = { ...stable(fresh), transactions: transactionsOf(fresh, ctx) };
      out[`week${week}Settled`] = { ...stable(settled), transactions: transactionsOf(settled, ctx) };
    }
    out.transactions = stable(readTransactions({ store, assets, league, teams, players, describePlayer, week: 2, throughWeek: 2 }));
    out.transactionsWeek1 = stable(readTransactions({ store, assets, league, teams, players, describePlayer, week: 1, throughWeek: 2 }));
    out.rosterWindow = stable(readRosterWindow({ store, assets, league: { ...league, format: { type: 'dynasty' } }, teams, players, throughWeek: 2 }));
    out.faabMarket = stable(readFaabMarket({ store, assets, league: { ...league, format: { type: 'guillotine' } }, teams, config, throughWeek: 2 }));
    reads[type] = out;
  }
  return reads;
}
