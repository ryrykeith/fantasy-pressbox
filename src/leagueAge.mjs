/**
 * How a league's age is put into words, for the operator (init, doctor) and
 * for the first-edition note (src/promptContext.mjs). The age itself comes
 * from src/pipeline.mjs#readLeagueHistory, or the provider's
 * lookupLeagueHistory at setup.
 *
 * Browser-safe: no `node:` imports.
 */

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`;
}

/**
 * One sentence on how long the league has run: "Sleeper says this league
 * started in 2023: 2026 is its 4th season." `by` names who says so;
 * `firstSeason` and `season` are years.
 */
export function describeLeagueAge({ firstSeason, season, by }) {
  const seasonNumber = season - firstSeason + 1;
  if (seasonNumber <= 1) return `${by} says ${season} is this league's first season.`;
  return `${by} says this league started in ${firstSeason}: ${season} is its ${ordinal(seasonNumber)} season.`;
}
