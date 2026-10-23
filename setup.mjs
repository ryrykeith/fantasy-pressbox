#!/usr/bin/env node
/**
 * Interactive setup for Fantasy Pressbox: what `init` runs.
 *
 * Written for someone who has never set up a project before. It checks the
 * things that commonly go wrong, asks for each setting one at a time in plain
 * language, and writes one league's folder: its .env, the league settings its
 * format needs, and the data/ and output/ folders.
 *
 * - The league ID is checked against Sleeper before it is accepted, and the
 *   league's name, season and size are shown back.
 * - The format is always declared. Sleeper's reading is offered first, but it
 *   can never report a guillotine league, so this question is the only way a
 *   chopped league is covered as one.
 * - The scoring Sleeper reports is shown back for confirmation, because a
 *   misread there degrades every edition afterwards with nothing to say so.
 * - A dynasty league is asked how its rookie draft is ordered; a guillotine
 *   league gets the elimination ledger to fill in.
 *
 * Every answer is read with the parser the config loader uses (src/init.mjs),
 * and the finished folder is loaded with loadConfig before setup says it is
 * done, so setup never leaves a league that fails at its first command.
 *
 * Nothing is written into the package. Run from the package folder itself,
 * setup asks where the league's own folder should go.
 *
 * Safe to run more than once. Existing answers become the defaults, and
 * nothing already there is replaced without asking; the previous .env and
 * rookie-draft.yml are backed up first.
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from './src/lib/env.mjs';
import {
  LEAGUE_ID_KEYS,
  loadConfig,
  PACKAGE_ROOT,
  resolveWorkspaceRoot,
  workspaceConfigDir,
  workspaceIsPackage,
} from './src/config.mjs';
import { isLeagueWorkspace } from './src/workspace.mjs';
import { getProvider } from './src/providers.mjs';
import { FORMAT_LABELS } from './src/format.mjs';
import { describeScoringSummary, describeUnmodelledScoring } from './src/scoringReport.mjs';
import { describeDraftOrder } from './src/rookieDraft.mjs';
import { banner, cliCommand, displayPath, weeklyRoutine } from './src/welcome.mjs';
import { describeLeagueAge } from './src/leagueAge.mjs';
import {
  DRAFT_ORDER_PRESETS,
  ESPN_COOKIE_HELP,
  ESPN_FETCH_NOTICE,
  ESPN_FORMAT_TYPES,
  ESPN_ROUTE_CHOICES,
  PLATFORM_CHOICES,
  ROUND_ORDER_CHOICES,
  defaultFormatType,
  defaultLeagueFolder,
  describeOrderChoice,
  espnFormatChoices,
  expandHome,
  extractEspnLeague,
  extractLeagueId,
  formatChoices,
  parseFirstSeasonAnswer,
  parseStartWeekAnswer,
  presetForOrder,
  readRookieDraftConfig,
  renderEnv,
  renderRookieDraftConfig,
} from './src/init.mjs';

const MIN_NODE_MAJOR = 22;

const say = (text = '') => console.log(text);
const bold = (text) => (process.stdout.isTTY ? `\x1b[1m${text}\x1b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\x1b[2m${text}\x1b[0m` : text);
const green = (text) => (process.stdout.isTTY ? `\x1b[32m${text}\x1b[0m` : text);
const red = (text) => (process.stdout.isTTY ? `\x1b[31m${text}\x1b[0m` : text);

let step = 0;
function heading(text) {
  const title = `${++step}. ${text}`;
  say('');
  say(bold(title));
  say('─'.repeat(Math.min(title.length, 60)));
}

/* ------------------------------------------------------------------ input */

/** Thrown when stdin ends before every question has been answered. */
class NoMoreInput extends Error {
  constructor() {
    super('ran out of input');
    this.name = 'NoMoreInput';
  }
}

const interactive = Boolean(process.stdin.isTTY);
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });

/**
 * A queue in front of readline.
 *
 * `rl.question` only captures a line while it is waiting for one, so a piped
 * answer file loses everything after the first line. Buffering every line as
 * it arrives means typing at a prompt and piping answers both work, which
 * keeps setup testable.
 */
const pending = [];
const waiting = [];
let closed = false;

rl.on('line', (line) => {
  const waiter = waiting.shift();
  if (waiter) waiter.resolve(line.trim());
  else pending.push(line.trim());
});

rl.on('close', () => {
  closed = true;
  while (waiting.length) waiting.shift().reject(new NoMoreInput());
});

// Hiding typed characters relies on readline echoing them back, which only
// happens on a real terminal. Piped input has nothing to hide.
let muted = false;
const originalWrite = rl._writeToOutput?.bind(rl);
if (interactive && originalWrite) {
  rl._writeToOutput = function writeToOutput(text) {
    if (muted) {
      originalWrite(text.includes('\n') ? '\n' : '•');
      return;
    }
    originalWrite(text);
  };
}

