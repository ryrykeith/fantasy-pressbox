/**
 * Transactions as facts a trade or a pickup can be judged on.
 *
 * src/sleeper/normalize.mjs#normalizeTransactions says who moved what. This
 * module adds the context a grade needs, numbers and references only, never
 * prose (src/promptContext.mjs is where a fact becomes an instruction):
 *
 *   roster    each side's positional shape before and after the move, and
 *             whether a player received would start for it. A receiver added
 *             to a team already starting three good ones is a different move
 *             from the same receiver filling a hole.
 *   faab      for a waiver claim, the bid as a share of the league budget and
 *             of what the claimant had left — a raw $22 means nothing without
 *             the budget it came out of.
 *   history   each moved player's points week by week, and which roster
 *             banked them.
 *   scoring   the scoring rules that decide what the moved positions are
 *             worth, so a tight end in a TE-premium league is judged on the
 *             right scale.
 *
 * Everything is "as of the move", not "as of today". Sleeper keeps no roster
 * history, so the roster a move was made with is read from that week's raw
 * matchup entries (normalizeWeekRosters) — today's roster already carries
 * every later move, and grading against it would invent context.
 */
import { normalizePlayer } from '../sleeper/normalize.mjs';
import { bestLineup, eligiblePositions } from './lineup.mjs';

const round1 = (value) => Math.round(value * 10) / 10;
const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Points per rostered game for one player across `weeks`, or null when the
 * player was on no roster in any of them (a free agent until now).
 */
function pointsPerGame(playerId, weeks) {
  const scores = [];
  for (const { rosters } of weeks) {
    for (const roster of rosters) {
      if (!roster.playerIds.includes(playerId)) continue;
      scores.push(roster.playerPoints[playerId] ?? 0);
      break;
    }
  }
  if (scores.length === 0) return null;
  return round1(scores.reduce((sum, points) => sum + points, 0) / scores.length);
}

/**
 * A roster's positional shape against the league's starting slots.
 *
 * `byPosition` counts what is rostered at each position a starting slot can
 * use, beside how many slots are that position's alone. `projectedStarters`
 * is the best legal lineup on points per rostered game before the move — the
 * one place quality enters, and the reason a depth add and a hole filled read
 * differently.
 */
export function positionalShape({ playerIds, startingSlots, players, valueOf }) {
  const startable = new Set(startingSlots.flatMap(eligiblePositions));
  const dedicated = {};
  for (const slot of startingSlots) {
    const positions = eligiblePositions(slot);
    if (positions.length === 1) dedicated[positions[0]] = (dedicated[positions[0]] ?? 0) + 1;
  }

  const roster = playerIds.map((id) => ({ id, player: normalizePlayer(id, players[id]) }));
  const byPosition = {};
  for (const position of startable) {
    byPosition[position] = {
      rostered: roster.filter((entry) => entry.player.position === position).length,
      dedicatedSlots: dedicated[position] ?? 0,
    };
  }

  const { lineup } = bestLineup({
    slots: startingSlots,
    candidates: roster.map((entry) => ({ ...entry, points: valueOf(entry.id) ?? 0 })),
  });

  return {
    byPosition,
    flexSlots: startingSlots.filter((slot) => eligiblePositions(slot).length > 1),
    projectedStarters: lineup.map(({ slot, entry }) =>
      entry
        ? {
            slot,
            id: entry.id,
            name: entry.player.name,
            position: entry.player.position,
            pointsPerGame: valueOf(entry.id),
          }
        : // An empty slot is the loudest need a roster can have; it stays
          // in the list rather than disappearing from it.
          { slot, id: null, name: null, position: null, pointsPerGame: null },
    ),
  };
}

/** Which slot a player holds in a shape's projected lineup, or null if benched. */
const slotIn = (shape, playerId) => shape.projectedStarters.find((starter) => starter.id === playerId)?.slot ?? null;

/**
 * The roster a side made the move with, rebuilt from that week's fielded
 * roster. Removing what it received and restoring what it gave up is right
 * whether the week's entry was saved before the move cleared or after it.
 */
