/**
 * Turns raw Sleeper payloads into the league concepts the rest of the project
 * talks about: League, Team, Player, and a week as WeekData.
 *
 * Sleeper's field names (roster_id, owner_id, starters_points, fpts_decimal)
 * stop here. Nothing downstream should have to know that a team's score is
 * stored as two integers.
 */
import { parseDeclaredFormatType, resolveFormatType } from '../format.mjs';
import { describePlayer as describePlayerLine, playerFor, unknownPlayer } from '../league/players.mjs';
import { isFuturePick } from '../league/draftCapital.mjs';

const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI']);

/** Sleeper fills an empty starting slot with the player id "0". */
const EMPTY_SLOT = '0';

/** Sleeper stores 161.68 as fpts:161 and fpts_decimal:68. */
function points(whole, decimal) {
  return Number(((whole ?? 0) + (decimal ?? 0) / 100).toFixed(2));
}

/** 0.5 + 0.1 is 0.6000000000000001 in binary floating point. Scoring is money. */
function round2(value) {
  return Number(Number(value).toFixed(2));
}

/**
 * Sleeper's default scoring template.
 *
 * This is the baseline a league's own `scoring_settings` is measured against,
 * so that unusual rules can be reported instead of silently ignored. It is a
 * transcription of Sleeper's standard (non-PPR) league defaults, not something
 * the API tells us — Sleeper sends every league's full settings blob with no
 * indication of which values the commissioner changed.
 *
 * Being wrong here fails in the safe direction: an incorrect entry makes an
 * ordinary setting show up in the non-default list, which is visible and
 * correctable. The alternative — assuming anything unrecognised is ordinary —
 * would hide exactly the settings this table exists to find.
 */
export const SLEEPER_DEFAULT_SCORING = {
  // Passing
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
  // Rushing
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  // Receiving
  rec: 0,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  bonus_rec_te: 0,
  // Ball security
  fum: -1,
  fum_lost: -2,
  fum_rec_td: 6,
  // Kicking
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50p: 5,
  fgmiss: 0,
  xpm: 1,
  xpmiss: -1,
  // Defence and special teams
  def_td: 6,
  sack: 1,
  int: 2,
  ff: 1,
  fum_rec: 2,
  safe: 2,
  blk_kick: 2,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4,
  st_td: 6,
  st_fum_rec: 1,
  st_ff: 1,
  def_st_td: 6,
  def_st_fum_rec: 1,
  def_st_ff: 1,
  pr_td: 6,
  kr_td: 6,
};

/** The positions whose receptions Sleeper can score at a different rate. */
const RECEPTION_BONUS_KEYS = { RB: 'bonus_rec_rb', WR: 'bonus_rec_wr', TE: 'bonus_rec_te' };

/**
 * The raw Sleeper keys that actually feed a field of the derived profile.
 *
 * Doctor and the prompts reason about reception rate, positional bonuses,
 * passing touchdown value and passing yardage/interceptions — nothing else.
 * A league that changes a key outside this set (return yardage, first-down
 * bonuses, IDP tackle scoring) has scoring this tool does not act on at all,
 * which is exactly what `notModelled` below exists to surface.
 */
const MODELLED_SCORING_KEYS = new Set([
  'rec',
  'pass_td',
  'pass_yd',
  'pass_int',
  ...Object.values(RECEPTION_BONUS_KEYS),
]);

/** What managers call a per-reception value when they describe their league. */
function receptionTier(base) {
  if (base === 0) return 'standard';
  if (base === 0.5) return 'half-PPR';
  if (base === 1) return 'full PPR';
  return 'custom';
}

/**
 * Settings that differ from Sleeper's defaults, so unusual scoring is visible.
 *
 * Two kinds of difference count. A key in the default table holding a value
 * that is not its default — including one turned *off*, because a league with
 * no interception penalty is unusual and would otherwise read as ordinary. And
 * a key the table has never heard of: return yardage, first-down bonuses and
 * tackle-based IDP scoring appear in no default template, so an unrecognised
 * key set to something other than zero is reported rather than dropped.
 *
 * Unrecognised keys left at zero are skipped. Sleeper sends a long tail of them
 * for scoring that is simply switched off, and listing those would bury the
 * settings that actually matter.
 */
