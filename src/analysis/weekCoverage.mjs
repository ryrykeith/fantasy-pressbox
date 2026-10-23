/**
 * Which weeks of a range have nothing saved, for the facts that are labelled
 * "through week N" but are built only from the weeks on disk.
 *
 * Pure: it takes the weeks that are on file and says which are not.
 */

/**
 * The weeks from `from` to `through` (inclusive) that are not in `present`.
 *
 * @param present  week numbers that have saved data
 * @returns ascending week numbers; empty when every week in the range is saved
 */
export function missingWeeksIn({ present, through, from = 1 }) {
  if (!Number.isInteger(through) || !Number.isInteger(from)) return [];
  const have = new Set(present);
  const missing = [];
  for (let week = from; week <= through; week += 1) {
    if (!have.has(week)) missing.push(week);
  }
  return missing;
}
