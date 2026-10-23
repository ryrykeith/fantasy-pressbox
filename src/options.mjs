/**
 * What an edition can be asked for, as data: every edition, and every option
 * that changes how one is built.
 *
 * Two surfaces read these descriptors: the command line builds its `--help`
 * and its argument parser from them (src/cli.mjs), and the website builds its
 * controls from them. A new option therefore cannot reach one surface without
 * the other noticing: tests/options.test.mjs fails if the parser accepts a flag
 * these do not describe, and the website's own test fails if it renders no
 * control for one.
 *
 * Browser-safe: nothing here imports from `node:`.
 */
import { FORMAT_TYPES } from './format.mjs';
import { FORWARD_LOOKING_TASKS, RANKING_TASKS } from './promptContext.mjs';
import { DEFAULT_ESPN_ROUTE, ESPN_ROUTE_KEY, ESPN_ROUTES, RANK_EMOJI_RUN_MODES } from './settings.mjs';
import { TANK_WATCH_EARLY_FLAG, TANK_WATCH_TASK } from './tankWatch.mjs';
import { FUTURE_STOCK_TASK } from './futureStock.mjs';
import { FIVE_YEAR_PLAN_TASK, TEAM_FLAG } from './fiveYearPlan.mjs';

/**
 * The editions whose machine-readable tail can be filed (recordEdition):
 * both previews make a called shot, and every ranking edition files its order.
 * In this order, which is the order `record` lists them in.
 */
export const RECORDABLE_TASKS = Object.freeze(['preview', 'survival-preview', ...RANKING_TASKS]);

const ORDINARY_FORMATS = ['dynasty', 'redraft'];

/**
 * Every edition a league can have.
 *
 * - `name` is the edition (the prompt it builds, src/promptContext.mjs#TASKS).
 * - `command` is the command that builds it, or null for one no command builds
 *   yet (`postseason` can still be recorded from a reply).
 * - `summary` is its line in `--help`; `group` is the block of `--help` it sits in.
 * - `formats` are the league formats that allow it. The refusals that enforce
 *   this (src/edition.mjs, src/tankWatch.mjs, src/futureStock.mjs,
 *   src/fiveYearPlan.mjs) keep their own wording; tests/options.test.mjs checks they agree with this list.
 * - `recordable`: its reply can be filed for next week (RECORDABLE_TASKS).
 * - `forwardLooking`: it is about the week about to be played, not the one
 *   that just finished.
 */
const EDITION_LIST = [
  { name: 'preview', command: 'preview', group: 'weekly', formats: ORDINARY_FORMATS, summary: 'Build the weekly matchup previews' },
  { name: 'recap', command: 'recap', group: 'weekly', formats: ORDINARY_FORMATS, summary: 'Build the weekly recap and awards' },
  { name: 'rankings', command: 'rankings', group: 'weekly', formats: ORDINARY_FORMATS, summary: 'Build the weekly power rankings' },
  {
    name: 'trade-report',
    command: 'transactions',
    group: 'weekly',
    formats: FORMAT_TYPES,
    summary: "Grade the week's trades (quiet weeks are skipped)",
  },
  {
    name: 'preseason-rankings',
    command: 'preseason-rankings',
    group: 'weekly',
    formats: ORDINARY_FORMATS,
    summary: 'Build preseason rankings (ignores all results)',
  },
  {
    name: TANK_WATCH_TASK,
    command: TANK_WATCH_TASK,
    group: 'dynasty',
    formats: ['dynasty'],
    summary: 'Build the rookie draft tank watch (dynasty leagues, second half)',
  },
  {
    name: FUTURE_STOCK_TASK,
    command: FUTURE_STOCK_TASK,
    group: 'dynasty',
    formats: ['dynasty'],
    summary: 'Rank teams on the next three seasons: age, production, picks (dynasty leagues)',
  },
  {
    name: FIVE_YEAR_PLAN_TASK,
    command: FIVE_YEAR_PLAN_TASK,
    group: 'dynasty',
    formats: ['dynasty'],
    summary: "Plan one team's next five seasons, chosen with --team (dynasty leagues)",
  },
  {
    name: 'survival-preview',
    command: 'survival-preview',
    group: 'guillotine',
    formats: ['guillotine'],
    summary: 'Build the weekly survival preview (guillotine leagues)',
  },
  {
    name: 'chop-recap',
    command: 'chop-recap',
    group: 'guillotine',
    formats: ['guillotine'],
    summary: 'Build the weekly chop recap and awards (guillotine leagues)',
  },
  {
    name: 'survival-rankings',
    command: 'survival-rankings',
    group: 'guillotine',
    formats: ['guillotine'],
    summary: 'Build the weekly survival rankings (guillotine leagues)',
  },
  {
    name: 'postseason',
    command: null,
    group: null,
    formats: ORDINARY_FORMATS,
    summary: 'The final power rankings, recorded from a reply (no command builds it yet)',
  },
];

