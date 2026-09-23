/**
 * Turns raw Sleeper payloads into the league concepts the rest of the project
 * talks about: League, Team, Player, Matchup.
 *
 * Sleeper's field names (roster_id, owner_id, starters_points, fpts_decimal)
 * stop here. Nothing downstream should have to know that a team's score is
 * stored as two integers.
 */
import { parseDeclaredFormatType, resolveFormatType } from '../format.mjs';

const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

/** Sleeper stores 161.68 as fpts:161 and fpts_decimal:68. */
function points(whole, decimal) {
  return Number(((whole ?? 0) + (decimal ?? 0) / 100).toFixed(2));
}

/**
 * The format Sleeper's own settings imply.
 *
 * `settings.type` is 2 for a dynasty league, and a taxi squad only exists in
 * one — either is enough. Everything else is reported as redraft, which is the
 * honest reading: Sleeper has no field that distinguishes a guillotine league
 * from an ordinary head-to-head one, because the commissioner eliminates teams
 * by hand. Detection therefore never returns guillotine; declaring it is the
 * only way in. See src/format.mjs.
 *
 * Total by design: every league Sleeper can describe gets a type back.
 */
export function detectFormatType(league) {
  const settings = league.settings || {};
  const dynasty = (settings.type ?? null) === 2 || Number(settings.taxi_slots ?? 0) > 0;
  return dynasty ? 'dynasty' : 'redraft';
}

/**
 * @param league raw Sleeper league payload
 * @param declaredFormatType what the operator declared, if anything; it wins
 *        over detection, and a misspelling throws rather than being ignored
 */
export function normalizeLeague(league, { declaredFormatType = null } = {}) {
  const startingSlots = (league.roster_positions || []).filter((slot) => !BENCH_SLOTS.has(slot));
  const scoring = league.scoring_settings || {};
  const settings = league.settings || {};

  const declared = parseDeclaredFormatType(declaredFormatType);
  const detectedType = detectFormatType(league);
  const resolved = resolveFormatType({ declared, detected: detectedType });

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
    draftRounds: settings.draft_rounds ?? null,
    startingSlots,
    benchSlots: (league.roster_positions || []).filter((slot) => slot === 'BN').length,
    taxiSlots: settings.taxi_slots ?? 0,
    reserveSlots: settings.reserve_slots ?? 0,
    playoffTeams: settings.playoff_teams ?? null,
    playoffWeekStart: settings.playoff_week_start ?? null,
    tradeDeadline: settings.trade_deadline ?? null,
    waiverBudget: settings.waiver_budget ?? null,
    // What kind of league this is, and how points are scored in it, are two
    // different questions: a guillotine league can be superflex and TE premium
    // at the same time. Keeping the modifiers in their own sub-object stops
    // downstream code from branching on a scoring rule when it means a format.
    format: {
      type: resolved.type,
      source: resolved.source,
      declaredType: declared,
      detectedType,
      scoring: {
        superflex:
          startingSlots.includes('SUPER_FLEX') || startingSlots.filter((s) => s === 'QB').length > 1,
        pointsPerReception: scoring.rec ?? 0,
        tePremium: scoring.bonus_rec_te ?? 0,
        passingTouchdown: scoring.pass_td ?? null,
      },
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
 * Has the current season's draft already been held?
 *
 * Matters because a pick for the current season is an asset before the draft
 * and a spent receipt afterwards. A league's first year is a startup draft, so
 * those picks are gone the moment it ends; later years draft rookies only.
 */
export function currentSeasonDrafted(league) {
  return !['pre_draft', 'drafting'].includes(league.status);
}

/** A pick only counts as capital if its draft has not happened yet. */
export function isFuturePick(pick, league) {
  const season = Number(pick.season);
  const current = Number(league.season);
  if (season > current) return true;
  if (season < current) return false;
  return !currentSeasonDrafted(league);
}

/**
 * Turns Sleeper's transaction objects into lines a human (or a model) can read.
 *
 * The raw shape is roster IDs pointing at player IDs, which is both unreadable
 * and enormous. Only completed moves are reported — a failed waiver claim is
 * not news.
 */
export function normalizeTransactions(transactions, { teamsByRosterId, players, describePlayer, league }) {
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;
  const player = (id) => describePlayer(id, players[id]);

  return (transactions || [])
    .filter((entry) => entry.status === 'complete')
    .map((entry) => {
      const adds = Object.entries(entry.adds || {}).map(([id, rosterId]) => `${name(rosterId)} gets ${player(id)}`);
      const drops = Object.entries(entry.drops || {}).map(([id, rosterId]) => `${name(rosterId)} drops ${player(id)}`);
      // A pick for a draft that has already been held is a spent receipt, not
      // an asset. Reporting it invites analysis of draft capital that no
      // longer exists — especially in a league's startup year, where most
      // traded picks were consumed by the startup draft itself.
      const picks = (entry.draft_picks || [])
        .filter((pick) => (league ? isFuturePick(pick, league) : true))
        .map(
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

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (round) => ORDINALS[round] ?? `round ${round}`;

/**
 * Net future draft capital per team.
 *
 * Sleeper only reports picks that have *moved*, so a complete picture means
 * starting every team with one pick per round and applying those moves. What
 * the publication actually wants to know is who is hoarding rookie picks and
 * who has mortgaged them.
 */
export function normalizeFutureDraftCapital({ tradedPicks, league, teamsByRosterId, roundsPerDraft }) {
  const future = (tradedPicks || []).filter((pick) => isFuturePick(pick, league));
  if (future.length === 0) return null;

  const rounds = roundsPerDraft > 0 ? roundsPerDraft : 0;
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;
  const seasons = [...new Set(future.map((pick) => String(pick.season)))].sort();

  const rows = [];
  for (const season of seasons) {
    const held = new Map([...teamsByRosterId.keys()].map((rosterId) => [rosterId, rounds]));
    const acquired = new Map();
    const lost = new Map();

    for (const pick of future.filter((p) => String(p.season) === season)) {
      // roster_id is whose pick it originally was; owner_id is who holds it now.
      if (pick.owner_id === pick.roster_id) continue;
      held.set(pick.owner_id, (held.get(pick.owner_id) ?? rounds) + 1);
      held.set(pick.roster_id, (held.get(pick.roster_id) ?? rounds) - 1);
      if (!acquired.has(pick.owner_id)) acquired.set(pick.owner_id, []);
      if (!lost.has(pick.roster_id)) lost.set(pick.roster_id, []);
      acquired.get(pick.owner_id).push(`${name(pick.roster_id)} ${ordinal(pick.round)}`);
      lost.get(pick.roster_id).push(`own ${ordinal(pick.round)} to ${name(pick.owner_id)}`);
    }

    for (const rosterId of teamsByRosterId.keys()) {
      const gained = acquired.get(rosterId) ?? [];
      const given = lost.get(rosterId) ?? [];
      if (gained.length === 0 && given.length === 0) continue;
      rows.push({
        team: name(rosterId),
        season,
        picksHeld: held.get(rosterId),
        baseline: rounds,
        acquired: gained,
        tradedAway: given,
      });
    }
  }

  return {
    note:
      `Only picks for drafts that have not happened yet. Picks for ${league.season} and ` +
      'earlier are spent and are deliberately excluded.',
    roundsPerDraft: rounds,
    seasons,
    teams: rows,
  };
}
