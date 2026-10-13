/**
 * A made-up 12-team ESPN league, in the shapes docs/espn-data.md describes.
 *
 * SOURCE OF THE SHAPES, AND THEY ARE UNVERIFIED. Every field name and nesting
 * below comes from docs/espn-data.md, which cites two community clients
 * (espn-api and the JS client) and the operator checks listed in the plan.
 * Nothing here was copied from, or checked against, a real ESPN response: no
 * test league exists yet. Where the doc says a shape is open, this file says
 * which choice it made and that the choice is a placeholder.
 *
 * Every name, ID, score, cookie and date is invented. The team names are the
 * cast of tests/fixtures/mock-dynasty-league.mjs, and records and points-for
 * come from it. Player names are invented and so are the 9,000,000-range IDs.
 * None of it is a real league's data, and no real ESPN response was saved,
 * even redacted.
 *
 * What it holds, per league (see buildLeague):
 *   - mSettings, mTeam, mRoster, mDraftDetail      (league views)
 *   - one week's mMatchup (week 4) with each side's lineup, bench included
 *   - week 5's mMatchup, not yet played: lineups with projections only
 *   - mBoxscore: the same week, under that view's name. Neither client requests
 *     it (doc, "League views"); the shape is the mMatchup one, as a guess.
 *   - mTransactions2 for week 4: a trade, a FAAB claim, a losing bid, a
 *     free-agent add and a drop
 *   - the season endpoint, and a small players_wl
 *
 * Variants: a FAAB league (the default), a rolling-waiver league, and a league
 * whose matchup period 4 covers scoring periods 4 and 5 (for the refusal test).
 *
 * Not a test file itself: `npm test` only runs tests/*.test.mjs.
 */
import { TEAMS_AFTER_WEEK_4 } from './mock-dynasty-league.mjs';

export const SEASON = 2026;
export const SCORED_WEEK = 4;

/** Invented league IDs and cookies. The cookie names are the doc's (assumed); the values are made up. */
export const PUBLIC_LEAGUE_ID = '1000001';
export const PRIVATE_LEAGUE_ID = '1000002';
export const ROLLING_LEAGUE_ID = '1000003';
export const MULTI_WEEK_LEAGUE_ID = '1000004';
export const UNKNOWN_LEAGUE_ID = '1999999';
export const FIXTURE_COOKIES = {
  espn_s2: 'FIXTURE-ESPN-S2-NOT-A-REAL-COOKIE',
  SWID: '{FIXTURE-SWID-NOT-A-REAL-ID}',
};

// --- Lineup slots (doc, "Lineup slot IDs") ----------------------------------
const SLOT = { QB: 0, RB: 2, WR: 4, TE: 6, DEF: 16, K: 17, BENCH: 20, IR: 21, FLEX: 23 };
const ELIGIBLE = {
  QB: [0, 7, 20, 21],
  RB: [2, 3, 23, 20, 21],
  WR: [4, 3, 5, 23, 20, 21],
  TE: [6, 5, 23, 20, 21],
  K: [17, 20, 21],
  // A team defense's first eligible slot is 16, named "D/ST" (doc, "Positions").
  DEF: [16, 20, 21],
};
// Nonzero starting and bench counts only. Whether ESPN also lists zeros is not in the doc.
const LINEUP_SLOT_COUNTS = { 0: 1, 2: 1, 4: 1, 6: 1, 16: 1, 17: 1, 20: 2, 21: 1, 23: 1 };

// --- Players ------------------------------------------------------------------
// Nine per team: seven starters, then two on the bench.
const ROLES = [
  { key: 'QB', pos: 'QB', slot: SLOT.QB, base: 18 },
  { key: 'RB1', pos: 'RB', slot: SLOT.RB, base: 11 },
  { key: 'RB2', pos: 'RB', slot: SLOT.FLEX, base: 9 },
  { key: 'WR1', pos: 'WR', slot: SLOT.WR, base: 12 },
  { key: 'TE', pos: 'TE', slot: SLOT.TE, base: 7 },
  { key: 'K', pos: 'K', slot: SLOT.K, base: 8 },
  { key: 'DEF', pos: 'DEF', slot: SLOT.DEF, base: 6 },
  { key: 'BWR', pos: 'WR', slot: SLOT.BENCH, base: 5 },
  { key: 'BRB', pos: 'RB', slot: SLOT.BENCH, base: 4 },
];
const SURNAMES = [
  'Aldermere', 'Brackwell', 'Corvane', 'Dunmoor', 'Eskridge', 'Fallowfield',
  'Grimsby', 'Hollowell', 'Ivorwood', 'Jessamy', 'Kettleby', 'Lorimar',
];
const FIRST_NAMES = ['Quill', 'Brindle', 'Tamsin', 'Oriel', 'Lysander', 'Fenna', 'Cobb', 'Marlow', 'Tansy'];
// Pro team IDs from the doc's table. 28 is the one that spells WSH.
const PRO_TEAM_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34];

