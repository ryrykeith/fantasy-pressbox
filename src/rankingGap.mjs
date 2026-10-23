/**
 * How far back the ranking a new edition measures movement from is.
 *
 * store.loadPreviousRankings returns the newest recorded ranking before a
 * week however old it is, falling back to the preseason edition. When weeks
 * went by with no ranking recorded, the arrows measure several weeks of
 * movement, and everything that describes them (the CLI's line, the prompt
 * context, doctor) has to say so rather than call that ranking last week's.
 *
 * Browser-safe: nothing here imports from `node:`.
 */

/**
 * The week a recorded ranking ranks the league after: its own `week`, or 0
 * for the preseason edition (filed with `week: null`, before week 1 is played).
 * Null for anything else, such as the season's final ranking.
 */
export function rankedAfterWeek(ranking) {
  if (!ranking) return null;
  if (Number.isInteger(ranking.week)) return ranking.week;
  if (ranking.label === 'preseason') return 0;
  return null;
}

/**
 * The span between `previous` (a recorded ranking) and the edition for
 * `week`: `{ from, weeksSpanned, skippedWeeks }`, where `skippedWeeks` lists
 * every week in between with no ranking recorded. Null when there is no
 * previous ranking, or when its week cannot be placed.
 */
export function rankingGap(previous, week) {
  const from = rankedAfterWeek(previous);
  if (from === null || !Number.isInteger(week) || week <= from) return null;
  const skippedWeeks = [];
  for (let skipped = from + 1; skipped < week; skipped += 1) skippedWeeks.push(skipped);
  return { from, weeksSpanned: week - from, skippedWeeks };
}

/** `[5]` → "week 5", `[5, 6]` → "weeks 5 and 6", `[1, 2, 3]` → "weeks 1, 2 and 3". */
export function describeWeeks(weeks) {
  if (weeks.length === 1) return `week ${weeks[0]}`;
  return `weeks ${weeks.slice(0, -1).join(', ')} and ${weeks[weeks.length - 1]}`;
}

/** "the week 4 rankings" or "the preseason rankings". */
export function describeRankingEdition(from) {
  return from === 0 ? 'the preseason rankings' : `the week ${from} rankings`;
}
