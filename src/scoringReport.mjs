/**
 * Turns a derived scoring profile (src/sleeper/normalize.mjs#deriveScoringProfile)
 * into the lines doctor prints.
 *
 * Doctor used to print one line — "Superflex, 1 PPR, TE premium +0.5" — which
 * told a user the tool had read *something*, not that it had read the right
 * thing. A manager confirming their own settings needs every resolved fact on
 * its own line: the reception tier, every positional delta (not just
 * premiums — a league that pays receivers less is just as worth confirming),
 * the passing touchdown value, and whether superflex was detected.
 *
 * This module knows nothing about Sleeper's field names, only the profile
 * shape `deriveScoringProfile` already produced.
 */

/** "+0.5" for a positive delta, "-0.25" for a negative one — never "0.5". */
function signed(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * One line per position whose reception rate differs from the league base,
 * in either direction. A position at the base rate says nothing worth
 * confirming, so it is left out rather than padded in as "+0".
 */
function positionalBonusLines(reception) {
  const changed = Object.entries(reception.byPosition).filter(([, { bonus }]) => bonus !== 0);
  if (changed.length === 0) return 'none';
  return changed
    .map(([position, { bonus, perCatch }]) => `${position} ${signed(bonus)} (${perCatch}/catch)`)
    .join(', ');
}

/**
 * The resolved scoring profile, one fact per line, in the terms the
 * acceptance criteria names: reception tier, positional bonuses with deltas,
 * passing TD value, and superflex status.
 */
export function describeScoringSummary(scoring) {
  const { reception, passing, superflex } = scoring;
  return [
    `Reception          ${reception.tier} (${reception.base} per catch)`,
    `Positional bonuses ${positionalBonusLines(reception)}`,
    `Passing TD         ${passing.touchdown ?? 'not set'}`,
    `Superflex          ${superflex ? 'yes' : 'no'}`,
  ];
}

/**
 * Non-default settings this tool has no field for anywhere in the profile —
 * reported under their own heading rather than hidden, so a manager running
 * an unusual rule knows the tool is not accounting for it, instead of
 * assuming silence means it was.
 *
 * Empty when there is nothing to report, so an ordinary league's doctor
 * output stays as short as it already was.
 */
export function describeUnmodelledScoring(scoring) {
  if (!scoring.notModelled || scoring.notModelled.length === 0) return [];

  return [
    'Not modelled       Sleeper settings this tool does not use:',
    ...scoring.notModelled.map(({ key, value, default: fallback }) => {
      const comparison = fallback !== null ? ` (default ${fallback})` : '';
      return `                     ${key}: ${value}${comparison}`;
    }),
  ];
}