function nonDefaultScoring(scoring) {
  const changed = [];
  for (const [key, value] of Object.entries(scoring)) {
    if (typeof value !== 'number') continue;
    const known = Object.hasOwn(SLEEPER_DEFAULT_SCORING, key);
    const fallback = known ? SLEEPER_DEFAULT_SCORING[key] : null;
    if (known ? value === fallback : value === 0) continue;
    changed.push({ key, value, default: fallback });
  }
  return changed.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * How this league scores, as something downstream can reason about.
 *
 * `league.scoring` is Sleeper's raw blob: forty-odd keys, most of them noise,
 * none of them answering the question an editor actually has — is a tight end
 * worth more than a receiver here, and how much is a quarterback worth? This
 * turns the blob into those answers.
 *
 * Positional reception bonuses are expressed as a delta over the base rate as
 * well as an effective per-catch value, because the delta is the part that
 * changes what a position is worth: +0.5 on top of full PPR makes a tight end
 * catch worth 1.5, and 1.5-against-1.0 is the fact that moves a ranking.
 *
 * Superflex is a property of the starting lineup rather than the scoring blob,
 * but it belongs in the same answer: how a league scores and how many
 * quarterbacks it starts are one question about what players are worth.
 */
export function deriveScoringProfile(scoringSettings = {}, { startingSlots = [] } = {}) {
  const scoring = scoringSettings || {};
  const base = scoring.rec ?? 0;

  const byPosition = {};
  const premiumPositions = [];
  for (const [position, key] of Object.entries(RECEPTION_BONUS_KEYS)) {
    const bonus = scoring[key] ?? 0;
    byPosition[position] = { perCatch: round2(base + bonus), bonus: round2(bonus) };
    if (bonus > 0) premiumPositions.push(position);
  }

  // Zero is a real setting — a league really can score a passing touchdown at
  // nothing — so an absent value stays null rather than collapsing into it.
  const pointsPerYard = scoring.pass_yd ?? null;

  const nonDefault = nonDefaultScoring(scoring);
  const notModelled = nonDefault.filter((entry) => !MODELLED_SCORING_KEYS.has(entry.key));

  return {
    superflex:
      startingSlots.includes('SUPER_FLEX') || startingSlots.filter((s) => s === 'QB').length > 1,
    reception: {
      base,
      tier: receptionTier(base),
      byPosition,
      premiumPositions,
    },
    passing: {
      touchdown: scoring.pass_td ?? null,
      pointsPerYard,
      yardsPerPoint: pointsPerYard ? round2(1 / pointsPerYard) : null,
      interception: scoring.pass_int ?? null,
    },
    nonDefault,
    // Non-default settings this tool has no field for, anywhere in the
    // profile above — reported so doctor can list them instead of hiding
    // scoring the rest of the publication silently ignores.
    notModelled,
    isDefault: nonDefault.length === 0,
  };
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
    draftStatus: normalizeDraftStatus(league.status),
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
      scoring: deriveScoringProfile(scoring, { startingSlots }),
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
      // Lined up with the starting slots; null is an empty slot.
      starterIds: starterIdsOf(roster.starters),
      taxiIds: roster.taxi || [],
      reserveIds: roster.reserve || [],
    };
  });
}

