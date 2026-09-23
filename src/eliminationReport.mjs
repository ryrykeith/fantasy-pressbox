/**
 * Turns an elimination ledger (src/analysis/elimination.mjs) into the lines
 * doctor prints.
 *
 * Doctor is where a guillotine commissioner finds out whether this tool agrees
 * with their league, and the only place the *reliable* path gets advertised.
 * So the report always says which weeks are settled and how — declared or
 * derived — and always nudges toward config/guillotine.yml when there is no
 * declared ledger, because a derivation that happens to be right today is
 * still a derivation.
 *
 * This module knows nothing about Sleeper or about how the ledger was built,
 * only the shape it produced.
 */
import { WEEK_STATUS } from './analysis/elimination.mjs';

/** One line per week, in the terms the ledger settled it. */
function weekLine(record) {
  const prefix = `                     week ${record.week}`;
  switch (record.status) {
    case WEEK_STATUS.ELIMINATED:
      return `${prefix}  ${record.eliminated.team} (${record.eliminated.source})`;
    case WEEK_STATUS.NOT_PLAYED:
      return `${prefix}  not played yet`;
    case WEEK_STATUS.DECIDED:
      return `${prefix}  nothing left to decide`;
    default: {
      const named = record.tiedCandidates
        ? record.tiedCandidates.map((entry) => entry.team).join(' and ')
        : record.candidate?.team;
      const who = named ? `, lowest scorer ${named}` : '';
      return `${prefix}  not resolved — ${record.note}${who}`;
    }
  }
}

/**
 * The ledger, as doctor prints it.
 *
 * Empty for a format with no eliminations, so an ordinary league's doctor
 * output is untouched.
 */
export function describeEliminationLedger(ledger) {
  if (!ledger) return [];

  const lines = [
    `Survivors          ${ledger.survivorCount} of ${ledger.teams.length} ` +
      `(${ledger.eliminatedCount} chopped through week ${ledger.throughWeek})`,
  ];

  if (ledger.survivorCount > 0 && ledger.survivorCount <= 12) {
    lines.push(`                     ${ledger.survivors.map((team) => team.team).join(', ')}`);
  }

  const settled = ledger.weeks.filter((week) => week.status === WEEK_STATUS.ELIMINATED).length;
  const unresolved = ledger.unresolvedWeeks.length;
  lines.push(
    ledger.weeks.length
      ? `Elimination ledger ${settled} week${settled === 1 ? '' : 's'} settled` +
          (unresolved ? `, ${unresolved} not resolved` : '')
      : 'Elimination ledger nothing to report yet',
  );
  for (const record of ledger.weeks) lines.push(weekLine(record));

  if (!ledger.hasDeclaredLedger) {
    lines.push(
      `                     No declared ledger. Every week above was worked out from scores and`,
      `                     roster state, which depends on the commissioner having processed each`,
      `                     chop. Write the weeks down in ${ledger.source} and they stop being a guess.`,
    );
  }

  for (const warning of ledger.warnings) {
    lines.push(`Ledger warning     ✗ ${warning.replace(/\n/g, ' ')}`);
  }

  return lines;
}
