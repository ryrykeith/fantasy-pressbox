/**
 * What init asks and what it writes, without the asking.
 *
 * setup.mjs owns the terminal: the questions, their wording and the order they
 * come in. This module owns everything that can be decided without a person
 * at the keyboard — the choices offered, how an answer is read, and the files
 * written from the answers — so it can be tested directly.
 *
 * One rule runs through it: init can never write a file that fails at load.
 * Every answer is read with the parser src/config.mjs reads the same setting
 * with (parseDeclaredFormatType, parseDeclaredDraftOrder,
 * parseDeclaredRoundOrder, parseTankWatchStartWeek), and the rookie draft file
 * is read back through parseYaml and those parsers before it is returned.
 *
 * Paths and wording only. Which folder is the package is src/config.mjs's
 * business; nothing here reaches Sleeper.
 */
import { join } from 'node:path';
import { parseYaml } from './lib/yaml.mjs';
import { FORMAT_TYPES, parseDeclaredFormatType } from './format.mjs';
import { draftOrderInWords, parseDeclaredDraftOrder, parseDeclaredRoundOrder } from './rookieDraft.mjs';
import { parseTankWatchStartWeek } from './tankWatch.mjs';

/** Accepts a bare league ID or a whole pasted Sleeper address. Empty when there is none. */
export function extractLeagueId(input) {
  const match = /(\d{6,})/.exec(input ?? '');
  return match ? match[1] : '';
}

/**
 * The folder a league's workspace is offered at when init is run from the
 * package itself: ~/leagues/<league name>, in lower case with dashes.
 */
