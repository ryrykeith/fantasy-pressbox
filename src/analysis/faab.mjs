/**
 * The waiver market: what each survivor still has to spend, and what a chop
 * just dumped onto the wire for them to spend it on.
 *
 * The waiver market IS the story in a guillotine league — every elimination
 * releases a full roster of talent at once, unlike the trickle of cuts an
 * ordinary league sees. This module answers two questions with the facts
 * already available, numbers only, never prose (src/promptContext.mjs is
 * where a fact turns into an instruction to a model, the same separation
 * src/analysis/elimination.mjs and src/analysis/danger.mjs already keep):
 *
 *   balances       what each surviving team has left of the league's FAAB
 *                  budget, and what it has spent so far. league.waiverBudget
 *                  and team.waiverBudgetUsed (src/sleeper/normalize.mjs) are
 *                  already exactly this; the only work here is the
 *                  subtraction and restricting it to teams still alive.
 *   releasedPools  the players a chopped roster held the moment it was
 *                  eliminated, one entry per week in the elimination
 *                  ledger's history, plus any winning FAAB bid later placed
 *                  on one of them.
 *
 * Sleeper keeps no history of what a roster looked like in a past week — see
 * src/analysis/elimination.mjs's own docstring on the same limitation — so a
 * chopped roster cannot be reconstructed after the fact by diffing today's
 * (now-empty) roster against anything. What *does* survive is that week's own
 * matchup entry: Sleeper scores a week against the roster as it stood when
 * the week was played, before a commissioner force-drops it afterward, and
 * that entry's players (src/store.mjs's raw bundle, saved the moment the week
 * was fetched, read back as WeekData rosters) are the full squad, bench
 * included. That is the one reliable source for "what got released", and it
 * is why this module reads that week's rosters rather than today's teams.
 */
import { playerFor } from '../league/players.mjs';

/**
 * Remaining FAAB per surviving team, and what each has spent so far.
 *
 * `waiverBudget` is the league-wide season total (league.waiverBudget); a
 * league that never set one reports `remaining: null` rather than a
 * subtraction against nothing — Sleeper really can leave this unset, and a
 * guessed number is worse than an absent one.
 *
 * Restricted to `ledger.survivors` when a ledger is supplied, the same
 * convention src/analysis/danger.mjs#weekDanger uses: an eliminated team has
 * no more waivers to win, so it does not belong on a market report. Omit the
 * ledger to treat every team as still alive.
 *
 * Sorted richest-remaining-first — the team best positioned to win the next
 * release is the one this report should lead with.
 */
export function faabBalances({ teams = [], waiverBudget = null, ledger = null } = {}) {
  const survivorIds = ledger ? new Set((ledger.survivors ?? []).map((entry) => entry.rosterId)) : null;

  return teams
    .filter((team) => !survivorIds || survivorIds.has(team.rosterId))
    .map((team) => {
      const spent = team.waiverBudgetUsed ?? 0;
      return {
        rosterId: team.rosterId,
        team: team.name,
        spent,
        remaining: waiverBudget === null ? null : waiverBudget - spent,
      };
    })
    .sort((a, b) => (b.remaining ?? -Infinity) - (a.remaining ?? -Infinity));
}

/**
 * The player pool one elimination released, attributed to the team that was
 * chopped.
 *
 * `rosters` is that week's WeekData rosters (normalizeWeek over the raw
 * bundle src/store.mjs saved) — not this week's, *that* week's, because a
 * roster's contents are only ever known for the week they were actually
 * fielded. A week nobody has fetched yet (or a chop old enough that its raw
 * bundle was never saved) yields an explicit, reported gap rather than a
 * guess: an empty pool that looked the same as "this roster released nothing"
 * would hide exactly the data problem an operator needs to go fetch that week
 * to fix.
 */
export function releasedPool({ eliminatedEntry, rosters = [] } = {}) {
  const base = {
    week: eliminatedEntry.week,
    team: eliminatedEntry.team,
    rosterId: eliminatedEntry.rosterId,
  };
  const roster = (rosters || []).find((entry) => entry.rosterId === eliminatedEntry.rosterId);

  if (!roster) {
    return {
      ...base,
      playerIds: [],
      playerPoints: {},
      note:
        `No week ${eliminatedEntry.week} matchup data is on disk for ${eliminatedEntry.team}, so the ` +
        'released pool cannot be listed. Fetch that week to fill this in.',
    };
  }

  const playerIds = roster.playerIds || [];
  const playerPoints = roster.playerPoints ?? {};
  return {
    ...base,
    playerIds,
    playerPoints: Object.fromEntries(playerIds.map((id) => [id, playerPoints[id] ?? 0])),
  };
}

/**
 * Winning FAAB bids on a specific set of players, out of WeekData bids.
 *
 * A bid only counts if its transaction completed: a failed claim won nothing.
 * Any completed entry carrying a bid counts, whatever its type, because the
 * question is what a released player went for. Sorted by week, earliest
 * first, keeping the order given within a week.
 *
 * @param bids             WeekData bids, from any number of weeks
 * @param playerIds        the players wanted
 * @param teamsByRosterId  Map<rosterId, team>, for naming the winner
 */
export function waiverBidsFor(bids, playerIds, { teamsByRosterId }) {
  const wanted = new Set(playerIds);
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;

  return (bids || [])
    .filter((bid) => bid.outcome === 'won' && wanted.has(bid.playerId))
    .map((bid) => ({ playerId: bid.playerId, week: bid.week, amount: bid.amount, wonBy: name(bid.rosterId) }))
    .sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
}