function ask(question) {
  process.stdout.write(question);
  if (pending.length) {
    const answer = pending.shift();
    if (!interactive) process.stdout.write('\n');
    return Promise.resolve(answer);
  }
  if (closed) return Promise.reject(new NoMoreInput());
  return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
}

async function askSecret(question) {
  muted = interactive;
  try {
    return await ask(question);
  } finally {
    muted = false;
  }
}

/** Ask with a default shown in brackets; empty answer keeps the default. */
async function askWithDefault(question, fallback, { secret = false } = {}) {
  const shown = fallback ? ` ${dim(`[${secret ? maskSecret(fallback) : fallback}]`)}` : '';
  const answer = secret
    ? await askSecret(`${question}${shown}: `)
    : await ask(`${question}${shown}: `);
  return answer === '' ? fallback ?? '' : answer;
}

async function askYesNo(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${dim(hint)} `)).toLowerCase();
  if (answer === '') return defaultYes;
  return answer.startsWith('y');
}

/** Numbered choices; Enter takes the one whose value is `fallback`, else the first. */
async function askChoice(question, choices, fallback = choices[0].value) {
  const defaultIndex = Math.max(0, choices.findIndex((choice) => choice.value === fallback)) + 1;
  say(question);
  choices.forEach((choice, index) => say(`  ${index + 1}) ${choice.label}`));
  while (true) {
    const answer = await ask(`Choose 1-${choices.length} ${dim(`[${defaultIndex}]`)}: `);
    const index = answer === '' ? defaultIndex : Number.parseInt(answer, 10);
    if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
      return choices[index - 1].value;
    }
    say(red(`  Please enter a number between 1 and ${choices.length}.`));
  }
}

const maskSecret = (value) =>
  !value ? '' : value.length <= 8 ? '•'.repeat(value.length) : `${value.slice(0, 4)}…${value.slice(-4)}`;

/* ------------------------------------------------------------------ checks */

function checkNode() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    say(red(`✗ Node.js ${process.versions.node} is too old. Version ${MIN_NODE_MAJOR} or newer is required.`));
    say('');
    say('  Download the "LTS" installer from https://nodejs.org, run it, then');
    say('  close this window, open a new one, and run this setup again.');
    return false;
  }
  say(green(`✓ Node.js ${process.versions.node}`));
  return true;
}

/**
 * Fantasy Pressbox has no npm dependencies on purpose — installing Node is the
 * only install step. This still runs npm when a dependency is ever added, so
 * setup keeps working if that changes.
 */
function checkPackages() {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const dependencyCount = Object.keys(manifest.dependencies ?? {}).length;

  if (dependencyCount === 0) {
    say(green('✓ No extra packages needed'));
    return true;
  }

  // A checkout's own install step, which only runs if a dependency is ever added.
  const installed = existsSync(join(PACKAGE_ROOT, 'node_modules'));
  say(installed ? 'Updating packages...' : `Installing ${dependencyCount} package(s)...`);
  const result = spawnSync('npm', ['install'], { cwd: PACKAGE_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    say(red('✗ npm install failed. Check the messages above, then run: npm install'));
    return false;
  }
  say(green('✓ Packages ready'));
  return true;
}

/** True when `child` is `parent` or somewhere below it. */
function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/* -------------------------------------------------------------- questions */

/**
 * Asks for the league until Sleeper confirms one and the user recognises it.
 * Returns null when the user gives up. An ID Sleeper does not know, or a
 * Sleeper that cannot be reached, is reported here, at the point of entry.
 *
 * `lookup` is passed to the provider's lookupLeague beside the ID: ESPN needs
 * `{ season, secrets }` for a private league; Sleeper ignores them.
 */
async function askLeague(fallbackId, provider, lookup = {}) {
  const name = provider.displayName;
  let leagueId = fallbackId;
  while (true) {
    const answer = await askWithDefault(`${name} league ID or URL`, leagueId);
    const candidate = extractLeagueId(answer);
    if (!candidate) {
      say(red("  That doesn't contain a league ID. It should be a long run of digits."));
      continue;
    }
    say(dim(`  Checking with ${name}...`));
    let league;
    try {
      league = await provider.lookupLeague({ ...lookup, id: candidate });
    } catch (error) {
      say(red(`  ${error.message}`));
      if (!(await askYesNo('  Try a different ID?', true))) return null;
      continue;
    }
    say(green(`  ✓ Found "${league.name}" — ${league.teamCount ?? '?'} teams, ${league.season} season`));
    if (await askYesNo('  Is this your league?', true)) return { leagueId: candidate, league };
    leagueId = '';
  }
}

/** The notice shown wherever an ESPN league is shown back. */
const ESPN_EXPERIMENTAL_NOTICE =
  'ESPN support is experimental: it is built from public descriptions of an unofficial API and has not been checked against a live league.';

/** A saved page's path as typed: quotes (from drag and drop) dropped, ~ expanded. */
const typedPath = (answer) => expandHome(answer.replace(/^(['"])(.*)\1$/, '$2'), homedir());

/**
 * Reads the league page the user saved, for the import route. Nothing here
 * contacts ESPN: it reads one file from disk and hands its text to the
 * provider. A file inside the package folder is refused, as import-espn does.
 */
function readSavedLeaguePage(provider, path, { leagueId, season }) {
  const full = resolve(path);
  if (!existsSync(full)) throw new Error(`${path} does not exist.`);
  const real = realpathSync(full);
  if (isInside(realpathSync(PACKAGE_ROOT), real)) {
    throw new Error(
      `${path} is inside the Fantasy Pressbox folder (${PACKAGE_ROOT}). A saved ESPN page is your league's ` +
        'data: keep it in your league folder.',
    );
  }
  const stats = statSync(real);
  if (!stats.isFile()) throw new Error(`${path} is not a file.`);
  if (stats.size > provider.importMaxBytes) {
    throw new Error(`${path} is larger than ${provider.importMaxBytes / (1024 * 1024)} MB: check that this is the right file.`);
  }
  return provider.readImportedLeague({ file: path, text: readFileSync(real, 'utf8'), leagueId, season });
}