export function defaultLeagueFolder({ home, leagueName }) {
  const slug = String(leagueName ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return join(home, 'leagues', slug || 'my-league');
}

/** A typed folder, with a leading ~ meaning the home folder, as a shell would read it. */
export function expandHome(path, home) {
  const text = String(path ?? '').trim();
  if (text === '~') return home;
  if (text.startsWith('~/')) return join(home, text.slice(2));
  return text;
}

/* ----------------------------------------------------------------- format */

/**
 * What each format is called in the question.
 *
 * Written for the person whose league it is, in the words their league uses.
 * Guillotine matters most: Sleeper cannot report it, so this question is the
 * only way a chopped league is ever covered as one, and its manager has to
 * recognise their league here under whatever name they know it by.
 */
const FORMAT_CHOICE_LABELS = {
  dynasty: 'Dynasty — you keep your players from season to season, and trade future draft picks',
  redraft: 'Redraft — everyone drafts a new team every season, and plays a head-to-head matchup each week',
  guillotine:
    'Guillotine (also called chopped or elimination) — no head-to-head matchups: the lowest scorer each ' +
    'week is eliminated and their players go to waivers',
};

/**
 * The format choices, with Sleeper's reading and the current declaration
 * marked. Sleeper never reports guillotine (src/sleeper/normalize.mjs), so that
 * option is never marked as detected: choosing it is always a declaration.
 */
export function formatChoices({ detectedType, currentType = null }) {
  return FORMAT_TYPES.map((type) => {
    const marks = [];
    if (type === detectedType) marks.push('what Sleeper reports');
    if (type === currentType) marks.push('current');
    const suffix = marks.length ? ` (${marks.join(', ')})` : '';
    return { value: type, label: `${FORMAT_CHOICE_LABELS[type]}${suffix}` };
  });
}

/**
 * The format offered first: the one already declared in this workspace's .env
 * when it is a real format, otherwise Sleeper's reading. A declaration that no
 * longer parses is not offered, so the question replaces it with a valid one.
 */
export function defaultFormatType({ detectedType, existing }) {
  const declared = String(existing ?? '').trim().toLowerCase();
  return FORMAT_TYPES.includes(declared) ? parseDeclaredFormatType(declared) : detectedType;
}

/* ------------------------------------------------------- rookie draft order */

const byGroups = (...groups) => groups.map(([teams, sort, direction]) => ({ teams, sort, direction }));

/**
 * The common ways a rookie draft is ordered, offered as choices.
 *
 * Each is a rule in exactly the shape config/rookie-draft.yml declares, so a
 * choice writes nothing init has not already read with parseDeclaredDraftOrder.
 * The first is the most informative and is the operator's own league: the
 * teams that miss the playoffs pick first, each group by max points-for, so a
 * team cannot tank its way to a better pick by benching its players.
 *
 * A lottery is not offered as a choice: no lottery can be projected as one
 * order, so a league with one is pointed at the file instead.
 */
export const DRAFT_ORDER_PRESETS = [
  {
    key: 'non-playoff-max-points-for',
    label:
      'Teams that miss the playoffs pick first, then the playoff teams — each group by max points-for, lowest first',
    order: byGroups(['non_playoff', 'max_points_for', 'ascending'], ['playoff', 'max_points_for', 'ascending']),
  },
  {
    key: 'non-playoff-record',
    label: 'Teams that miss the playoffs pick first, then the playoff teams — each group by record, worst first',
    order: byGroups(['non_playoff', 'record', 'ascending'], ['playoff', 'record', 'ascending']),
  },
  {
    key: 'non-playoff-points-for',
    label:
      'Teams that miss the playoffs pick first, then the playoff teams — each group by points scored, lowest first',
    order: byGroups(['non_playoff', 'points_for', 'ascending'], ['playoff', 'points_for', 'ascending']),
  },
  {
    key: 'all-record',
    label: 'Every team by record, worst first, playoffs or not',
    order: byGroups(['all', 'record', 'ascending']),
  },
  {
    key: 'all-max-points-for',
    label: 'Every team by max points-for, lowest first, playoffs or not',
    order: byGroups(['all', 'max_points_for', 'ascending']),
  },
];

/** The preset a declared rule is, or null when it is none of them. */
export function presetForOrder(rule) {
  if (!rule) return null;
  const wanted = JSON.stringify(rule.groups);
  return DRAFT_ORDER_PRESETS.find((preset) => JSON.stringify(preset.order) === wanted) ?? null;
}

/** The rule in the words doctor uses, for showing a choice back before it is written. */
export function describeOrderChoice(order, league = {}) {
  return draftOrderInWords(parseDeclaredDraftOrder(order), league);
}

/** The later-rounds choices, in the order asked. Null leaves `rounds` undeclared. */
export const ROUND_ORDER_CHOICES = [
  { value: 'linear', label: "Linear — every round in round 1's order (1.07, 2.07, 3.07)" },
  { value: 'snake', label: 'Snake — even rounds run in reverse (1.07, then 2.06 in a 12-team draft)' },
  { value: null, label: 'Not sure — leave it for now (only round 1 picks get numbers)' },
];

/**
 * Reads a typed tank watch start week. Empty means "the middle of the regular
 * season"; anything else must be a week number, judged by the same parser the
 * config loader uses. Throws its error, worded for the answer, otherwise.
 */
export function parseStartWeekAnswer(answer) {
  const text = String(answer ?? '').trim();
  if (text === '') return null;
  const value = /^\d+$/.test(text) ? Number.parseInt(text, 10) : text;
  return parseTankWatchStartWeek(value, { source: 'The tank watch start week' });
}

/* -------------------------------------------------------- the files written */

/**
 * Reads a rookie-draft.yml's text the way loadConfig reads the file: parseYaml,
 * then the three parsers. Throws the loader's own error for anything it would
 * refuse.
 */
export function readRookieDraftConfig(text, { source = 'config/rookie-draft.yml' } = {}) {
  const parsed = parseYaml(text) ?? {};
  return {
    order: parseDeclaredDraftOrder(parsed.order ?? null, { source: `order in ${source}` }),
    rounds: parseDeclaredRoundOrder(parsed.rounds, { source: `rounds in ${source}` }),
    startWeek: parseTankWatchStartWeek(parsed.tank_watch?.start_week, {
      source: `tank_watch.start_week in ${source}`,
    }),
  };
}

const ORDER_EXAMPLE = [
  '# order:',
  '#   - teams: non_playoff',
  '#     sort: max_points_for',
  '#     direction: ascending',
  '#   - teams: playoff',
  '#     sort: max_points_for',
  '#     direction: ascending',
];

/**
 * A league's config/rookie-draft.yml, from init's answers.
 *
 * `order` is a list of groups (a preset's `order`) or null to leave the rule
 * undeclared; `rounds` is linear, snake or null; `startWeek` a week number or
 * null. The text is read back through readRookieDraftConfig before it is
 * returned, and anything that does not come back exactly as it was given is
 * refused — so a file init writes always loads, and always says what was meant.
 */
export function renderRookieDraftConfig({ leagueName = null, order = null, rounds = null, startWeek = null } = {}) {
  const lines = [
    '# ============================================================================',
    `# Rookie draft settings${leagueName ? ` for ${leagueName}` : ''} — written by init.`,
    '# ============================================================================',
    '#',
    '# Sleeper does not report how a rookie draft is ordered, so it is written down',
    '# here. Until it is, no pick is projected to a slot. The README explains every',
    '# value, under "config/rookie-draft.yml — how the rookie draft is ordered".',
    '#',
    '#   teams:      non_playoff | playoff | all',
    '#   sort:       max_points_for | points_for | record',
    '#               (lottery is recognised, but cannot be projected yet)',
    '#   direction:  ascending (lowest first) | descending',
    '#',
    '# Run doctor after editing to see the rule in plain words.',
    '',
  ];

  if (order) {
    lines.push('order:');
    for (const group of order) {
      lines.push(`  - teams: ${group.teams}`, `    sort: ${group.sort}`);
      if (group.direction) lines.push(`    direction: ${group.direction}`);
    }
  } else {
    lines.push('# No rule declared yet. For example:', ...ORDER_EXAMPLE);
  }

  lines.push(
    '',
    '# Rounds after the first: linear (every round in round 1\'s order) or snake',
    '# (even rounds reversed). Empty: only round 1 picks get numbers.',
    `rounds:${rounds ? ` ${rounds}` : ''}`,
    '',
    '# The first completed week the tank watch covers. Empty: the middle of the',
    '# regular season.',
    'tank_watch:',
    `  start_week:${startWeek ? ` ${startWeek}` : ''}`,
    '',
  );
  const text = lines.join('\n');

  const read = readRookieDraftConfig(text);
  const meant = {
    order: order ? parseDeclaredDraftOrder(order) : null,
    rounds: parseDeclaredRoundOrder(rounds),
    startWeek: parseTankWatchStartWeek(startWeek),
  };
  if (JSON.stringify(read) !== JSON.stringify(meant)) {
    throw new Error(
      `The rookie draft settings would not read back as written: meant ${JSON.stringify(meant)}, ` +
        `read ${JSON.stringify(read)}.`,
    );
  }
  return text;
}

/**
 * The lines that make a .env from the package's .env.example: every key the
 * example names is filled in where it stands, so the comments explaining it
 * travel with it, and any key the example does not name is appended.
 */
export function renderEnv(template, values) {
  const remaining = new Set(Object.keys(values));
  const body = template
    .split('\n')
    .map((line) => {
      const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line.trim());
      if (!match) return line;
      const key = match[1];
      if (!(key in values)) return line;
      remaining.delete(key);
      return `${key}=${values[key] ?? ''}`;
    })
    .join('\n');

  const extras = [...remaining].map((key) => `${key}=${values[key] ?? ''}`);
  return extras.length ? `${body}\n${extras.join('\n')}\n` : body;
}
