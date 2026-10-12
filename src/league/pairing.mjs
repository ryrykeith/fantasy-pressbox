/**
 * Head-to-head pairing, provider-neutral.
 *
 * Reads only WeekData rosters (a provider's normalizeWeek): two rosters that
 * share a `pairingKey` are opponents. A roster whose key is null, or whose key
 * is shared by other than exactly two rosters, is unpaired and reported as
 * such rather than silently dropped.
 */

/** Keys in ascending order: numerically when both are numbers, as text otherwise. */
function compareKeys(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * @param rosters WeekData rosters, in the order the provider reported them
 * @returns `{ games: [{ pairingKey, sides: [roster, roster] }], unpaired: roster[] }`.
 *          Games are in ascending key order. Unpaired lists the null-key rosters
 *          in the order given, then those of each key without exactly two sides,
 *          in key order.
 */
export function pairOnKey(rosters) {
  const groups = new Map();
  const unpaired = [];

  for (const roster of rosters || []) {
    const key = roster.pairingKey;
    if (key === null || key === undefined) {
      unpaired.push(roster);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(roster);
  }

  const games = [];
  for (const [pairingKey, sides] of [...groups.entries()].sort((a, b) => compareKeys(a[0], b[0]))) {
    if (sides.length !== 2) {
      unpaired.push(...sides);
      continue;
    }
    games.push({ pairingKey, sides });
  }

  return { games, unpaired };
}