/** Asks for a four-digit season until one is given. */
async function askSeason(fallback) {
  while (true) {
    const answer = await askWithDefault('Which season (a four-digit year, such as the current NFL season)', fallback);
    if (/^\d{4}$/.test(answer)) return answer;
    say(red('  That is not a four-digit year.'));
    fallback = '';
  }
}

/**
 * The season the league started, for LEAGUE_FIRST_SEASON: '' to let the
 * provider's chain of seasons answer, or a year.
 *
 * A declared year already in .env is offered first. Otherwise the provider's
 * reading is shown and confirmed with one Enter; a "no", or a provider that
 * cannot say, asks for the year (empty leaves it unknown).
 */
async function askFirstSeason({ provider, league, existing }) {
  const season = Number.parseInt(league.season, 10);
  const declared = existing.LEAGUE_FIRST_SEASON?.trim() ?? '';
  say('A first edition of Fantasy Pressbox is not the first season of the league, and');
  say('every edition tells the writer which season this is.');
  say('');
  const askYear = async (fallback) => {
    while (true) {
      const answer = await askWithDefault("Which year was the league's first season? (empty: not known)", fallback);
      try {
        const year = parseFirstSeasonAnswer(answer, league.season);
        return year === null ? '' : String(year);
      } catch (error) {
        say(red(`  ${error.message}`));
        fallback = '';
      }
    }
  };

  if (declared && readsAsFirstSeason(declared, league.season)) {
    say(describeLeagueAge({ firstSeason: Number(declared), season, by: 'Your .env' }));
    if (await askYesNo('Keep that?', true)) return declared;
    return askYear('');
  }

  const found =
    typeof provider.lookupLeagueHistory === 'function'
      ? await provider.lookupLeagueHistory({ league })
      : { unavailable: `${provider.displayName} does not report a league's earlier seasons.` };
  if (found.unavailable) {
    say(found.unavailable);
    say(dim('  Leave it empty and editions say nothing about how old the league is.'));
    return askYear('');
  }
  say(describeLeagueAge({ firstSeason: found.firstSeason, season, by: provider.displayName }));
  if (await askYesNo('Is that right?', true)) return '';
  say(dim('  A league recreated rather than renewed starts a new chain. Give the real first year,'));
  say(dim(`  or leave it empty to keep ${provider.displayName}'s reading.`));
  return askYear('');
}

/** Is a LEAGUE_FIRST_SEASON already in .env one setup can offer? A broken one is asked again. */
function readsAsFirstSeason(text, season) {
  try {
    return parseFirstSeasonAnswer(text, season) !== null;
  } catch {
    return false;
  }
}

/**
 * Which way ESPN's data arrives. Import is the default. Fetch is shown a
 * notice first and needs an explicit yes; declining it falls back to import.
 */
async function askEspnRoute(fallback) {
  say('Fantasy Pressbox can get your ESPN league two ways.');
  say('');
  let route = await askChoice('How should it get your league?', ESPN_ROUTE_CHOICES, fallback);
  if (route === 'fetch') {
    say('');
    for (const line of ESPN_FETCH_NOTICE) say(line);
    say('');
    if (!(await askYesNo('Do you understand, and choose Fetch anyway?', false))) {
      say('  Understood: setup will use Import, which needs no cookies.');
      route = 'import';
    }
  }
  return route;
}

/**
 * Asks for the ESPN league until it is confirmed and the user recognises it.
 * Returns null when the user gives up.
 *
 * Import: the league address is printed for the user to open and save, and
 * the saved file is read from disk. Nothing contacts ESPN and no cookie is
 * asked for. Fetch: public or private, the cookies for a private league
 * (typed hidden, shown masked), and the league is looked up with ESPN.
 */
