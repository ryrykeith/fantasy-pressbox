/**
 * Future draft capital across the drafts that can still be traded: every pick
 * each team holds, priced, summed per season and across the horizon.
 *
 * Picks are valued, not counted. A count treats a 1st the same as a 5th, so
 * each held pick is priced from the week's FantasyCalc snapshot
 * (src/pipeline.mjs#readMarketValues):
 *
 *   - the draft this season's standings decide, when the league declares its
 *     order: the Early/Mid/Late value for the third of the round the pick is
 *     projected into (src/analysis/draftOrder.mjs). `basis: 'projected_tier'`,
 *     an estimate that moves with the standings until `projectedDraft.status`
 *     is 'actual'.
 *   - every other pick: the generic value for its round. `basis: 'generic'`.
 *   - a pick the market does not list (a 5th round, a season FantasyCalc does
 *     not price): `value: null`, `basis: 'unpriced'`. Never an invented value,
 *     and never summed as zero without being counted in `unpricedPicks`.
 *
 * The figure teams compare on is `netValue`: what a team holds minus what its
 * own picks are worth at the same prices, wherever they are now. A league with
 * no traded picks is zero for everyone, and the league's net always sums to
 * zero, because picks only change hands.
 *
 * Ownership comes in already normalized (src/sleeper/normalize.mjs#
 * futurePickOwnership, which starts every team with its own picks because
 * Sleeper lists only the picks that moved). Facts only: how much capital is
 * worth to a forward-looking ranking is the prompt's judgement.
 */
import { pickNumber, positionInRound } from './draftOrder.mjs';

/** FantasyCalc's three tiers, by the third of the round a pick falls in. */
export function pickTier(position, teamCount) {
  if (position <= teamCount / 3) return 'Early';
  if (position <= (teamCount * 2) / 3) return 'Mid';
  return 'Late';
}

/**
 * The drafts worth a column: every season a future pick has moved in, every
 * season the market prices, and always the draft this season's standings
 * decide. A season with neither trades nor prices would show every team its
 * own picks and no value, which says nothing.
 */
export function pickCapitalSeasons({ tradedSeasons = [], pricedSeasons = [], nextDraft }) {
  return [...new Set([...tradedSeasons, ...pricedSeasons, nextDraft].map(String))].sort();
}

/**
 * One pick's price.
 *
 * @param pick       { season, round, originalRosterId }
 * @param market     a market snapshot ({ picks }), or null
 * @param draftOrder src/analysis/draftOrder.mjs#projectDraftOrder, or null
 * @returns {{ projectedPick?, tier?, value: number|null, basis: 'projected_tier'|'generic'|'unpriced' }}
 */
export function pickPrice(pick, { market, draftOrder }) {
  const priced = market?.picks?.[`${pick.season}-${pick.round}`];
  const placement = projectedPlacement(pick, draftOrder);
  const tierValue = placement ? priced?.tiers?.[placement.tier] : undefined;
  if (Number.isFinite(tierValue)) return { ...placement, value: tierValue, basis: 'projected_tier' };
  if (Number.isFinite(priced?.generic)) return { ...placement, value: priced.generic, basis: 'generic' };
  return { ...placement, value: null, basis: 'unpriced' };
}

/** Where a pick of the projected draft lands, or null when that is not known. */
function projectedPlacement(pick, draftOrder) {
  if (!draftOrder || String(pick.season) !== draftOrder.draftSeason) return null;
  const slot = draftOrder.slots.find((entry) => entry.originalRosterId === pick.originalRosterId);
  if (!slot) return null;
  const numbering = { teamCount: draftOrder.slots.length, roundOrder: draftOrder.roundOrder ?? null };
  const position = positionInRound(pick.round, slot.slot, numbering);
  if (position === null) return null;
  return { projectedPick: pickNumber(pick.round, slot.slot, numbering), tier: pickTier(position, numbering.teamCount) };
}

/** Sum of the priced values, or null when there is no market to price from. */
const sumValues = (priced, hasMarket) =>
  hasMarket ? priced.reduce((total, pick) => total + (pick.value ?? 0), 0) : null;

const minus = (a, b) => (a === null || b === null ? null : a - b);

/**
 * @param teams      normalized teams ({ rosterId, name })
 * @param seasons    pickCapitalSeasons
 * @param picks      futurePickOwnership for every season in `seasons`
 * @param market     readMarketValues' snapshot, `{ unavailable }`, or null
 * @param draftOrder projectDraftOrder for the draft the standings decide, or null
 */
export function buildPickCapital({ teams, seasons, picks, market = null, draftOrder = null }) {
  const hasMarket = Boolean(market?.picks);
  const name = new Map(teams.map((team) => [team.rosterId, team.name]));
  const teamName = (rosterId) => name.get(rosterId) ?? `Roster ${rosterId}`;
  const order = new Map(teams.map((team, index) => [team.rosterId, index]));
  const at = (rosterId) => order.get(rosterId) ?? Number.MAX_SAFE_INTEGER;

  const priced = picks
    .filter((pick) => seasons.includes(String(pick.season)))
    .map((pick) => ({ ...pick, price: pickPrice(pick, { market: hasMarket ? market : null, draftOrder }) }));

  const rows = teams.map((team) => {
    const seasonRows = seasons.map((season) => {
      const inSeason = priced.filter((pick) => String(pick.season) === season);
      const held = inSeason
        .filter((pick) => pick.ownerRosterId === team.rosterId)
        .sort((a, b) => a.round - b.round || at(a.originalRosterId) - at(b.originalRosterId));
      const own = inSeason.filter((pick) => pick.originalRosterId === team.rosterId);
      const value = sumValues(held.map((pick) => pick.price), hasMarket);
      const ownValue = sumValues(own.map((pick) => pick.price), hasMarket);
      return {
        season,
        picksHeld: held.length,
        baseline: own.length,
        netPicks: held.length - own.length,
        value,
        ownValue,
        netValue: minus(value, ownValue),
        unpricedPicks: held.filter((pick) => pick.price.value === null).length,
        picks: held.map((pick) => ({
          round: pick.round,
          // The id travels beside the name so a view can project the pick
          // (src/tradePicks.mjs#pickProjection) without matching on names.
          originalRosterId: pick.originalRosterId,
          originalTeam: teamName(pick.originalRosterId),
          ...pick.price,
        })),
      };
    });

    const total = (field) =>
      seasonRows.some((row) => row[field] === null) ? null : seasonRows.reduce((sum, row) => sum + row[field], 0);
    return {
      rosterId: team.rosterId,
      team: team.name,
      horizon: {
        picksHeld: total('picksHeld'),
        baseline: total('baseline'),
        netPicks: total('netPicks'),
        value: total('value'),
        ownValue: total('ownValue'),
        netValue: total('netValue'),
        unpricedPicks: total('unpricedPicks'),
      },
      seasons: seasonRows,
    };
  });

  return {
    seasons,
    valueSource: hasMarket
      ? { source: market.source ?? null, label: market.label ?? null, week: market.week ?? null, fetchedAt: market.fetchedAt ?? null }
      : null,
    marketUnavailable: hasMarket ? null : (market?.unavailable ?? null),
    projectedDraft: draftOrder ? { season: draftOrder.draftSeason, status: draftOrder.status } : null,
    teams: rows,
  };
}