/** Compact player record. The full Sleeper player blob is far too large to send to a model. */
export function normalizePlayer(id, player) {
  if (!player) return unknownPlayer(id);
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
 * Sleeper's /players/nfl file as the player dictionary (src/league/players.mjs),
 * keyed by the same ids. Around 12,000 players, so it is built once per run by
 * `openLeague`, never per lookup.
 *
 * An empty entry is left out rather than turned into a stand-in: a lookup of
 * it then misses, exactly as it did against the raw file.
 */
export function normalizePlayers(rawPlayers) {
  const players = {};
  for (const [id, player] of Object.entries(rawPlayers ?? {})) {
    if (player) players[id] = normalizePlayer(id, player);
  }
  return players;
}

/**
 * Sleeper's league.status as the draft state every provider reports. Sleeper
 * says pre_draft, drafting, in_season or complete; the last two both mean the
 * current season's draft has been held. A missing status counts as held, as it
 * always has.
 */
export function normalizeDraftStatus(status) {
  if (status === 'pre_draft' || status === 'drafting') return status;
  return 'complete';
}

/**
 * Sleeper's traded_picks as { season, round, originalRosterId, ownerRosterId,
 * previousOwnerRosterId }. roster_id is whose pick it was, owner_id who holds
 * it now. Nothing past src/sleeper/ reads those names.
 */
export function normalizeTradedPicks(rawPicks) {
  return (rawPicks || []).map((pick) => ({
    season: String(pick.season),
    round: pick.round,
    originalRosterId: pick.roster_id,
    ownerRosterId: pick.owner_id,
    previousOwnerRosterId: pick.previous_owner_id ?? null,
  }));
}

/**
 * Turns Sleeper's transaction objects into lines a human (or a model) can read,
 * and into the structure a trade or a pickup can actually be judged on.
 *
 * The raw shape is roster IDs pointing at player IDs, which is both unreadable
 * and enormous. Only completed moves are reported — a failed waiver claim is
 * not news.
 *
 * Two views of the same move, side by side:
 *
 *   moves  prose lines ("Team A gets Josh Allen (QB, BUF, age 29)") — what
 *          every edition already passes along as colour. Unchanged.
 *   sides  one entry per roster involved, keyed by roster id: what it
 *          received and what it gave up, as player and pick references. Team
 *          names rename freely mid-season, so `team` is for display only and
 *          `rosterId` is the identity — the same rule src/teamIdentity.mjs
 *          follows for published rankings.
 *
 * `completedAt` is when the move cleared, not when it was proposed. It matters
 * because a trade that clears Monday night leaves that week's points with the
 * team that gave the player up.
 */
export function normalizeTransactions(transactions, { teamsByRosterId, players, describePlayer, league }) {
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;
  const player = (id) => describePlayer(id, players[id]);

  return (transactions || [])
    .filter((entry) => entry.status === 'complete')
    .map((entry) => {
      const addEntries = Object.entries(entry.adds || {});
      const dropEntries = Object.entries(entry.drops || {});
      // A pick for a draft that has already been held is a spent receipt, not
      // an asset. Reporting it invites analysis of draft capital that no
      // longer exists — especially in a league's startup year, where most
      // traded picks were consumed by the startup draft itself.
      const livePicks = (entry.draft_picks || []).filter((pick) => (league ? isFuturePick(pick, league) : true));
      const budgetMoves = entry.waiver_budget || [];

      const adds = addEntries.map(([id, rosterId]) => `${name(rosterId)} gets ${player(id)}`);
      const drops = dropEntries.map(([id, rosterId]) => `${name(rosterId)} drops ${player(id)}`);
      const picks = livePicks.map(
        (pick) => `${name(pick.owner_id)} gets ${pick.season} round ${pick.round} pick from ${name(pick.roster_id)}`,
      );
      const budget = budgetMoves.map(
        (move) => `${name(move.sender)} sends $${move.amount} FAAB to ${name(move.receiver)}`,
      );

      const bid = entry.settings?.waiver_bid ?? null;
      const rosterIds = entry.roster_ids || [];

      return {
        type: entry.type,
        week: entry.leg ?? null,
        teams: rosterIds.map(name),
        bid,
        moves: [...adds, ...drops, ...picks, ...budget],
        id: entry.transaction_id ?? null,
        completedAt: Number.isFinite(entry.status_updated) ? new Date(entry.status_updated).toISOString() : null,
        rosterIds,
        sides: transactionSides({
          rosterIds,
          addEntries,
          dropEntries,
          livePicks,
          budgetMoves,
          // A bid is what a waiver claim cost the claimant. Anything else
          // carrying one would be a Sleeper oddity, not a cost to report.
          bid: entry.type === 'waiver' ? bid : null,
          players,
          name,
        }),
      };
    })
    .filter((entry) => entry.moves.length > 0);
}

/** A player as a reference: enough to identify and judge, no prose. */
function playerRef(id, players) {
  const player = playerFor(players, id);
  return { id, name: player.name, position: player.position, nflTeam: player.team, age: player.age ?? null };
}

/**
 * Per-roster view of one transaction. A player in `adds` went to that roster;
 * one in `drops` left it. A dropped player nobody added was released to free
 * agency (`to: null`); an added player nobody dropped came off the wire
 * (`from: null`).
 */
function transactionSides({ rosterIds, addEntries, dropEntries, livePicks, budgetMoves, bid, players, name }) {
  const addedTo = new Map(addEntries);
  const droppedBy = new Map(dropEntries);

  // Every roster that moved anything, in Sleeper's own order first.
  const involved = [...rosterIds];
  const include = (rosterId) => {
    if (rosterId !== undefined && rosterId !== null && !involved.includes(rosterId)) involved.push(rosterId);
  };
  for (const [, rosterId] of [...addEntries, ...dropEntries]) include(rosterId);
  for (const pick of livePicks) {
    include(pick.owner_id);
    include(pick.previous_owner_id ?? pick.roster_id);
  }
  for (const move of budgetMoves) {
    include(move.sender);
    include(move.receiver);
  }

  return involved.map((rosterId) => {
    const pickRef = (pick) => ({ season: String(pick.season), round: pick.round, originalRosterId: pick.roster_id });
    const pickGiver = (pick) => pick.previous_owner_id ?? pick.roster_id;
    const side = {
      rosterId,
      team: name(rosterId),
      received: {
        players: addEntries
          .filter(([, to]) => to === rosterId)
          .map(([id]) => ({ ...playerRef(id, players), from: droppedBy.get(id) ?? null })),
        picks: livePicks
          .filter((pick) => pick.owner_id === rosterId)
          .map((pick) => ({ ...pickRef(pick), from: pickGiver(pick) })),
        faab: budgetMoves.filter((move) => move.receiver === rosterId).reduce((sum, move) => sum + move.amount, 0),
      },
      gaveUp: {
        players: dropEntries
          .filter(([, from]) => from === rosterId)
          .map(([id]) => ({ ...playerRef(id, players), to: addedTo.get(id) ?? null })),
        picks: livePicks
          .filter((pick) => pickGiver(pick) === rosterId && pick.owner_id !== rosterId)
          .map((pick) => ({ ...pickRef(pick), to: pick.owner_id })),
        faab: budgetMoves.filter((move) => move.sender === rosterId).reduce((sum, move) => sum + move.amount, 0),
      },
    };
    // Only the roster that won the claim paid for it.
    if (bid !== null && side.received.players.length > 0) side.waiverBid = bid;
    return side;
  });
}

/**
 * Sleeper's starters list, lined up with the league's starting slots, with its
 * "0" placeholder for an empty slot turned into null. Nothing past
 * src/sleeper/ knows the placeholder.
 */
function starterIdsOf(starters) {
  return (starters || []).map((id) => (id === EMPTY_SLOT ? null : id));
}

/**
 * Each roster as it was fielded in one week, out of that week's raw matchup
 * entries: WeekData's `rosters`.
 *
 * Sleeper keeps no roster history; a week's matchup entry is the only record
 * of what a roster held then, bench included. That makes it the "as of the
 * move" picture a trade or a claim has to be judged against — today's roster
 * already carries every later move.
 *
 * `starterPoints` lines up with `starterIds` and is passed through as Sleeper
 * sent it, which can be shorter than the lineup. `points` is null when Sleeper
 * sent none. `pairingKey` is the matchup_id: two rosters sharing one are
 * opponents (src/league/pairing.mjs), and null is a bye.
 */
export function normalizeWeekRosters(matchups) {
  return (matchups || []).map((entry) => ({
    rosterId: entry.roster_id,
    playerIds: entry.players || [],
    starterIds: starterIdsOf(entry.starters),
    starterPoints: entry.starters_points || [],
    playerPoints: entry.players_points || {},
    points: entry.points ?? null,
    pairingKey: entry.matchup_id ?? null,
  }));
}

/**
 * Every FAAB bid in a set of raw transactions, won and lost: WeekData's
 * `bids`.
 *
 * normalizeTransactions reports completed moves only — a failed claim is not
 * news on its own — but a failed bid is exactly what shows whether a winner
 * overpaid (src/analysis/faab.mjs). A bid has a price: an entry with no
 * `waiver_bid` at all, such as an ordinary free-agent add, is not a bid, the
 * same way normalizeTransactions treats a missing bid as null rather than
 * zero. A completed entry is a won bid and a failed one a lost bid; any other
 * status is neither.
 *
 * `type` is carried because only a waiver claim's bids make a week's market,
 * while any completed entry with a bid can be the price a released player went
 * for. One entry with several adds is one bid per added player, in Sleeper's
 * order.
 */
export function normalizeBids(transactions) {
  const bids = [];
  for (const entry of transactions || []) {
    const outcome = entry.status === 'complete' ? 'won' : entry.status === 'failed' ? 'lost' : null;
    const amount = entry.settings?.waiver_bid;
    if (!outcome || amount === undefined || amount === null) continue;
    for (const [playerId, rosterId] of Object.entries(entry.adds || {})) {
      bids.push({
        playerId,
        rosterId,
        week: entry.leg ?? null,
        amount,
        outcome,
        type: entry.type,
        transactionId: entry.transaction_id ?? null,
      });
    }
  }
  return bids;
}

/**
 * One saved week as WeekData, the shape analysis reads:
 *
 *   week          the week the bundle was saved for
 *   rosters       normalizeWeekRosters
 *   transactions  normalizeTransactions: completed moves, with moves and sides
 *   bids          normalizeBids: every bid, won and lost
 *
 * `rawBundle` is what captureWeek saves under data/raw/: `{ week, matchups,
 * transactions }`. A bundle with no `provider` field, as every bundle written
 * before the provider boundary is, is read as Sleeper. Pure: reads nothing,
 * fetches nothing.
 *
 * `describePlayer` writes the transaction lines; it defaults to the one every
 * edition prints (src/league/players.mjs).
 */
export function normalizeWeek(rawBundle, { league = null, teams = [], players = {}, describePlayer = describePlayerLine } = {}) {
  const bundle = rawBundle || {};
  const teamsByRosterId = new Map((teams || []).map((team) => [team.rosterId, team]));
  return {
    week: bundle.week ?? null,
    rosters: normalizeWeekRosters(bundle.matchups),
    transactions: normalizeTransactions(bundle.transactions, { teamsByRosterId, players, describePlayer, league }),
    bids: normalizeBids(bundle.transactions),
  };
}