async function askEspnLeague(provider, { existing, route }) {
  let idDefault = existing.ESPN_LEAGUE_ID ?? '';
  let seasonDefault = existing.LEAGUE_SEASON ?? '';
  let s2 = existing.ESPN_S2 ?? '';
  let swid = existing.ESPN_SWID ?? '';
  let isPrivate = Boolean(s2 || swid);
  say('Open your league on fantasy.espn.com and copy the address from the browser bar.');
  say(dim('  It contains leagueId= followed by your league ID.'));
  say('You can paste the whole address, or just the ID.');
  say('');
  while (true) {
    const answer = await askWithDefault('ESPN league ID or address', idDefault);
    const typed = extractEspnLeague(answer);
    if (!typed.leagueId) {
      say(red('  That has no league ID. Paste the address with leagueId= in it, or just the digits.'));
      continue;
    }
    const leagueId = typed.leagueId;
    const season = await askSeason(typed.season || seasonDefault);
    let league;

    if (route === 'import') {
      const { league: leagueAddress } = provider.importLinks({ leagueId, season });
      say('');
      say('Setup does not contact ESPN. Open this address in a browser signed in to ESPN:');
      say('');
      say(`  ${leagueAddress}`);
      say('');
      say("Then save the page as it is shown (the raw JSON text) into your league's folder.");
      say(dim('  If the folder does not exist yet, save it anywhere for now and keep the file.'));
      say('');
      const path = typedPath(await ask('Path to the saved file: '));
      try {
        if (!path) throw new Error('No file was given.');
        league = readSavedLeaguePage(provider, path, { leagueId, season });
      } catch (error) {
        say(red(`  ${error.message}`));
        if (!(await askYesNo('  Try again?', true))) return null;
        idDefault = leagueId;
        seasonDefault = season;
        continue;
      }
    } else {
      isPrivate = (await askChoice('Is your league public or private?', [
        { value: false, label: 'Public — anyone with the link can view it' },
        { value: true, label: 'Private — you must sign in to ESPN to view it' },
      ], isPrivate)) === true;
      if (isPrivate) {
        say('');
        for (const line of ESPN_COOKIE_HELP) say(line);
        say('');
        while (true) {
          s2 = await askWithDefault('espn_s2 cookie', s2, { secret: true });
          swid = await askWithDefault('SWID cookie', swid, { secret: true });
          if (s2 && swid) break;
          say(red('  A private league needs both cookies.'));
        }
      } else {
        s2 = '';
        swid = '';
      }
      say(dim('  Checking with ESPN...'));
      try {
        league = await provider.lookupLeague({
          id: leagueId,
          season,
          secrets: isPrivate ? { ESPN_S2: s2, ESPN_SWID: swid } : {},
        });
      } catch (error) {
        say(red(`  ${error.message}`));
        if (/\b401\b/.test(error.message)) {
          say('  A 401 means ESPN will not show this league without a login: either the league is');
          say('  private, or the cookies are wrong or have expired. Copy fresh cookie values.');
        }
        if (!(await askYesNo('  Try again?', true))) return null;
        idDefault = leagueId;
        seasonDefault = season;
        continue;
      }
    }

    say(green(`  ✓ Found "${league.name}" — ${league.teamCount ?? '?'} teams, ${league.season} season`));
    say(dim(`  ${ESPN_EXPERIMENTAL_NOTICE}`));
    if (await askYesNo('  Is this your league?', true)) {
      return {
        leagueId,
        league,
        season,
        secrets: route === 'fetch' && isPrivate ? { ESPN_S2: s2, ESPN_SWID: swid } : {},
      };
    }
    idDefault = '';
    seasonDefault = '';
  }
}

/**
 * Where the league's folder goes, when setup was started in the package
 * itself. Offered at ~/leagues/<league name>; anywhere inside the package is
 * refused, since nothing may be written there.
 */
async function askLeagueFolder(leagueName) {
  const home = homedir();
  say('Each league gets a folder of its own, outside the Fantasy Pressbox folder. It');
  say("holds the league's settings, its saved history and the files you paste, so");
  say('Fantasy Pressbox can be updated or reinstalled without touching any of it.');
  say('');
  while (true) {
    const answer = await askWithDefault('Folder for this league', defaultLeagueFolder({ home, leagueName }));
    const folder = resolve(expandHome(answer, home));
    if (isInside(PACKAGE_ROOT, folder)) {
      say(red(`  That is inside the Fantasy Pressbox folder (${PACKAGE_ROOT}). Choose a folder outside it.`));
      continue;
    }
    return folder;
  }
}

