/**
 * Turns raw Sleeper payloads into the league concepts the rest of the project
 * talks about: League, Team, Player, Matchup.
 *
 * Sleeper's field names (roster_id, owner_id, starters_points, fpts_decimal)
 * stop here. Nothing downstream should have to know that a team's score is
 * stored as two integers.
 */

const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

/** Sleeper stores 161.68 as fpts:161 and fpts_decimal:68. */
function points(whole, decimal) {
  return Number(((whole ?? 0) + (decimal ?? 0) / 100).toFixed(2));
}

export function normalizeLeague(league) {
  const startingSlots = (league.roster_positions || []).filter((slot) => !BENCH_SLOTS.has(slot));
  const scoring = league.scoring_settings || {};
  const settings = league.settings || {};

  return {
    id: league.league_id,
    name: league.name,
    season: league.season,
    seasonType: league.season_type,
    status: league.status,
    sport: league.sport,
    teamCount: settings.num_teams ?? (league.roster_positions ? null : null),
    currentWeek: settings.leg ?? null,
    lastScoredWeek: settings.last_scored_leg ?? null,
    previousLeagueId: league.previous_league_id ?? null,
    draftId: league.draft_id ?? null,
    startingSlots,
    benchSlots: (league.roster_positions || []).filter((slot) => slot === 'BN').length,
    taxiSlots: settings.taxi_slots ?? 0,
    reserveSlots: settings.reserve_slots ?? 0,
    playoffTeams: settings.playoff_teams ?? null,
    playoffWeekStart: settings.playoff_week_start ?? null,
    tradeDeadline: settings.trade_deadline ?? null,
    waiverBudget: settings.waiver_budget ?? null,
    format: {
      superflex: startingSlots.includes('SUPER_FLEX') || startingSlots.filter((s) => s === 'QB').length > 1,
      pointsPerReception: scoring.rec ?? 0,
      tePremium: scoring.bonus_rec_te ?? 0,
      passingTouchdown: scoring.pass_td ?? null,
      dynasty: (league.settings?.type ?? null) === 2 || Boolean(settings.taxi_slots),
    },
    scoring,
  };
}

/**
 * Teams keyed by roster_id. `name` is the franchise name a manager set in
 * Sleeper; when they never set one, Sleeper shows their username instead and
 * so do we — that is what the league actually calls them.
 */
export function normalizeTeams({ rosters, users }) {
  const usersById = new Map((users || []).map((user) => [user.user_id, user]));

  return (rosters || []).map((roster) => {
    const user = usersById.get(roster.owner_id);
    const settings = roster.settings || {};
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      name: user?.metadata?.team_name?.trim() || user?.display_name || `Roster ${roster.roster_id}`,
      manager: user?.display_name || 'unknown',
      coOwnerIds: roster.co_owners || [],
      record: {
        wins: settings.wins ?? 0,
        losses: settings.losses ?? 0,
        ties: settings.ties ?? 0,
      },
      seasonPointsFor: points(settings.fpts, settings.fpts_decimal),
      seasonPointsAgainst: points(settings.fpts_against, settings.fpts_against_decimal),
      seasonPotentialPoints: points(settings.ppts, settings.ppts_decimal),
      waiverBudgetUsed: settings.waiver_budget_used ?? 0,
      playerIds: roster.players || [],
      starterIds: roster.starters || [],
      taxiIds: roster.taxi || [],
      reserveIds: roster.reserve || [],
    };
  });
}

/** Compact player record. The full Sleeper player blob is far too large to send to a model. */
export function normalizePlayer(id, player) {
  if (!player) return { id, name: `Unknown player ${id}`, position: null, team: null };
  const name =
    player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || id;
  return {
    id,
    name,
    position: player.position ?? null,
    team: player.team ?? null,
    age: player.age ?? null,
    yearsExp: player.years_exp ?? null,
    injuryStatus: player.injury_status ?? null,
    status: player.status ?? null,
  };
}

/**
 * Pairs the flat matchup array into head-to-head games.
 *
 * The one rule that matters: two matchup objects sharing a matchup_id are
 * opponents. Entries with a null matchup_id are byes and are reported as such
 * rather than silently dropped.
 */
export function pairMatchups(matchups, teamsByRosterId) {
  const groups = new Map();
  const byes = [];

  for (const entry of matchups || []) {
    if (entry.matchup_id === null || entry.matchup_id === undefined) {
      byes.push(entry);
      continue;
    }
    if (!groups.has(entry.matchup_id)) groups.set(entry.matchup_id, []);
    groups.get(entry.matchup_id).push(entry);
  }

  const games = [];
  for (const [matchupId, sides] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (sides.length !== 2) {
      byes.push(...sides);
      continue;
    }
    games.push({
      matchupId,
      sides: sides.map((side) => ({
        rosterId: side.roster_id,
        team: teamsByRosterId.get(side.roster_id)?.name ?? `Roster ${side.roster_id}`,
        points: side.points ?? 0,
        raw: side,
      })),
    });
  }

  return { games, byes };
}

/**
 * Turns Sleeper's transaction objects into lines a human (or a model) can read.
 *
 * The raw shape is roster IDs pointing at player IDs, which is both unreadable
 * and enormous. Only completed moves are reported — a failed waiver claim is
 * not news.
 */
export function normalizeTransactions(transactions, { teamsByRosterId, players, describePlayer }) {
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;
  const player = (id) => describePlayer(id, players[id]);

  return (transactions || [])
    .filter((entry) => entry.status === 'complete')
    .map((entry) => {
      const adds = Object.entries(entry.adds || {}).map(([id, rosterId]) => `${name(rosterId)} gets ${player(id)}`);
      const drops = Object.entries(entry.drops || {}).map(([id, rosterId]) => `${name(rosterId)} drops ${player(id)}`);
      const picks = (entry.draft_picks || []).map(
        (pick) => `${name(pick.owner_id)} gets ${pick.season} round ${pick.round} pick from ${name(pick.roster_id)}`,
      );
      const budget = (entry.waiver_budget || []).map(
        (move) => `${name(move.sender)} sends $${move.amount} FAAB to ${name(move.receiver)}`,
      );

      return {
        type: entry.type,
        week: entry.leg ?? null,
        teams: (entry.roster_ids || []).map(name),
        bid: entry.settings?.waiver_bid ?? null,
        moves: [...adds, ...drops, ...picks, ...budget],
      };
    })
    .filter((entry) => entry.moves.length > 0);
}