function rosterBefore(fielded, side) {
  const received = new Set(side.received.players.map((p) => p.id));
  const ids = fielded.playerIds.filter((id) => !received.has(id));
  for (const { id } of side.gaveUp.players) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function rosterAfter(before, side) {
  const gaveUp = new Set(side.gaveUp.players.map((p) => p.id));
  return [...before.filter((id) => !gaveUp.has(id)), ...side.received.players.map((p) => p.id)];
}

function sideRoster({ side, week, weeks, startingSlots, players }) {
  const fielded = weeks.find((entry) => entry.week === week)?.rosters.find((r) => r.rosterId === side.rosterId);
  if (!fielded) {
    return {
      roster: null,
      rosterNote:
        `No week ${week} matchup data is on disk for this roster, so its shape at the time of the move ` +
        'is unknown. Fetch that week to fill this in.',
    };
  }

  const priorWeeks = weeks.filter((entry) => entry.week < week);
  const valueOf = (id) => pointsPerGame(id, priorWeeks);
  const shape = (ids) => positionalShape({ playerIds: ids, startingSlots, players, valueOf });
  const beforeIds = rosterBefore(fielded, side);
  const before = shape(beforeIds);
  const after = shape(rosterAfter(beforeIds, side));

  return {
    roster: {
      asOfWeek: week,
      valueBasis:
        priorWeeks.length > 0
          ? `points per rostered game, weeks ${priorWeeks[0].week}–${priorWeeks.at(-1).week}`
          : 'no earlier week on disk; every player is unscored',
      before,
      after,
      received: side.received.players.map(({ id }) => ({ id, startsAfter: slotIn(after, id) })),
      gaveUp: side.gaveUp.players.map(({ id }) => ({ id, startedBefore: slotIn(before, id) })),
    },
  };
}

/** Order transactions the way they cleared. */
function chronological(a, b) {
  return (a.week ?? 0) - (b.week ?? 0) || String(a.completedAt ?? '').localeCompare(String(b.completedAt ?? ''));
}

/**
 * What each roster had left to spend after every transaction it was part of,
 * keyed by transaction id then roster id. Bids spend it; FAAB sent in a trade
 * moves it between rosters.
 */
function faabRemainingAfter(seasonTransactions, waiverBudget) {
  const balance = new Map();
  const after = new Map();
  // A league that never set a budget has no balance to report, not a zero one.
  if (waiverBudget === null || waiverBudget === undefined) return after;
  for (const transaction of [...seasonTransactions].sort(chronological)) {
    const here = new Map();
    for (const side of transaction.sides ?? []) {
      const current = balance.get(side.rosterId) ?? waiverBudget;
      const next = current + side.received.faab - side.gaveUp.faab - (side.waiverBid ?? 0);
      balance.set(side.rosterId, next);
      here.set(side.rosterId, next);
    }
    if (transaction.id !== null) after.set(transaction.id, here);
  }
  return after;
}

function claimCost({ bid, waiverBudget, remainingAfter }) {
  if (waiverBudget === null || waiverBudget === undefined) {
    return { bid, budget: null, shareOfBudget: null, remainingAfter: null, shareOfRemaining: null };
  }
  const hadBefore = remainingAfter === null ? null : remainingAfter + bid;
  return {
    bid,
    budget: waiverBudget,
    shareOfBudget: waiverBudget > 0 ? round3(bid / waiverBudget) : null,
    remainingAfter,
    shareOfRemaining: hadBefore > 0 ? round3(bid / hadBefore) : null,
  };
}

/** Each moved player's week-by-week points, and which roster scored them. */
function playerHistory(transaction, weeks, teamName) {
  const ids = [
    ...new Set(transaction.sides.flatMap((side) => [...side.received.players, ...side.gaveUp.players].map((p) => p.id))),
  ];
  return ids.map((id) => ({
    id,
    weeks: weeks.flatMap(({ week, rosters }) => {
      const roster = rosters.find((r) => r.playerIds.includes(id));
      if (!roster) return [];
      return [
        {
          week,
          rosterId: roster.rosterId,
          team: teamName(roster.rosterId),
          points: roster.playerPoints[id] ?? 0,
          started: roster.starterIds.includes(id),
        },
      ];
    }),
  }));
}

/**
 * The scoring rules that bear on this move: superflex and the reception
 * scale for any position that changed hands, so a premium position is
 * visibly a premium position.
 */
export function scoringContext(scoring, positions) {
  if (!scoring) return null;
  const moved = new Set(positions.filter(Boolean));
  const perCatch = {};
  for (const position of moved) {
    const entry = scoring.reception?.byPosition?.[position];
    if (entry) perCatch[position] = entry.perCatch;
  }
  return {
    superflex: scoring.superflex,
    receptionTier: scoring.reception?.tier ?? null,
    perCatch,
    premiumPositions: (scoring.reception?.premiumPositions ?? []).filter((position) => moved.has(position)),
    ...(moved.has('QB') ? { passing: scoring.passing } : {}),
  };
}

/**
 * @param transactions        normalized transactions to enrich (one week's, usually)
 * @param league              normalized league: startingSlots, waiverBudget, format.scoring
 * @param teams               normalized teams, for display names only
 * @param players             the player file, keyed by id
 * @param weeks               `[{ week, rosters }]` with rosters from
 *                            normalizeWeekRosters, every week on disk — before
 *                            the move for its shape, after it for its history
 * @param seasonTransactions  every normalized transaction this season so far,
 *                            for the FAAB each claimant had left; defaults to
 *                            `transactions` alone
 */
export function enrichTransactions({
  transactions = [],
  league,
  teams = [],
  players = {},
  weeks = [],
  seasonTransactions = null,
}) {
  const names = new Map(teams.map((team) => [team.rosterId, team.name]));
  const teamName = (rosterId) => names.get(rosterId) ?? `Roster ${rosterId}`;
  const ordered = [...weeks].sort((a, b) => a.week - b.week);

  // The week's own transactions are part of the season's ledger even when the
  // caller's season list was loaded before they were.
  const season = [...(seasonTransactions ?? [])];
  const seen = new Set(season.map((t) => t.id).filter((id) => id !== null));
  for (const transaction of transactions) if (transaction.id === null || !seen.has(transaction.id)) season.push(transaction);
  const remaining = faabRemainingAfter(season, league.waiverBudget ?? null);

  return transactions.map((transaction) => {
    const positions = transaction.sides.flatMap((side) =>
      [...side.received.players, ...side.gaveUp.players].map((p) => p.position),
    );
    return {
      ...transaction,
      sides: transaction.sides.map((side) => {
        const enriched = {
          ...side,
          ...sideRoster({
            side,
            week: transaction.week,
            weeks: ordered,
            startingSlots: league.startingSlots ?? [],
            players,
          }),
        };
        if (side.waiverBid !== undefined) {
          enriched.faab = claimCost({
            bid: side.waiverBid,
            waiverBudget: league.waiverBudget ?? null,
            remainingAfter: remaining.get(transaction.id)?.get(side.rosterId) ?? null,
          });
        }
        return enriched;
      }),
      playerHistory: playerHistory(transaction, ordered, teamName),
      scoring: scoringContext(league.format?.scoring, positions),
    };
  });
}