/**
 * The full FAAB market state for a guillotine league: balances plus every
 * elimination's released pool, each with any winning bid already placed on
 * one of its players.
 *
 * @param teams            normalized teams (src/sleeper/normalize.mjs#normalizeTeams)
 * @param waiverBudget     league.waiverBudget, or null if the league never set one
 * @param ledger           the elimination ledger (src/analysis/elimination.mjs);
 *                         omit it to treat every team as alive and report no pools
 * @param weeks            `[{ week, rosters, bids }]`, any order — WeekData for
 *                         every raw bundle available (src/store.mjs#loadRawThrough)
 * @param teamsByRosterId  Map<rosterId, team>, for naming a winning bidder
 */
export function buildFaabMarket({
  teams = [],
  waiverBudget = null,
  ledger = null,
  weeks = [],
  teamsByRosterId,
} = {}) {
  const byWeek = new Map(weeks.map((weekData) => [weekData.week, weekData]));
  const history = ledger?.history ?? [];

  const releasedPools = history.map((entry) => {
    const weekData = byWeek.get(entry.week);
    const pool = releasedPool({ eliminatedEntry: entry, rosters: weekData?.rosters ?? [] });
    if (pool.playerIds.length === 0) return pool;

    // A released player can be claimed any week from the chop onward, not
    // only the week it happened — so every later week's bids are in play,
    // not just the chop week's own.
    const laterBids = weeks.filter((later) => later.week >= entry.week).flatMap((later) => later.bids ?? []);
    const bids = waiverBidsFor(laterBids, pool.playerIds, { teamsByRosterId });
    return bids.length ? { ...pool, bids } : pool;
  });

  return {
    budget: waiverBudget,
    balances: faabBalances({ teams, waiverBudget, ledger }),
    releasedPools,
  };
}

/**
 * What counts as "similar money" when describing a claim against the rest of
 * its week: another bid within the larger of `absolute` dollars or `relative`
 * of this one. A flat percentage alone calls a $1 and a $2 bid dissimilar; a
 * flat dollar window alone calls $40 and $42 the same as $1 and $3.
 */
export const SIMILAR_SPEND = { absolute: 2, relative: 0.25 };

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Every waiver bid placed in one week, won and lost, most expensive first.
 *
 * normalizeTransactions reports completed moves only — a failed claim is not
 * news on its own — but a failed bid is exactly what shows whether a winner
 * overpaid, so the market reads WeekData's bids, which keep both. Only a
 * waiver claim's bids make the market.
 *
 * @param bids             WeekData bids (a provider's normalizeWeek)
 * @param week             the week to read; bids from other weeks are ignored
 * @param players          the player dictionary, keyed by id
 * @param teamsByRosterId  Map<rosterId, team>, for display names only
 */
export function weekBids({ bids = [], week, players = {}, teamsByRosterId = new Map() } = {}) {
  return (bids || [])
    .filter((bid) => bid.type === 'waiver' && bid.week === week)
    .map((bid) => {
      const player = playerFor(players, bid.playerId);
      return {
        playerId: bid.playerId,
        player: player.name,
        position: player.position,
        rosterId: bid.rosterId,
        team: teamsByRosterId.get(bid.rosterId)?.name ?? `Roster ${bid.rosterId}`,
        amount: bid.amount,
        outcome: bid.outcome,
        transactionId: bid.transactionId ?? null,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * One winning claim, described against its week's market: what rivals bid for
 * the same player, where the price ranks among the week's winning bids, and
 * what else was going for similar money.
 *
 * `margin` is the winning bid less the best losing bid on the same player — a
 * large one is an overpay, 0 a tie broken by priority — and null when the
 * claim was uncontested, since an uncontested bid shows nothing either way.
 * `chopRelease` names the elimination whose roster released the player, or
 * null; in a league with no chop pools that is simply "not applicable".
 *
 * @param bid           the winning entry from weekBids()
 * @param bids          weekBids() for the claim's week
 * @param releasedPools buildFaabMarket().releasedPools; omit outside guillotine
 */
export function claimMarket({ bid, bids = [], releasedPools = [] }) {
  const won = bids.filter((entry) => entry.outcome === 'won');
  const rivals = bids.filter((entry) => entry.playerId === bid.playerId && entry.outcome === 'lost');
  const window = Math.max(SIMILAR_SPEND.absolute, bid.amount * SIMILAR_SPEND.relative);
  const similar = bids.filter(
    (entry) =>
      !(entry.playerId === bid.playerId && entry.rosterId === bid.rosterId) &&
      Math.abs(entry.amount - bid.amount) <= window,
  );
  const topRival = Math.max(...rivals.map((entry) => entry.amount));
  const pool = releasedPools.find((candidate) => candidate.playerIds.includes(bid.playerId));
  const weekSpend = won.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    weekWinningBids: won.length,
    // 1 is the week's most expensive winning claim; ties share a rank.
    rankAmongWinners: won.filter((entry) => entry.amount > bid.amount).length + 1,
    rivals: rivals.map(({ team, amount }) => ({ team, amount })),
    margin: rivals.length ? bid.amount - topRival : null,
    similarSpend: similar.map(({ player, position, team, amount, outcome }) => ({
      player,
      position,
      team,
      amount,
      outcome,
    })),
    shareOfWeekSpend: weekSpend > 0 ? round3(bid.amount / weekSpend) : null,
    chopRelease: pool ? { week: pool.week, team: pool.team } : null,
  };
}