const playerId = (teamIndex, roleIndex) => 9000000 + teamIndex * 10 + roleIndex + 1;

function buildPlayer(teamIndex, roleIndex) {
  const role = ROLES[roleIndex];
  const team = TEAMS_AFTER_WEEK_4[teamIndex];
  const proTeamId = PRO_TEAM_IDS[(teamIndex * 3 + roleIndex) % PRO_TEAM_IDS.length];
  const fullName = role.pos === 'DEF'
    ? `${team.name} D/ST`
    : `${FIRST_NAMES[roleIndex]} ${SURNAMES[teamIndex]}`;
  return {
    id: playerId(teamIndex, roleIndex),
    fullName,
    // The doc says this field exists but not what its values mean (open question 2).
    // The value here is a placeholder: the first eligible slot.
    defaultPositionId: ELIGIBLE[role.pos][0],
    eligibleSlots: [...ELIGIBLE[role.pos]],
    proTeamId,
    injuryStatus: 'ACTIVE',
  };
}

/** A week's actual points for one player: invented, but fixed. Team 1's bench receiver outscores his flex. */
function weekPoints(teamIndex, roleIndex) {
  if (teamIndex === 0 && roleIndex === 7) return 21.4;
  if (teamIndex === 8 && roleIndex === 8) return 15.2;
  const wobble = ((teamIndex * 7 + roleIndex * 5) % 11) - 4;
  return Math.round((ROLES[roleIndex].base + wobble * 1.3) * 100) / 100;
}

/** playerPoolEntry.player, with the week's stats[] (statSourceId 0 actual, 1 projected: doc, "Matchups"). */
function playerWithStats(teamIndex, roleIndex, week) {
  const player = buildPlayer(teamIndex, roleIndex);
  const actual = weekPoints(teamIndex, roleIndex);
  return {
    ...player,
    stats: [
      { scoringPeriodId: week, statSourceId: 0, appliedTotal: actual, proTeamId: player.proTeamId },
      { scoringPeriodId: week, statSourceId: 1, appliedTotal: Math.round(ROLES[roleIndex].base * 100) / 100, proTeamId: player.proTeamId },
    ],
  };
}

const entry = (teamIndex, roleIndex, week) => ({
  lineupSlotId: ROLES[roleIndex].slot,
  playerId: playerId(teamIndex, roleIndex),
  playerPoolEntry: { id: playerId(teamIndex, roleIndex), player: week ? playerWithStats(teamIndex, roleIndex, week) : buildPlayer(teamIndex, roleIndex) },
});

const rosterEntries = (teamIndex, week) => ROLES.map((_, roleIndex) => entry(teamIndex, roleIndex, week));

const sum = (values) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
const starterTotal = (teamIndex) => sum(ROLES.flatMap((r, i) => (r.slot === SLOT.BENCH ? [] : [weekPoints(teamIndex, i)])));

// --- League views -------------------------------------------------------------
const memberId = (n) => `{FIXTURE-MEMBER-${String(n).padStart(2, '0')}}`;

/** Which teams meet in week 4: 1-2, 3-4, 5-6, 7-8, 9-10, 11-12. */
const PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];

