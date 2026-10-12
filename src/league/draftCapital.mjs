/**
 * Draft capital, provider-neutral.
 *
 * Reads only the normalized shapes: traded picks as { season, round,
 * originalRosterId, ownerRosterId, previousOwnerRosterId } and the league's
 * `season` and `draftStatus` ('pre_draft' | 'drafting' | 'complete'). A
 * provider's normalizer (src/sleeper/) produces them.
 */

/**
 * Has the current season's draft already been held?
 *
 * Matters because a pick for the current season is an asset before the draft
 * and a spent receipt afterwards. A league's first year is a startup draft, so
 * those picks are gone the moment it ends; later years draft rookies only.
 */
export function currentSeasonDrafted(league) {
  return !['pre_draft', 'drafting'].includes(league.draftStatus);
}

/** A pick only counts as capital if its draft has not happened yet. */
export function isFuturePick(pick, league) {
  const season = Number(pick.season);
  const current = Number(league.season);
  if (season > current) return true;
  if (season < current) return false;
  return !currentSeasonDrafted(league);
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (round) => ORDINALS[round] ?? `round ${round}`;

/**
 * Who holds every pick of one season's draft.
 *
 * The traded picks list only the picks that have *moved*, so every team
 * starts owning its own pick in every round and each move is applied on top.
 * In a traded pick, originalRosterId is whose pick it was and ownerRosterId is
 * who holds it now.
 *
 * A moved pick outside the rounds given (an unknown round count is 0) is
 * still reported, so no move is ever dropped for want of a league setting.
 *
 * @returns {{ season: string, round: number, originalRosterId: number, ownerRosterId: number }[]}
 *          round first, then in `rosterIds` order
 */
export function futurePickOwnership({ tradedPicks, rosterIds, roundsPerDraft, season }) {
  const rounds = roundsPerDraft > 0 ? roundsPerDraft : 0;
  const key = (round, rosterId) => `${round}:${rosterId}`;
  const picks = new Map();
  for (let round = 1; round <= rounds; round += 1) {
    for (const rosterId of rosterIds) {
      picks.set(key(round, rosterId), { season: String(season), round, originalRosterId: rosterId, ownerRosterId: rosterId });
    }
  }

  for (const pick of tradedPicks || []) {
    if (String(pick.season) !== String(season)) continue;
    const existing = picks.get(key(pick.round, pick.originalRosterId));
    if (existing) {
      existing.ownerRosterId = pick.ownerRosterId;
    } else {
      picks.set(key(pick.round, pick.originalRosterId), {
        season: String(season),
        round: pick.round,
        originalRosterId: pick.originalRosterId,
        ownerRosterId: pick.ownerRosterId,
      });
    }
  }

  const position = new Map(rosterIds.map((rosterId, index) => [rosterId, index]));
  const at = (rosterId) => position.get(rosterId) ?? Number.MAX_SAFE_INTEGER;
  return [...picks.values()].sort(
    (a, b) => a.round - b.round || at(a.originalRosterId) - at(b.originalRosterId) || a.originalRosterId - b.originalRosterId,
  );
}

/**
 * Net future draft capital per team.
 *
 * A provider only reports picks that have *moved*, so a complete picture means
 * starting every team with one pick per round and applying those moves
 * (futurePickOwnership, which the projected draft order reads too). What
 * the publication actually wants to know is who is hoarding rookie picks and
 * who has mortgaged them.
 */
export function normalizeFutureDraftCapital({ tradedPicks, league, teamsByRosterId, roundsPerDraft }) {
  const future = (tradedPicks || []).filter((pick) => isFuturePick(pick, league));
  if (future.length === 0) return null;

  const rounds = roundsPerDraft > 0 ? roundsPerDraft : 0;
  const name = (rosterId) => teamsByRosterId.get(rosterId)?.name ?? `Roster ${rosterId}`;
  const seasons = [...new Set(future.map((pick) => String(pick.season)))].sort();
  const rosterIds = [...teamsByRosterId.keys()];

  const rows = [];
  for (const season of seasons) {
    const picks = futurePickOwnership({ tradedPicks: future, rosterIds, roundsPerDraft: rounds, season });
    const moved = picks.filter((pick) => pick.ownerRosterId !== pick.originalRosterId);

    for (const rosterId of rosterIds) {
      const gained = moved
        .filter((pick) => pick.ownerRosterId === rosterId)
        .map((pick) => `${name(pick.originalRosterId)} ${ordinal(pick.round)}`);
      const given = moved
        .filter((pick) => pick.originalRosterId === rosterId)
        .map((pick) => `own ${ordinal(pick.round)} to ${name(pick.ownerRosterId)}`);
      if (gained.length === 0 && given.length === 0) continue;
      rows.push({
        team: name(rosterId),
        season,
        picksHeld: rounds + gained.length - given.length,
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