export const EDITIONS = Object.freeze(
  EDITION_LIST.map((edition) =>
    Object.freeze({
      ...edition,
      formats: Object.freeze([...edition.formats]),
      recordable: RECORDABLE_TASKS.includes(edition.name),
      forwardLooking: FORWARD_LOOKING_TASKS.includes(edition.name),
    }),
  ),
);

/**
 * The editions of a league's weekly routine, in the order they are run: the
 * preview before the games, then the recap and the rankings after them. A
 * guillotine league plays no matchups, so it gets its own three. `weeklyRoutine`
 * (src/welcome.mjs) prints this order and inspectLeague (src/inspect.mjs)
 * reports against it, so the two cannot disagree.
 */
export function weeklyEditions(formatType = null) {
  const names =
    formatType === 'guillotine'
      ? ['survival-preview', 'chop-recap', 'survival-rankings']
      : ['preview', 'recap', 'rankings'];
  return names.map((task, index) => ({
    task,
    when: index === 0 ? 'before-games' : 'after-games',
    recordable: RECORDABLE_TASKS.includes(task),
  }));
}

/** The edition named `name`, or null. */
export const editionNamed = (name) => EDITIONS.find((edition) => edition.name === name) ?? null;

/** The edition a command builds, or null for a command that builds none. */
export const editionForCommand = (command) =>
  (command && EDITIONS.find((edition) => edition.command === command)) || null;

/** Every edition a command builds, by name. */
const BUILT_EDITIONS = EDITIONS.filter((edition) => edition.command).map((edition) => edition.name);

/**
 * Every option that changes what an edition does, plus the command line's own.
 *
 * - `name` is the key the option arrives under (`parseArgs` output, and the
 *   `options` prepareEdition takes).
 * - `flag` is how it is typed on the command line, or null for a setting
 *   that is read from the league folder rather than typed (ESPN_ROUTE).
 * - `kind`: 'boolean' (present or not), 'integer' or 'text' (takes a value).
 * - `value` is the placeholder `--help` shows after the flag; `values` the
 *   allowed values, when there is a fixed list; `default` the value when it
 *   is not given (null: worked out, or off).
 * - `help` is its `--help` line (an array continues it on further lines).
 * - `editions` are the editions it changes; `commands` the other commands
 *   that read it.
 * - `cliOnly` is why only the command line offers it, when it does. The
 *   website renders a control for every option that changes an edition and
 *   is not CLI-only. `cliOnlyValues` does the same for single values of an
 *   option the website otherwise has.
 */
const OPTION_LIST = [
  {
    name: 'week',
    flag: '--week',
    kind: 'integer',
    value: '<n>',
    values: null,
    default: null,
    help: 'Which week to work on (default: worked out from Sleeper)',
    editions: BUILT_EDITIONS,
    commands: ['record', 'grade', 'fetch', 'import-espn'],
  },
  {
    name: 'through',
    flag: '--through',
    kind: 'integer',
    value: '<n>',
    values: null,
    default: null,
    help: ['The last week catch-up saves', '(default: the last completed week)'],
    missing: '--through needs a week number, e.g. --through 5',
    editions: [],
    commands: ['catch-up'],
    cliOnly: 'a command that writes to the league folder; the website holds its league in the page',
  },
  {
    name: 'format',
    flag: '--format',
    kind: 'text',
    values: ['sleeper', 'imessage'],
    default: 'sleeper',
    help: 'Who the output is for (default: sleeper)',
    editions: BUILT_EDITIONS,
    commands: [],
  },
  {
    name: 'emoji',
    flag: '--emoji',
    kind: 'text',
    values: RANK_EMOJI_RUN_MODES,
    default: null,
    help: ["Rank emoji for this run: the shipped table or none", "(default: the league's setting)"],
    editions: BUILT_EDITIONS,
    commands: [],
  },
  {
    name: 'task',
    flag: '--task',
    kind: 'text',
    value: '<name>',
    values: RECORDABLE_TASKS,
    default: null,
    help: 'Which edition a recorded file is (used with record)',
    editions: [],
    commands: ['record'],
  },
  {
    name: 'generate',
    flag: '--generate',
    kind: 'boolean',
    default: false,
    help: 'Call the AI provider in .env and write finished posts',
    editions: BUILT_EDITIONS,
    commands: [],
    cliOnly: 'the website never calls an AI: it builds the prompt, and the operator pastes it into a chat',
  },
  {
    name: 'refreshPlayers',
    flag: '--refresh-players',
    kind: 'boolean',
    default: false,
    help: 'Re-download the NFL player list instead of using the cache',
    editions: BUILT_EDITIONS,
    commands: ['fetch', 'catch-up'],
  },
  {
    name: 'refreshMarket',
    flag: '--refresh-market',
    kind: 'boolean',
    default: false,
    help: "Fetch trade values again instead of reusing the week's saved ones",
    editions: ['trade-report', FUTURE_STOCK_TASK, FIVE_YEAR_PLAN_TASK],
    commands: [],
  },
  {
    name: 'early',
    flag: TANK_WATCH_EARLY_FLAG,
    kind: 'boolean',
    default: false,
    help: 'Run the tank watch before its start week',
    editions: [TANK_WATCH_TASK],
    commands: [],
  },
  {
    name: 'team',
    flag: TEAM_FLAG,
    kind: 'text',
    value: '<name|id>',
    values: null,
    default: null,
    help: 'Which team a five-year plan is about: its name or roster id',
    missing: `${TEAM_FLAG} needs a team name or roster id, e.g. ${TEAM_FLAG} 3`,
    editions: [FIVE_YEAR_PLAN_TASK],
    commands: [],
  },
  {
    name: 'workspace',
    flag: '--workspace',
    kind: 'text',
    value: '<folder>',
    values: null,
    default: null,
    // The variable is src/config.mjs#WORKSPACE_ENV_VAR (tests/options.test.mjs keeps them the same).
    help: ['The league folder: its .env, config, data and output', '(default: $PRESSBOX_WORKSPACE, else the current folder)'],
    missing: '--workspace needs a folder, e.g. --workspace ~/leagues/my-league',
    editions: [],
    commands: [],
    cliOnly: 'a league folder is a place on disk; the website holds its league in the page',
  },
  {
    name: 'help',
    flag: '--help',
    aliases: ['-h'],
    kind: 'boolean',
    default: false,
    help: 'Show this message',
    editions: [],
    commands: [],
    cliOnly: "the command line's own help",
  },
  {
    name: 'espnRoute',
    flag: null,
    setting: ESPN_ROUTE_KEY,
    kind: 'text',
    values: ESPN_ROUTES,
    default: DEFAULT_ESPN_ROUTE,
    help: 'How an ESPN league arrives: pages saved in a browser (import) or the opt-in cookie fetch',
    editions: BUILT_EDITIONS,
    commands: ['fetch', 'import-espn', 'doctor'],
    cliOnlyValues: {
      fetch:
        "the cookie fetch is automated access to ESPN you opted into under ESPN's terms, with your ESPN_S2 and " +
        'ESPN_SWID cookies, and only the command line makes it',
    },
  },
];

