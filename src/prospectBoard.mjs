/**
 * The declared prospect board for a rookie draft class.
 *
 * A board is what lets an edition talk about the prize in a dynasty trade
 * without the model inventing hype. Nobody can derive it: FantasyCalc carries
 * no college players and devy sites have no API and go stale. So it is
 * DECLARED by the operator in config/prospects.<draftYear>.yml, and refreshed
 * a few times a season.
 *
 * Rules this module enforces:
 *   - Every entry carries a source. "The consensus 1.01" may be printed only
 *     because a declared, sourced board says so.
 *   - A prospect not on the board is not discussed. With no board, or for any
 *     name off it, the model gets an `unavailable` entry saying so.
 *   - The board has an `updated` date, so doctor can report its age and warn
 *     when it has gone stale.
 *
 * Nothing here is seeded from anyone's memory: the shipped example uses
 * invented names, and no real ranking lives in the repository. This module
 * reads no files; src/config.mjs loads the file and hands the parsed YAML here.
 */

/** Days after which doctor warns that the board needs refreshing. */
export const PROSPECT_BOARD_STALE_DAYS = 45;

const BOARD_KEYS = ['draftYear', 'updated', 'entries'];
const ENTRY_KEYS = ['rank', 'name', 'position', 'school', 'note', 'source'];
const MS_PER_DAY = 86_400_000;

/** Where a draft class's board is declared, relative to the project root. */
export function prospectBoardFile(draftYear) {
  return `config/prospects.${draftYear}.yml`;
}

function requiredText(where, label, value) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (text === '') throw new Error(`${where}: ${label} is missing.`);
  return text;
}

function unrecognised(where, object, valid) {
  const unknown = Object.keys(object).filter((key) => !valid.includes(key));
  if (unknown.length) {
    throw new Error(`${where}: unrecognised ${unknown.join(', ')}. Valid keys are ${valid.join(', ')}.`);
  }
}

/** YYYY-MM-DD that is a real calendar date; returns it as text. */
function parseUpdated(source, value) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (text === '') {
    throw new Error(`${source}: updated is missing. Say when the board was last checked, as YYYY-MM-DD.`);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${source}: updated is "${text}". Use a real date written YYYY-MM-DD.`);
  }
  return text;
}

function parseEntry(raw, index, source) {
  const where = `${source}, entry ${index + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${where} must have rank, name, position, school and source.`);
  }
  unrecognised(where, raw, ENTRY_KEYS);

  // Named in every later message, so the operator can find the line.
  const name = requiredText(where, 'name', raw.name);
  const named = `${where} (${name})`;
  if (!Number.isInteger(raw.rank) || raw.rank < 1) {
    throw new Error(`${named}: rank is ${raw.rank === undefined ? 'missing' : `"${raw.rank}"`}. Use a whole number from 1.`);
  }
  return {
    rank: raw.rank,
    name,
    position: requiredText(named, 'position', raw.position),
    school: requiredText(named, 'school', raw.school),
    note: raw.note === undefined || raw.note === null || String(raw.note).trim() === '' ? null : String(raw.note).trim(),
    // The whole point of the board: a ranking with no publication behind it is
    // the model's own hype with extra steps.
    source: requiredText(named, 'source (a publication name and/or URL)', raw.source),
  };
}

/**
 * Reads a board, or refuses it.
 *
 * `draftYear` is the class the file was read for; a board whose own draftYear
 * disagrees is a file copied from one year to the next and not updated.
 */
export function parseProspectBoard(value, { draftYear, source = prospectBoardFile(draftYear) } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source}: the board must have draftYear, updated and entries.`);
  }
  unrecognised(source, value, BOARD_KEYS);

  if (value.draftYear === undefined || value.draftYear === null) {
    throw new Error(`${source}: draftYear is missing. It must be ${draftYear}.`);
  }
  if (value.draftYear !== draftYear) {
    throw new Error(`${source}: draftYear is ${value.draftYear}, but this file is for the ${draftYear} class.`);
  }
  const updated = parseUpdated(source, value.updated);

  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    throw new Error(`${source}: entries must be a list of ranked prospects, each with a source.`);
  }
  const entries = value.entries.map((raw, index) => parseEntry(raw, index, source));

  const seen = new Set();
  for (const { rank, name } of entries) {
    if (seen.has(rank)) throw new Error(`${source}: rank ${rank} is used more than once (${name}).`);
    seen.add(rank);
  }

  return { draftYear, updated, entries: entries.sort((a, b) => a.rank - b.rank) };
}

/** Whole days since the board was updated. A board dated in the future counts as 0. */
export function prospectBoardAgeDays(board, now = new Date()) {
  const days = Math.floor((now.getTime() - Date.parse(`${board.updated}T00:00:00Z`)) / MS_PER_DAY);
  return Math.max(0, days);
}

/** The board for doctor: its age and size, with a warning when stale. */
export function describeProspectBoard(board, { draftYear, now = new Date() } = {}) {
  if (!board) {
    return [
      `Prospect board ✗ not declared — create ${prospectBoardFile(draftYear)} ` +
        '(see config/prospects.example.yml) so editions can name the class\'s prospects',
    ];
  }
  const age = prospectBoardAgeDays(board, now);
  const count = `${board.entries.length} prospect${board.entries.length === 1 ? '' : 's'}`;
  const stale = age > PROSPECT_BOARD_STALE_DAYS;
  return [
    `Prospect board ${stale ? '⚠' : '✓'} ${board.draftYear} class, ${count}, ` +
      `updated ${board.updated} (${age} day${age === 1 ? '' : 's'} ago)` +
      (stale ? ` — stale: older than ${PROSPECT_BOARD_STALE_DAYS} days, check it against its sources` : ''),
  ];
}

/** What the prompt context carries: every entry with its source, and the rule for everyone else. */
export function prospectBoardView(board) {
  return {
    draftYear: board.draftYear,
    updated: board.updated,
    rule: 'Discuss only the prospects listed here, and attribute any ranking to the source given.',
    prospects: board.entries.map(({ rank, name, position, school, note, source }) => ({
      rank,
      name,
      position,
      school,
      note,
      source,
    })),
  };
}

/**
 * The `unavailable` entry for prospects: fact and instruction, like every
 * other absence in src/promptContext.mjs. Without a board nothing about the
 * class may be said; with one, only what is on it may be.
 */
export function prospectBoardUnavailable(board, { draftYear }) {
  if (!board) {
    return {
      field: 'prospectBoard',
      why: `No prospect board is declared for the ${draftYear} draft class.`,
      instruction:
        'Do not name, rank or describe any college or rookie prospect, and do not call anyone "the ' +
        'consensus 1.01" or a top pick. Say only that the draft class is unknown here, or leave it out.',
    };
  }
  return {
    field: 'prospectsNotOnBoard',
    why:
      `Only the prospects in \`prospectBoard\` (${board.entries.length} for the ${board.draftYear} class, ` +
      `updated ${board.updated}) are known. Nothing else about the class is.`,
    instruction:
      'A prospect not on the board is not discussed: do not name, rank or describe one, even if you ' +
      'recall them. A prospect on the board may be called a consensus pick or top prospect only as that ' +
      'sourced entry says, naming its source.',
  };
}