/** The rookie draft settings for a dynasty league: the text to write, or null to leave the file alone. */
async function askRookieDraft({ draftPath, league, leagueName }) {
  const sizes = { teamCount: league.teamCount, playoffTeams: league.playoffTeams };
  let current = null;
  if (existsSync(draftPath)) {
    try {
      current = readRookieDraftConfig(readFileSync(draftPath, 'utf8'), { source: draftPath });
    } catch (error) {
      say(red(`  The rookie draft settings already in ${draftPath} do not load:`));
      say(red(`  ${error.message.split('\n')[0]}`));
      say('  Answer the questions below to replace them. The old file is kept as rookie-draft.yml.backup.');
      say('');
    }
  }
  if (current && (current.order || current.rounds || current.startWeek)) {
    say(`This folder already has rookie draft settings (${draftPath}):`);
    for (const line of describeDraftOrder(current.order, { ...sizes, rounds: current.rounds })) say(`  ${line}`);
    say(`  tank watch opens: ${current.startWeek ? `after week ${current.startWeek}` : 'the middle of the regular season'}`);
    if (await askYesNo('Keep these rookie draft settings?', true)) return null;
  }

  say('Sleeper does not say how your rookie draft is ordered, so Fantasy Pressbox');
  say('asks. Without it, no pick is projected to a slot (1.07 and so on).');
  say('');
  const presetKey = await askChoice(
    'How is your rookie draft ordered?',
    [
      ...DRAFT_ORDER_PRESETS.map((preset) => ({ value: preset.key, label: preset.label })),
      { value: null, label: 'Something else — a lottery, or a rule not listed (write it in the file later)' },
    ],
    presetForOrder(current?.order)?.key ?? DRAFT_ORDER_PRESETS[0].key,
  );
  const order = DRAFT_ORDER_PRESETS.find((preset) => preset.key === presetKey)?.order ?? null;
  if (order) {
    for (const line of describeOrderChoice(order, sizes)) say(dim(`  ${line}`));
  } else {
    say(dim(`  Left undeclared. Write the rule in ${draftPath} when you are ready; the README explains how.`));
  }
  say('');

  const rounds = await askChoice('How are the rounds after the first ordered?', ROUND_ORDER_CHOICES, current?.rounds ?? null);
  say('');

  say('The tank watch (the race for next season\'s top picks) opens at the middle of');
  say('the regular season, unless you name an earlier or later week.');
  let startWeek;
  while (true) {
    const answer = await askWithDefault(
      'First week it covers (Enter for the middle of the season)',
      current?.startWeek ? String(current.startWeek) : '',
    );
    try {
      startWeek = parseStartWeekAnswer(answer);
      break;
    } catch (error) {
      say(red(`  ${error.message}`));
    }
  }

  return renderRookieDraftConfig({ leagueName, order, rounds, startWeek });
}

/* -------------------------------------------------------------------- main */

