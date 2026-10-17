/**
 * The rivalries an operator declares in config/rivalries.yml.
 *
 * A rivalry is a judgement, not a fact, so it is DECLARED: two teams, an
 * optional name, and an optional one-line note of backstory. Nothing here
 * infers a rivalry from results, and nothing is invented to fill a gap.
 *
 * The names and notes are about real people. They live only in the operator's
 * league folder and in a league file they export; the package ships a
 * commented example with no rivalries in it (config/rivalries.yml).
 *
 * Two steps, split on purpose:
 *   - `parseRivalries` reads the file's text. It needs no league, so a
 *     misspelt key or an over-long note is refused the moment the file is read.
 *   - `resolveRivalries` turns each team into a roster id with the league's
 *     team identity (src/teamIdentity.mjs), the same way guillotine.yml's teams
 *     are resolved, so a renamed team keeps its rivalry. It needs the league's
 *     teams, so prepareEdition runs it (src/edition.mjs), not src/settings.mjs.
 *
 * A refusal names the rivalry by its position and its teams as written. It
 * never repeats the note or the name: they are the part of the file most likely
 * to hold something personal, and a refusal is copied into chats and logs.
 *
 * NODE-FREE: this module imports nothing from `node:`, so the browser core can
 * use it. It reads no files.
 */
import { checkString, shownText } from './lib/safeInput.mjs';
import { parseYaml } from './lib/yaml.mjs';

/** Where the file lives, relative to a league folder. */
export const RIVALRIES_FILE = 'config/rivalries.yml';

/** Limits on the free text, in characters. A name is a title; a note is one line. */
export const RIVALRY_NAME_MAX_LENGTH = 60;
export const RIVALRY_NOTE_MAX_LENGTH = 200;
/** A team written as a name is no longer than any real team name. */
const TEAM_REFERENCE_MAX_LENGTH = 100;

const FILE_KEYS = ['rivalries'];
const ENTRY_KEYS = ['teams', 'name', 'note'];

const refusal = (source, message) => new Error(`${source}: ${message}`);

/** `rivalry 2` — how every refusal points at an entry. */
const entryLabel = (index) => `rivalry ${index + 1}`;

/** A team as written, for a refusal: the text, or the roster id. */
const written = (reference) => (typeof reference === 'number' ? `roster ${reference}` : `"${reference}"`);

function optionalLine(value, { source, index, key, maxLength }) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw refusal(source, `${entryLabel(index)}: ${key} must be text.`);
  }
  // Checked before anything else is said about it, and the refusal carries
  // the field, never the value.
  checkString(value, { file: source, path: ['rivalries', index, key], maxStringLength: maxLength });
  const text = value.trim();
  if (/[\r\n]/.test(text)) throw refusal(source, `${entryLabel(index)}: ${key} must be one line.`);
  return text === '' ? null : text;
}

function teamReference(value, { source, index }) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const text = value.trim();
    if (text.length > TEAM_REFERENCE_MAX_LENGTH) {
      throw refusal(source, `${entryLabel(index)}: a team name is longer than ${TEAM_REFERENCE_MAX_LENGTH} characters.`);
    }
    return text;
  }
  throw refusal(source, `${entryLabel(index)}: each team must be a team name or a roster id.`);
}

/**
 * Reads config/rivalries.yml's text.
 *
 * @param text    the file's text, or null/undefined when the league has none
 * @param source  how a refusal names the file
 * @returns       the declared rivalries, in file order:
 *                `[{ index, teams: [a, b], name, note }]` — `teams` as written
 *                (a name or a roster id), `name` and `note` null when absent.
 *                `[]` when the file is absent or declares none.
 */
export function parseRivalries(text, { source = RIVALRIES_FILE } = {}) {
  if (text === null || text === undefined) return [];
  let parsed;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    throw refusal(source, `could not be read: ${error.message}`);
  }
  return parseRivalryTable(parsed, { source });
}

/**
 * Reads the table config/rivalries.yml parses to — also what a league file
 * carries as `settings.declared.rivalries`. Same result and refusals as
 * parseRivalries.
 */