function buildSettings({ faab, multiWeek }) {
  // Matchup period n covers scoring period n, except in the multi-week variant,
  // where period 4 covers scoring periods 4 and 5 and the later periods shift by one.
  // Periods 1-13 are the regular season (matchupPeriodCount) and 14-16 the
  // playoffs. Whether ESPN lists playoff periods here is not in the doc: a guess.
  const matchupPeriods = {};
  for (let n = 1; n <= 16; n++) matchupPeriods[n] = multiWeek ? (n < 4 ? [n] : n === 4 ? [4, 5] : [n + 1]) : [n];
  return {
    name: faab ? 'Fixture Pressbox League' : 'Fixture Pressbox League (rolling waivers)',
    size: 12,
    isPublic: true,
    scheduleSettings: {
      matchupPeriodCount: 13,
      matchupPeriodLength: 1,
      playoffMatchupPeriodLength: 1,
      playoffTeamCount: 6,
      playoffSeedingRule: 'H2H_RECORD',
      matchupPeriods,
      divisions: [{ id: 0, name: 'Fixture Division' }],
    },
    // An invented deadline, 2026-11-18T17:00:00Z, in epoch milliseconds (the type is a guess).
    tradeSettings: { deadlineDate: 1795021200000 },
    draftSettings: { type: 'SNAKE', keeperCount: 0, isTradingEnabled: false },
    acquisitionSettings: faab
      ? { isUsingAcquisitionBudget: true, acquisitionBudget: 100, minimumBid: 0, acquisitionType: 'WAIVERS_TRADITIONAL' }
      : { isUsingAcquisitionBudget: false, acquisitionType: 'WAIVERS_CONTINUOUS' },
    rosterSettings: { lineupSlotCounts: { ...LINEUP_SLOT_COUNTS } },
    scoringSettings: {
      scoringType: 'H2H_POINTS',
      matchupTieRule: 'NONE',
      scoringItems: [
        { statId: 53, points: 1, pointsOverrides: {} },
        { statId: 4, points: 4, pointsOverrides: {} },
        { statId: 3, points: 0.04, pointsOverrides: {} },
        { statId: 20, points: -2, pointsOverrides: {} },
        { statId: 25, points: 6, pointsOverrides: {} },
      ],
    },
  };
}

function buildTeam(teamIndex, faab) {
  const t = TEAMS_AFTER_WEEK_4[teamIndex];
  return {
    id: t.rosterId,
    name: t.name,
    abbrev: t.name.replace(/[^A-Z]/g, '').slice(0, 4) || 'FX',
    divisionId: 0,
    owners: [memberId(t.rosterId)],
    playoffSeed: t.rosterId,
    waiverRank: t.rosterId,
    record: {
      overall: {
        wins: t.record.wins,
        losses: t.record.losses,
        ties: t.record.ties,
        pointsFor: t.seasonPointsFor,
        pointsAgainst: Math.round((t.seasonPointsFor - 12.5 + t.rosterId) * 100) / 100,
      },
    },
    points: t.seasonPointsFor,
    transactionCounter: faab ? { acquisitionBudgetSpent: t.rosterId === 3 ? 12 : 0 } : {},
  };
}

function buildMembers() {
  // displayName is the field the plan means to use for manager names, and no
  // source shows it (doc, "Teams and members", open question 27): it is a placeholder here.
  // firstName and lastName are present so a test can show they never reach output.
  return TEAMS_AFTER_WEEK_4.map((t) => ({
    id: memberId(t.rosterId),
    displayName: `fixture_manager_${t.rosterId}`,
    firstName: `Firstname${t.rosterId}`,
    lastName: `Lastname${t.rosterId}`,
  }));
}

function buildSchedule(withLineups) {
  return PAIRS.map(([home, away]) => {
    const side = (i) => ({
      teamId: TEAMS_AFTER_WEEK_4[i].rosterId,
      totalPoints: starterTotal(i),
      ...(withLineups ? { rosterForCurrentScoringPeriod: { entries: rosterEntries(i, SCORED_WEEK) } } : {}),
    });
    const diff = starterTotal(home) - starterTotal(away);
    return {
      id: 400 + PAIRS.findIndex(([h]) => h === home),
      matchupPeriodId: SCORED_WEEK,
      playoffTierType: 'NONE',
      winner: diff > 0 ? 'HOME' : diff < 0 ? 'AWAY' : 'TIE',
      home: side(home),
      away: side(away),
    };
  });
}

/** Which teams meet in week 5, the week about to be played: 1-3, 2-4, 5-7, 6-8, 9-11, 10-12. */
const UPCOMING_PAIRS = [[0, 2], [1, 3], [4, 6], [5, 7], [8, 10], [9, 11]];

/**
 * Week 5, not yet played: each side's lineup with a projection and no actual
 * points (statSourceId 1 only), totalPoints 0 and winner UNDECIDED. That an
 * unplayed side reports 0 rather than omitting the field is a placeholder: the
 * doc does not say.
 */