async function main() {
  let workspaceRoot = resolveWorkspaceRoot();
  const startedInPackage = workspaceIsPackage(workspaceRoot);

  say('');
  say(banner({ title: bold }));
  say('');
  say(bold('  Fantasy Pressbox setup'));
  say('  This asks a few questions and sets up a folder for your league.');
  say('  Press Enter to accept the value shown in brackets.');

  heading('Checking your computer');
  if (!checkNode()) return 1;
  if (!checkPackages()) return 1;

  if (startedInPackage && isLeagueWorkspace(PACKAGE_ROOT)) {
    say('');
    say(`This folder (${PACKAGE_ROOT}) already holds a league: its .env.`);
    say('To move that league and its history into a folder of its own, run:');
    say(bold(`  ${cliCommand({ packageRoot: PACKAGE_ROOT })} migrate ~/leagues/<league-name>`));
    if (!(await askYesNo('Set up a different league in a new folder instead?', false))) return 0;
  }

  let existing = startedInPackage ? {} : loadEnvFile(join(workspaceRoot, '.env'));
  if (Object.keys(existing).length) {
    say(dim(`  Found an existing .env in ${workspaceRoot} — your current answers are the defaults.`));
  }

  heading('Where your league is played');
  const existingPlatform = existing.LEAGUE_PROVIDER?.trim().toLowerCase() === 'espn' ? 'espn' : 'sleeper';
  const platform = await askChoice('Which platform is your league on?', PLATFORM_CHOICES, existingPlatform);
  const leagueProvider = getProvider(platform);
  const isEspn = platform === 'espn';

  let route = null;
  if (isEspn) {
    heading('How to get your ESPN league');
    say(ESPN_EXPERIMENTAL_NOTICE);
    say('');
    route = await askEspnRoute(existing.ESPN_ROUTE?.trim().toLowerCase() === 'fetch' ? 'fetch' : 'import');
  }

  heading(`Your ${leagueProvider.displayName} league`);
  let found;
  if (isEspn) {
    found = await askEspnLeague(leagueProvider, { existing, route });
  } else {
    say('Open your league on sleeper.com and copy the address from the browser bar.');
    say(dim('  Example: https://sleeper.com/leagues/1234567890123456789/team'));
    say('You can paste the whole address — the ID will be picked out of it.');
    say('');
    found = await askLeague(existing.SLEEPER_LEAGUE_ID ?? '', leagueProvider);
  }
  if (!found) return 1;
  const { leagueId, league, season: espnSeason = '', secrets = {} } = found;

  if (startedInPackage) {
    heading('Your league folder');
    workspaceRoot = await askLeagueFolder(league.name);
    existing = loadEnvFile(join(workspaceRoot, '.env'));
    if (Object.keys(existing).length) {
      say(dim(`  Found an existing .env there — your current answers are the defaults.`));
    }
  }
  const envPath = join(workspaceRoot, '.env');
  const configDir = workspaceConfigDir(workspaceRoot);

  const existingProvider = existing.LEAGUE_PROVIDER?.trim().toLowerCase() || 'sleeper';
  const existingLeagueId = existing[LEAGUE_ID_KEYS[existingProvider]];
  if (existingLeagueId && (existingProvider !== platform || existingLeagueId !== leagueId)) {
    say('');
    say(red(`  ${workspaceRoot} already holds a different league (${existingProvider} ID ${existingLeagueId}).`));
    say('  Each league needs a folder of its own, or their histories get mixed together.');
    if (!(await askYesNo('  Replace it with this league anyway?', false))) return 1;
  }

  say('');
  const displayName = await askWithDefault(
    'What should the publication call your league',
    existing.LEAGUE_DISPLAY_NAME || league.name || '',
  );

  heading('What kind of league it is');
  const detectedType = league.format.detectedType;
  say(`${leagueProvider.displayName}'s settings say this is a ${FORMAT_LABELS[detectedType].toLowerCase()} league.`);
  const currentType = existing.LEAGUE_FORMAT?.trim().toLowerCase() || null;
  let formatType;
  if (isEspn) {
    // Guillotine is refused on ESPN in v1, so it is not offered.
    say('A keeper league counts as redraft. Guillotine leagues are not supported on ESPN yet.');
    say('');
    formatType = await askChoice(
      'Which kind of league is it?',
      espnFormatChoices({ detectedType, currentType }),
      defaultFormatType({ detectedType, existing: existing.LEAGUE_FORMAT, formats: ESPN_FORMAT_TYPES }),
    );
  } else {
    say(`${leagueProvider.displayName} cannot tell a guillotine league from an ordinary one, because the`);
    say('commissioner runs it by hand. If yours is one, choose it here.');
    say('');
    formatType = await askChoice(
      'Which kind of league is it?',
      formatChoices({ detectedType, currentType, providerName: leagueProvider.displayName }),
      defaultFormatType({ detectedType, existing: existing.LEAGUE_FORMAT }),
    );
  }

  heading('How your league scores');
  say(`Every edition is written from these, read from your league in ${leagueProvider.displayName}:`);
  for (const line of describeScoringSummary(league.format.scoring)) say(`  ${line}`);
  for (const line of describeUnmodelledScoring(league.format.scoring)) say(`  ${line}`);
  say('');
  if (!(await askYesNo('Does that match your league?', true))) {
    say('');
    say(`These come straight from the league's scoring settings in ${leagueProvider.displayName}. If they are`);
    say('wrong, the commissioner can correct them there, and `doctor` shows what');
    say('Fantasy Pressbox reads afterwards. Nothing here can override them.');
    if (!(await askYesNo('Carry on with setup anyway?', true))) return 1;
  }

  heading('How long your league has run');
  const firstSeason = await askFirstSeason({ provider: leagueProvider, league, existing });

  const draftPath = join(configDir, 'rookie-draft.yml');
  const guillotinePath = join(configDir, 'guillotine.yml');
  let rookieDraftText = null;
  let writeGuillotine = false;

  if (isEspn && formatType === 'dynasty') {
    say('');
    say('Editions that need traded future picks (tank watch, future stock, pick capital) are');
    say('not available for ESPN leagues, so there are no rookie draft questions.');
  } else if (formatType === 'dynasty') {
    heading('Your rookie draft');
    rookieDraftText = await askRookieDraft({ draftPath, league, leagueName: displayName });
  } else if (formatType === 'guillotine') {
    heading('Your eliminations');
    say('Sleeper keeps no record of who has been chopped. Fantasy Pressbox works it');
    say('out from the scores, but the weeks you write down always win, so keep the');
    say(`ledger up to date in ${guillotinePath}:`);
    say(dim('  one line per week — the week number, then the team as Sleeper shows it.'));
    writeGuillotine = !existsSync(guillotinePath);
    say(writeGuillotine ? 'Setup writes the empty ledger for you to fill in.' : 'The ledger already there is kept as it is.');
  }

  heading('Writing the posts');
  say('Fantasy Pressbox can work two ways.');
  say('');
  say(`  ${bold('Paste it yourself')} — free. It writes a file you paste into ChatGPT`);
  say('  or Claude in your browser, and you copy the result back.');
  say('');
  say(`  ${bold('Let it write')} — needs a paid API key. Add --generate to any command`);
  say('  and the finished posts are written straight to the output folder.');
  say('');
  say(dim('  You can start with the free way and add a key later.'));
  say('');

  const currentProvider = existing.AI_PROVIDER || (existing.ANTHROPIC_API_KEY ? 'anthropic' : existing.OPENAI_API_KEY ? 'openai' : '');
  const provider = await askChoice(
    'Which do you want?',
    [
      { label: `Paste it myself — no API key${!currentProvider ? dim(' (current)') : ''}`, value: '' },
      { label: `Claude (Anthropic API key)${currentProvider === 'anthropic' ? dim(' (current)') : ''}`, value: 'anthropic' },
      { label: `ChatGPT (OpenAI API key)${currentProvider === 'openai' ? dim(' (current)') : ''}`, value: 'openai' },
    ],
    currentProvider,
  );

  let anthropicKey = existing.ANTHROPIC_API_KEY ?? '';
  let openaiKey = existing.OPENAI_API_KEY ?? '';
  let model = existing.AI_MODEL || existing.OPENAI_MODEL || '';

  if (provider === 'anthropic') {
    say('');
    say(dim('  Get a key at https://console.anthropic.com/settings/keys'));
    say(dim('  Typing is hidden. Paste works normally.'));
    anthropicKey = await askWithDefault('Anthropic API key', anthropicKey, { secret: true });
    model = await askWithDefault('Model', model || 'claude-opus-5');
  } else if (provider === 'openai') {
    say('');
    say(dim('  Get a key at https://platform.openai.com/api-keys'));
    say(dim('  Typing is hidden. Paste works normally.'));
    openaiKey = await askWithDefault('OpenAI API key', openaiKey, { secret: true });
    model = await askWithDefault('Model', model || 'gpt-4.1');
  }

  heading('Style');
  const tone = await askChoice(
    'How should the writing sound?',
    [
      { label: 'Humorous — analytical, dry, willing to roast people', value: 'humorous' },
      { label: 'Analytical — straight football analysis, light on jokes', value: 'analytical' },
      { label: 'Unhinged — maximum pettiness', value: 'unhinged' },
    ],
    existing.PRESSBOX_TONE || 'humorous',
  );

  const maxChars = await askWithDefault(
    isEspn ? 'Longest single post, in characters' : `Longest single ${leagueProvider.displayName} post, in characters`,
    existing.POST_MAX_LENGTH || existing.SLEEPER_POST_MAX_LENGTH || '900',
  );

  heading('Saving');
  if (existsSync(envPath) && !(await askYesNo(`Replace the settings in ${envPath}? The current file is kept as .env.backup.`, true))) {
    say('Nothing was written. Your league folder is exactly as it was.');
    return 0;
  }

  const values = {
    // Absent means Sleeper; a folder switched from ESPN is cleared back to that.
    LEAGUE_PROVIDER: isEspn ? 'espn' : '',
    SLEEPER_LEAGUE_ID: isEspn ? '' : leagueId,
    ESPN_LEAGUE_ID: isEspn ? leagueId : '',
    ESPN_ROUTE: isEspn ? route : '',
    // The cookies are written on the fetch route only, and only for a private league.
    ESPN_S2: secrets.ESPN_S2 ?? '',
    ESPN_SWID: secrets.ESPN_SWID ?? '',
    ...(isEspn ? { LEAGUE_SEASON: espnSeason } : existing.LEAGUE_SEASON ? { LEAGUE_SEASON: existing.LEAGUE_SEASON } : {}),
    // Always declared, even when it agrees with Sleeper: the operator has now
    // said what the league is, and doctor reports it as told rather than guessed.
    LEAGUE_FORMAT: formatType,
    // Empty unless the operator gave a year: the provider's chain answers.
    LEAGUE_FIRST_SEASON: firstSeason,
    AI_PROVIDER: provider,
    ANTHROPIC_API_KEY: anthropicKey,
    OPENAI_API_KEY: openaiKey,
    AI_MODEL: model,
    SLEEPER_SEASON: existing.SLEEPER_SEASON ?? '',
    FANTASY_WEEK: existing.FANTASY_WEEK ?? '',
    LEAGUE_DISPLAY_NAME: displayName,
    PRESSBOX_TONE: tone,
    // A new folder gets the neutral key; an existing legacy key stays where it is.
    ...(existing.SLEEPER_POST_MAX_LENGTH !== undefined && existing.POST_MAX_LENGTH === undefined
      ? { SLEEPER_POST_MAX_LENGTH: maxChars }
      : { POST_MAX_LENGTH: maxChars }),
    INCLUDE_EMOJI: existing.INCLUDE_EMOJI ?? '',
    DATA_DIR: existing.DATA_DIR ?? '',
    OUTPUT_DIR: existing.OUTPUT_DIR ?? '',
    DEBUG: existing.DEBUG ?? 'false',
  };

  mkdirSync(workspaceRoot, { recursive: true });
  if (existsSync(envPath)) {
    copyFileSync(envPath, `${envPath}.backup`);
    say(dim('  Previous settings backed up to .env.backup'));
  }
  writeFileSync(envPath, renderEnv(readFileSync(join(PACKAGE_ROOT, '.env.example'), 'utf8'), values));
  say(green(`✓ Settings saved to ${envPath}`));
  say(dim('  This file holds your keys. Keep it out of git and off shared drives.'));

  if (rookieDraftText) {
    mkdirSync(configDir, { recursive: true });
    if (existsSync(draftPath)) copyFileSync(draftPath, `${draftPath}.backup`);
    writeFileSync(draftPath, rookieDraftText);
    say(green(`✓ Rookie draft settings saved to ${draftPath}`));
  }
  if (writeGuillotine) {
    mkdirSync(configDir, { recursive: true });
    copyFileSync(join(PACKAGE_ROOT, 'config', 'guillotine.yml'), guillotinePath);
    say(green(`✓ Elimination ledger written to ${guillotinePath}`));
  }
  mkdirSync(join(workspaceRoot, 'data'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'output'), { recursive: true });

  // The proof the folder works: the same load every command starts with.
  try {
    loadConfig({ workspaceRoot });
  } catch (error) {
    say(red(`✗ The league folder was written, but does not load:\n${error.message}`));
    return 1;
  }
  say(green('✓ The league folder loads'));

  heading("You're on the air");
  // Typed from the league folder, which is where the week's commands run.
  const cli = cliCommand({ packageRoot: PACKAGE_ROOT, from: workspaceRoot });
  say(`Your league folder is ${displayPath(workspaceRoot)}.`);
  say('');
  if (isEspn && route === 'import') {
    say('Your ESPN league arrives from pages you save. First import the league page:');
    say('');
    say(`  ${bold(`${cli} import-espn <the saved league file>`)}`);
    say('');
    say("Then each week, save that week's two pages (import-espn lists the addresses):");
    say('');
    say(`  ${bold(`${cli} import-espn --week <n> <the saved files>`)}`);
    say('');
  }
  say('Then check that everything works:');
  say('');
  if (realpathSync(process.cwd()) !== realpathSync(workspaceRoot)) {
    say(`  ${bold(`cd ${displayPath(workspaceRoot)}`)}`);
  }
  say(`  ${bold(`${cli} doctor`)}`);
  say('');
  // A season already under way has weeks behind it that nothing has saved.
  if (Number.isInteger(league.lastScoredWeek) && league.lastScoredWeek >= 1) {
    say(`Your season is under way (${league.lastScoredWeek} week${league.lastScoredWeek === 1 ? '' : 's'} played). Save the earlier weeks first:`);
    say('');
    say(`  ${bold(`${cli} catch-up`)}`);
    say('');
  }
  say('Then every week, from that folder:');
  say('');
  for (const line of weeklyRoutine(cli, formatType)) say(line);
  say('');
  say(`Output lands in ${displayPath(join(workspaceRoot, 'output'))}.`);
  if (provider) say(`Your API key is set, so ${bold('--generate')} works on any of those.`);
  // Not for ESPN: the prospect board is unavailable there (no traded future picks).
  if (formatType === 'dynasty' && !isEspn) {
    // The rookie class that matters is next season's: this season's draft is done.
    const season = Number.parseInt(league.season, 10);
    const draftYear = Number.isInteger(season) ? String(season + 1) : '<draft year>';
    say('');
    say(`To name the prospects in the ${draftYear} rookie class, start from the example board,`);
    say('then fill it in from sources you have checked. Fantasy Pressbox never ranks prospects');
    say('itself:');
    say('');
    const example = join(PACKAGE_ROOT, 'config', 'prospects.example.yml');
    say(`  ${bold(`cp ${displayPath(example)} ${displayPath(join(configDir, `prospects.${draftYear}.yml`))}`)}`);
  }
  say('');
  return 0;
}

main()
  .then((code) => {
    rl.close();
    process.exit(code ?? 0);
  })
  .catch((error) => {
    rl.close();
    if (error.name === 'NoMoreInput') {
      console.error(
        red('\nSetup needs an answer to every question, and input ended early.\n') +
          `Run it directly in a terminal so it can ask you:  ${cliCommand({ packageRoot: PACKAGE_ROOT })} init\n`,
      );
      process.exit(1);
    }
    console.error(red(`\nSetup failed: ${error.message}\n`));
    process.exit(1);
  });