export const OPTIONS = Object.freeze(
  OPTION_LIST.map((option) =>
    Object.freeze({
      aliases: [],
      cliOnly: null,
      cliOnlyValues: null,
      setting: null,
      ...option,
      values: option.values ? Object.freeze([...option.values]) : null,
      editions: Object.freeze([...option.editions]),
      commands: Object.freeze([...option.commands]),
    }),
  ),
);

/** The option named `name`, or null. */
export const optionNamed = (name) => OPTIONS.find((option) => option.name === name) ?? null;

/** How the option reads in `--help`: its flag and what follows it. */
export function optionUsage(option) {
  if (option.kind === 'boolean') return option.flag;
  const placeholder = option.value ?? `<${option.values.join('|')}>`;
  return `${option.flag} ${placeholder}`;
}

/** `"sleeper" or "imessage"` — an option's allowed values, as a refusal names them. */
export const quotedValues = (values) =>
  values.length > 1
    ? `${values.slice(0, -1).map((value) => `"${value}"`).join(', ')} or "${values.at(-1)}"`
    : `"${values[0]}"`;

/**
 * The command line, read against OPTIONS: `{ _: [positional...], <name>: value }`.
 *
 * Only a flag OPTIONS describes is accepted; anything else starting with `--`
 * is refused. A boolean option is true when present. A value is the next
 * token: an integer one is read with parseInt (a missing or non-numeric week
 * is NaN, which the commands then refuse or ignore as before), and an option
 * with a `missing` message refuses an absent value, or another flag in its
 * place, with that message.
 */
export function parseArgs(argv, { options = OPTIONS } = {}) {
  const byToken = new Map();
  for (const option of options) {
    if (!option.flag) continue;
    byToken.set(option.flag, option);
    for (const alias of option.aliases ?? []) byToken.set(alias, option);
  }
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const option = byToken.get(token);
    if (!option) {
      if (token.startsWith('--')) throw new Error(`Unknown option "${token}". Try --help.`);
      args._.push(token);
      continue;
    }
    if (option.kind === 'boolean') {
      args[option.name] = true;
      continue;
    }
    const value = argv[++i];
    if (option.missing && (!value || value.startsWith('--'))) throw new Error(option.missing);
    args[option.name] = option.kind === 'integer' ? Number.parseInt(value, 10) : value;
  }
  return args;
}

/**
 * The options an edition reads, from `args` (parseArgs output, or the
 * website's controls): only the options OPTIONS names for that edition, so
 * nothing undescribed reaches prepareEdition.
 */
export function editionOptions(task, args = {}) {
  const options = {};
  for (const option of OPTIONS) {
    if (!option.flag || !option.editions.includes(task)) continue;
    if (args[option.name] !== undefined) options[option.name] = args[option.name];
  }
  return options;
}