function buildUpcomingSchedule() {
  const week = SCORED_WEEK + 1;
  return UPCOMING_PAIRS.map(([home, away], n) => {
    const side = (i) => ({
      teamId: TEAMS_AFTER_WEEK_4[i].rosterId,
      totalPoints: 0,
      rosterForCurrentScoringPeriod: {
        entries: rosterEntries(i, week).map((e) => ({
          ...e,
          playerPoolEntry: {
            ...e.playerPoolEntry,
            player: { ...e.playerPoolEntry.player, stats: e.playerPoolEntry.player.stats.filter((s) => s.statSourceId === 1) },
          },
        })),
      },
    });
    return { id: 500 + n, matchupPeriodId: week, playoffTierType: 'NONE', winner: 'UNDECIDED', home: side(home), away: side(away) };
  });
}

/**
 * Transactions in week 4. IDs are plain invented strings: the doc does not say what ESPN's look like.
 * `status` strings are placeholders: ESPN's values are unknown (doc, open question 6).
 * A trade item's `type` is not in the doc's list of item types (NONE, LINEUP,
 * ADD, DROP, DRAFT, UNDRAFT, DRAFT_TRADE), so a trade's players are ADD items
 * that name both teams: a placeholder as well.
 */
function buildTransactions({ faab }) {
  const bid = (amount) => (faab ? { bidAmount: amount } : {});
  const contested = playerId(11, 0) + 1000; // an invented free agent both bidders want
  return [
    {
      id: 'fixture-txn-trade',
      type: 'TRADE_ACCEPT',
      status: 'EXECUTED',
      scoringPeriodId: SCORED_WEEK,
      teamId: 11,
      proposedDate: 1790000000000,
      acceptedDate: 1790003600000,
      processDate: 1790007200000,
      items: [
        { type: 'ADD', playerId: playerId(10, 1), fromTeamId: 11, toTeamId: 7 },
        { type: 'ADD', playerId: playerId(6, 3), fromTeamId: 7, toTeamId: 11 },
      ],
    },
    {
      id: 'fixture-txn-claim-won',
      type: 'WAIVER',
      status: 'EXECUTED',
      scoringPeriodId: SCORED_WEEK,
      teamId: 3,
      ...bid(12),
      processDate: 1790010000000,
      items: [
        { type: 'ADD', playerId: contested, fromTeamId: 0, toTeamId: 3 },
        { type: 'DROP', playerId: playerId(2, 8), fromTeamId: 3, toTeamId: 0 },
      ],
    },
    {
      id: 'fixture-txn-claim-lost',
      type: 'WAIVER_ERROR',
      status: 'FAILED',
      scoringPeriodId: SCORED_WEEK,
      teamId: 9,
      ...bid(8),
      processDate: 1790010000000,
      items: [{ type: 'ADD', playerId: contested, fromTeamId: 0, toTeamId: 9 }],
    },
    {
      id: 'fixture-txn-free-agent',
      type: 'FREEAGENT',
      status: 'EXECUTED',
      scoringPeriodId: SCORED_WEEK,
      teamId: 5,
      processDate: 1790020000000,
      items: [{ type: 'ADD', playerId: contested + 1, fromTeamId: 0, toTeamId: 5 }],
    },
    {
      id: 'fixture-txn-drop',
      type: 'ROSTER',
      status: 'EXECUTED',
      scoringPeriodId: SCORED_WEEK,
      teamId: 12,
      processDate: 1790030000000,
      items: [{ type: 'DROP', playerId: playerId(11, 8), fromTeamId: 12, toTeamId: 0 }],
    },
  ];
}

/** The free agents the transactions name, so a name lookup can resolve every ID in them. */
function freeAgents() {
  const base = playerId(11, 0) + 1000;
  return [
    { id: base, fullName: 'Pickup Marchbanks', defaultPositionId: 4, eligibleSlots: [4, 3, 5, 23, 20, 21], proTeamId: 7, injuryStatus: 'ACTIVE' },
    { id: base + 1, fullName: 'Waiver Thistlewood', defaultPositionId: 2, eligibleSlots: [2, 3, 23, 20, 21], proTeamId: 28, injuryStatus: 'ACTIVE' },
  ];
}

/**
 * One league's responses, keyed by what the fake fetch serves. Teams and
 * players are shared by every variant; only settings and transactions differ.
 *
 * Every view carries the league's ID as a top-level `id` (a number), which
 * the import route checks against ESPN_LEAGUE_ID. That ESPN sends it is not
 * in either client: a placeholder (doc, open question 34).
 *
 * @param {{ leagueId?: string, faab?: boolean, multiWeek?: boolean }} options
 */
