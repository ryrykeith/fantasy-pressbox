/**
 * How Fantasy Pressbox talks someone through starting: the command line to
 * type, the banner init opens with, and the getting-started steps and weekly
 * routine that --help, a bare run and init's last screen all print.
 *
 * Every piece of advice the CLI prints ends in a command to run, so it has to
 * be a command that works for this person, from the folder they will run it
 * in. That depends on how the package got onto their computer — a global
 * install, npx, a project's node_modules, or a clone — not on the league.
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const BIN_NAME = 'fantasy-pressbox';

/** A folder as the person would type it: under their home folder, from `~`. */
export function displayPath(path, home = homedir()) {
  const rel = relative(home, path);
  const shown = rel && !rel.startsWith('..') && !isAbsolute(rel) ? join('~', rel) : path;
  return /\s/.test(shown) ? `"${shown}"` : shown;
}

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Whether `fantasy-pressbox` on PATH runs this package's CLI. */
export function binOnPath({ cliPath, env = process.env, platform = process.platform } = {}) {
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    // npm's Windows shim is a .cmd that calls node itself: its presence is the answer.
    if (platform === 'win32' && existsSync(join(dir, `${BIN_NAME}.cmd`))) return true;
    const candidate = join(dir, BIN_NAME);
    if (existsSync(candidate) && real(candidate) === real(cliPath)) return true;
  }
  return false;
}

/**
 * The command line that runs this CLI, typed from the folder `from`.
 *
 * - Started through npx (`npm exec`): `npx fantasy-pressbox`. The folder npx
 *   put on PATH is gone once it exits, so the bare name would not resolve.
 * - Installed with the bin on PATH (`npm install -g`): `fantasy-pressbox`.
 * - Installed into a project without the bin on PATH: `npx fantasy-pressbox`
 *   from inside that project, where npx finds the local copy; from anywhere
 *   else, node and the full path to the CLI.
 * - A clone of the repository: `node src/cli.mjs` from the clone itself, the
 *   full path from anywhere else.
 */
export function cliCommand({
  packageRoot,
  from = process.cwd(),
  env = process.env,
  platform = process.platform,
  onPath = binOnPath,
} = {}) {
  const cliPath = join(packageRoot, 'src', 'cli.mjs');
  const fullPath = /\s/.test(cliPath) ? `node "${cliPath}"` : `node ${cliPath}`;
  if (env.npm_command === 'exec') return `npx ${BIN_NAME}`;

  const parts = real(packageRoot).split(sep);
  const modulesAt = parts.lastIndexOf('node_modules');
  if (modulesAt === -1) return real(from) === real(packageRoot) ? 'node src/cli.mjs' : fullPath;

  if (onPath({ cliPath, env, platform })) return BIN_NAME;
  const project = parts.slice(0, modulesAt).join(sep) || sep;
  return isInside(project, real(from)) ? `npx ${BIN_NAME}` : fullPath;
}

/** The folder the getting-started steps suggest, before there is one. */
export const EXAMPLE_LEAGUE_FOLDER = join('~', 'leagues', 'my-league');

const TAGLINES = [
  'Your league finally has a beat reporter.',
  'Every take on the record. Every trade graded.',
  'Hold the presses: somebody started a kicker on bye.',
  'Now keeping receipts on your entire league.',
  'All the facts. None of the mercy.',
];

const BOX_WIDTH = 46;

function center(text, width = BOX_WIDTH) {
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left);
}

/**
 * The scoreboard init opens with. Box-drawing characters only, no emoji:
 * terminals disagree about an emoji's width, and the right edge would wander.
 * `title` styles the name (bold in a terminal); `tagline` picks the line under
 * the board, one of TAGLINES at random unless given.
 */
export function banner({ title = (text) => text, tagline } = {}) {
  const line = tagline ?? TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
  return [
    `  ┌${'─'.repeat(BOX_WIDTH)}┐`,
    `  │${title(center('F A N T A S Y   P R E S S B O X'))}│`,
    `  ├${'─'.repeat(BOX_WIDTH)}┤`,
    `  │${center('FACTS 100    EXCUSES 0    QTR 4  0:07')}│`,
    `  └${'─'.repeat(BOX_WIDTH)}┘`,
    `    ${line}`,
  ].join('\n');
}

/**
 * The three steps from nothing to a first edition, for someone with no league
 * folder yet. `cli` is the command as typed from inside that folder.
 */
export function gettingStarted(cli, folder = EXAMPLE_LEAGUE_FOLDER) {
  return [
    '  1. Set up a folder for your league (it asks a few questions):',
    `       ${cli} init --workspace ${folder}`,
    '  2. Go there and check that everything works:',
    `       cd ${folder}`,
    `       ${cli} doctor`,
    '  3. Build your first edition:',
    `       ${cli} rankings`,
  ];
}

/**
 * The week's commands, in the order they are run, for the league's format.
 * A guillotine league plays no matchups, so it gets its own three editions.
 */
export function weeklyRoutine(cli, formatType = null) {
  const [preview, recap, rankings] =
    formatType === 'guillotine'
      ? ['survival-preview', 'chop-recap', 'survival-rankings']
      : ['preview', 'recap', 'rankings'];
  const rows = [
    ['Before the games', `${cli} ${preview}`],
    ['', `${cli} record <reply file> --task ${preview}`],
    ['After the games', `${cli} ${recap}`],
    ['', `${cli} ${rankings}`],
    ['', `${cli} record <reply file> --task ${rankings}`],
    ['If anyone traded', `${cli} transactions`],
  ];
  const width = Math.max(...rows.map(([when]) => when.length));
  return [
    ...rows.map(([when, command]) => `  ${when.padEnd(width)}   ${command}`),
    '',
    '  Each command writes a prompt to output/: paste it into ChatGPT or Claude,',
    '  or add --generate to have the posts written for you (needs an API key).',
    '  `record` files the reply you posted, so your predictions get graded and',
    "  next week's movement arrows start from what the league actually saw.",
  ];
}