export function parseRivalryTable(parsed, { source = RIVALRIES_FILE } = {}) {
  if (parsed === null || parsed === undefined) return [];
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw refusal(source, 'must be a table with a `rivalries:` list in it.');
  }
  const unknownKeys = Object.keys(parsed).filter((key) => !FILE_KEYS.includes(key));
  if (unknownKeys.length) {
    // Cut as a whole: a file could spell a message of its own across several short keys.
    throw refusal(source, `unrecognised ${shownText(unknownKeys.join(', '))}. The only key is rivalries.`);
  }
  const list = parsed.rivalries;
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw refusal(source, '`rivalries:` must be a list, one `- teams: [...]` entry per rivalry.');

  return list.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw refusal(source, `${entryLabel(index)} must be a table with teams, and optionally a name and a note.`);
    }
    const unknown = Object.keys(raw).filter((key) => !ENTRY_KEYS.includes(key));
    if (unknown.length) {
      throw refusal(source, `${entryLabel(index)}: unrecognised ${shownText(unknown.join(', '))}. Valid keys are ${ENTRY_KEYS.join(', ')}.`);
    }
    if (typeof raw.teams === 'string' && raw.teams.trim().startsWith('[')) {
      // The reader (src/lib/yaml.mjs) has no flow syntax, so [A, B] arrives as one string.
      throw refusal(source, `${entryLabel(index)}: write teams as a list, one team per line (\`- Team A\`), not in brackets.`);
    }
    if (!Array.isArray(raw.teams) || raw.teams.length !== 2) {
      throw refusal(source, `${entryLabel(index)}: teams must list exactly two teams, one per line.`);
    }
    return {
      index,
      teams: [teamReference(raw.teams[0], { source, index }), teamReference(raw.teams[1], { source, index })],
      name: optionalLine(raw.name, { source, index, key: 'name', maxLength: RIVALRY_NAME_MAX_LENGTH }),
      note: optionalLine(raw.note, { source, index, key: 'note', maxLength: RIVALRY_NOTE_MAX_LENGTH }),
    };
  });
}

/**
 * The declared rivalries as the table config/rivalries.yml and a league file
 * hold, or null when there are none: parseRivalryTable reads back exactly
 * what this returns.
 */
export function rivalryTable(declared) {
  if (!declared.length) return null;
  return {
    rivalries: declared.map(({ teams, name, note }) => ({
      teams: [...teams],
      ...(name === null ? {} : { name }),
      ...(note === null ? {} : { note }),
    })),
  };
}

const orderedPair =(a, b) => (a < b ? [a, b] : [b, a]);

/**
 * Resolves declared rivalries against a league's teams, without throwing.
 *
 * @param declared  parseRivalries' result
 * @param identity  a team identity (createTeamIdentity)
 * @returns `{ rivalries, problems }` — `rivalries` are the entries that
 *   resolved: `{ index, rosterIds: [a, b] (ascending), teams: [now, now],
 *   name, note }`, the teams under the names they go by now. `problems` lists
 *   each entry that did not, `{ index, code, message }` with `code` one of
 *   'unknown-team', 'ambiguous-team', 'same-team', 'duplicate'. A message names
 *   the entry and its teams, never its name or note.
 */
export function checkRivalries(declared, identity) {
  const rivalries = [];
  const problems = [];
  const seen = new Map();
  for (const entry of declared) {
    const label = `${entryLabel(entry.index)} (${entry.teams.map(written).join(' and ')})`;
    const rosterIds = [];
    let failed = false;
    for (const reference of entry.teams) {
      const found = identity.lookup(reference);
      if (found.status === 'found') {
        rosterIds.push(found.rosterId);
        continue;
      }
      failed = true;
      problems.push({
        index: entry.index,
        code: found.status === 'ambiguous' ? 'ambiguous-team' : 'unknown-team',
        message:
          found.status === 'ambiguous'
            ? `${label}: ${written(reference)} has meant more than one team in this league. Use the roster id instead.`
            : `${label}: ${written(reference)} is not a team in this league.`,
      });
    }
    if (failed) continue;
    const [first, second] = orderedPair(rosterIds[0], rosterIds[1]);
    if (first === second) {
      problems.push({ index: entry.index, code: 'same-team', message: `${label}: a rivalry needs two different teams.` });
      continue;
    }
    const key = `${first}:${second}`;
    if (seen.has(key)) {
      problems.push({
        index: entry.index,
        code: 'duplicate',
        message: `${label}: this pair is already declared as ${entryLabel(seen.get(key))}.`,
      });
      continue;
    }
    seen.set(key, entry.index);
    rivalries.push({
      index: entry.index,
      rosterIds: [first, second],
      teams: [identity.currentNameOf(first), identity.currentNameOf(second)],
      name: entry.name,
      note: entry.note,
    });
  }
  return { rivalries, problems };
}

/**
 * Resolves declared rivalries or refuses: the first entry that does not
 * resolve stops the run, because a rivalry quietly dropped would leave a
 * matchup the operator marked as heated written as an ordinary one.
 *
 * @returns the resolved rivalries (see checkRivalries)
 */
export function resolveRivalries(declared, identity, { source = RIVALRIES_FILE } = {}) {
  const { rivalries, problems } = checkRivalries(declared, identity);
  if (problems.length) throw refusal(source, problems[0].message);
  return rivalries;
}