export function buildLeague({ leagueId = PUBLIC_LEAGUE_ID, faab = true, multiWeek = false } = {}) {
  const settings = buildSettings({ faab, multiWeek });
  const base = {
    id: Number(leagueId),
    seasonId: SEASON,
    // Week 4 is complete: the league has moved on to scoring period 5. In the
    // multi-week variant, matchup period 4 is still running at scoring period 5.
    scoringPeriodId: SCORED_WEEK + 1,
    status: {
      currentMatchupPeriod: multiWeek ? 4 : SCORED_WEEK + 1,
      firstScoringPeriod: 1,
      finalScoringPeriod: 17,
      latestScoringPeriod: SCORED_WEEK + 1,
      previousSeasons: [],
    },
  };
  const teams = TEAMS_AFTER_WEEK_4.map((_, i) => buildTeam(i, faab));
  const matchupWeek4 = { ...base, schedule: buildSchedule(true) };
  return {
    views: {
      mSettings: { ...base, settings },
      mTeam: { ...base, teams, members: buildMembers() },
      mRoster: { ...base, teams: teams.map((t, i) => ({ ...t, roster: { entries: rosterEntries(i, null) } })) },
      // Without scoringPeriodId: the schedule with scores and no lineups.
      mMatchup: { ...base, schedule: buildSchedule(false) },
      // With scoringPeriodId=4: that week, with each side's lineup and bench.
      mMatchupWeek4: matchupWeek4,
      mBoxscore: matchupWeek4,
      // With scoringPeriodId=5: the week about to be played. Not in the
      // multi-week variant, where scoring period 5 is still matchup period 4.
      ...(multiWeek ? {} : { mMatchupWeek5: { ...base, schedule: buildUpcomingSchedule() } }),
      mTransactions2: { ...base, transactions: buildTransactions({ faab }) },
      // Only draftDetail.drafted is documented (doc, "Draft picks"); no picks are listed.
      mDraftDetail: { ...base, draftDetail: { drafted: true } },
    },
    settings,
    scoredWeek: SCORED_WEEK,
  };
}

/**
 * The season endpoint. The doc says it carries `currentScoringPeriod` and
 * nothing about that value's shape: `{ id }` is a placeholder (open question 19).
 */
export const SEASON_RESPONSE = { id: SEASON, currentScoringPeriod: { id: SCORED_WEEK + 1 } };

/** The rostered player a made-up ID belongs to (IDs are 9000000 + team * 10 + role + 1). */
const rosteredPlayer = (id) => buildPlayer(Math.floor((id - 9000001) / 10), (id - 9000001) % 10);

/**
 * A small players_wl: every rostered player of the first two teams, every
 * rostered player a transaction names, and the free agents it names.
 */
export const PLAYERS_WL = (() => {
  const players = new Map();
  for (const t of [0, 1]) ROLES.forEach((_, r) => players.set(playerId(t, r), buildPlayer(t, r)));
  for (const txn of buildTransactions({ faab: true })) {
    for (const item of txn.items) if (item.playerId < 9001000) players.set(item.playerId, rosteredPlayer(item.playerId));
  }
  for (const fa of freeAgents()) players.set(fa.id, fa);
  return [...players.values()];
})();

export const LEAGUE_BY_ID = {
  [PUBLIC_LEAGUE_ID]: { league: buildLeague({ leagueId: PUBLIC_LEAGUE_ID }), private: false },
  [PRIVATE_LEAGUE_ID]: { league: buildLeague({ leagueId: PRIVATE_LEAGUE_ID }), private: true },
  [ROLLING_LEAGUE_ID]: { league: buildLeague({ leagueId: ROLLING_LEAGUE_ID, faab: false }), private: false },
  [MULTI_WEEK_LEAGUE_ID]: { league: buildLeague({ leagueId: MULTI_WEEK_LEAGUE_ID, multiWeek: true }), private: false },
};

/** The week-4 points the fixture gives one team's players, for tests that check a normalizer's arithmetic. */
export const FIXTURE_WEEK = {
  week: SCORED_WEEK,
  starterTotal,
  weekPoints,
  playerId,
  rosterRoles: ROLES.map((r) => r.key),
  /** Team index 0 is Bye Week Blues. */
  pairs: PAIRS,
};
