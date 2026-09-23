/**
 * What kind of league this is.
 *
 * The scoring rules (superflex, PPR, TE premium) say how points are earned.
 * The *format* says what the season is for, and it changes what coverage even
 * means: a redraft league has no dynasty assets to rank, and a guillotine
 * league has no head-to-head record to recap.
 *
 * Format has to be DECLARED as well as detected. Sleeper reports enough to
 * recognise dynasty and redraft, but a guillotine league is run by manual
 * commissioner action — Sleeper still describes it as an ordinary head-to-head
 * league, and no amount of inspecting the API will reveal otherwise. So a
 * declaration always wins, and detection is the fallback.
 *
 * This module is the taxonomy and nothing else. It knows no provider's field
 * names: detection from Sleeper lives in src/sleeper/normalize.mjs.
 */

/** Every format the publication understands. Adding one starts here. */
export const FORMAT_TYPES = ['dynasty', 'redraft', 'guillotine'];

/** How each format is named in print. */
export const FORMAT_LABELS = {
  dynasty: 'Dynasty',
  redraft: 'Redraft',
  guillotine: 'Guillotine',
};

/** One line on what each format means, for help text and error messages. */
export const FORMAT_DESCRIPTIONS = {
  dynasty: 'Rosters carry between seasons, so future draft picks are real assets.',
  redraft: 'Rosters are torn up and drafted again every season.',
  guillotine: 'No head-to-head record — the lowest scorer each week is eliminated.',
};

/**
 * Formats no API can report, because a human runs them by hand.
 *
 * These exist to explain, in error and help text, why a declaration is needed
 * at all. Detection is never expected to return one of them.
 */
export const UNDETECTABLE_FORMAT_TYPES = ['guillotine'];

/**
 * Formats in which no team ever plays another.
 *
 * Sleeper pairs every league into matchups, including the ones that do not play
 * them, so this is the taxonomy's answer to "are those pairings real?". It is
 * asked by the analysis and by the prompt builder, which is why it lives here
 * rather than as a `=== 'guillotine'` check repeated in both.
 */
export const FORMATS_WITHOUT_MATCHUPS = ['guillotine'];

/** Does this format play head-to-head games at all? */
export function hasMatchups(format) {
  return !FORMATS_WITHOUT_MATCHUPS.includes(format?.type);
}

/** Where a resolved format came from. */
export const FORMAT_SOURCES = ['declared', 'detected'];

/**
 * Reads an operator's declared format, or refuses it.
 *
 * Silently falling back to a default on a typo is the worst outcome available:
 * the run succeeds, the wrong weights are applied, and nothing says so. A
 * misspelling stops the command instead, and the message lists what was meant.
 *
 * An empty or absent value is not a typo — it means "work it out", and returns
 * null so detection can take over.
 */
export function parseDeclaredFormatType(value, { source = 'LEAGUE_FORMAT in .env' } = {}) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (text === '') return null;
  if (FORMAT_TYPES.includes(text)) return text;

  const valid = FORMAT_TYPES.map((type) => `  ${type}  — ${FORMAT_DESCRIPTIONS[type]}`).join('\n');
  throw new Error(
    `${source} is "${String(value).trim()}", which is not a league format.\n\n` +
      `Use one of:\n${valid}\n\n` +
      'Or leave it empty and Fantasy Pressbox will work it out from Sleeper. It can ' +
      `recognise ${FORMAT_TYPES.filter((type) => !UNDETECTABLE_FORMAT_TYPES.includes(type)).join(' and ')}, ` +
      `but never ${UNDETECTABLE_FORMAT_TYPES.join(' or ')} — declare that one yourself.`,
  );
}

/**
 * Settles on one format and records how we got there.
 *
 * `source` matters downstream: doctor can tell a user whether the tool was told
 * this or guessed it, which is the difference between a setting to trust and a
 * setting to check.
 */
export function resolveFormatType({ declared = null, detected = null } = {}) {
  if (declared) return { type: declared, source: 'declared' };
  if (detected) return { type: detected, source: 'detected' };

  // Detection is total — every league Sleeper reports is at least redraft — so
  // arriving here means a caller skipped it, not that a league is unknowable.
  throw new Error(
    'Cannot resolve a league format from nothing: pass a declared type, a detected type, or both.',
  );
}

/** "Dynasty (detected from Sleeper)" — one phrase, used wherever format is shown. */
export function describeFormat(format) {
  if (!format?.type) return 'unknown';
  const label = FORMAT_LABELS[format.type] ?? format.type;
  if (format.source === 'declared') return `${label} (declared)`;
  return `${label} (detected from Sleeper)`;
}
