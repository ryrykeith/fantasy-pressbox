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
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from './src/lib/env.mjs';
import {
  loadConfig,
  PACKAGE_ROOT,
  resolveWorkspaceRoot,
  workspaceConfigDir,
  workspaceIsPackage,
} from './src/config.mjs';
import { isLeagueWorkspace } from './src/workspace.mjs';
import { createClient } from './src/sleeper/client.mjs';
import { normalizeLeague } from './src/sleeper/normalize.mjs';
import { FORMAT_LABELS } from './src/format.mjs';
import { describeScoringSummary, describeUnmodelledScoring } from './src/scoringReport.mjs';
import { describeDraftOrder } from './src/rookieDraft.mjs';
import { banner, cliCommand, displayPath, weeklyRoutine } from './src/welcome.mjs';
import {
  DRAFT_ORDER_PRESETS,
  ROUND_ORDER_CHOICES,
  defaultFormatType,
  defaultLeagueFolder,
  describeOrderChoice,
  expandHome,
  extractLeagueId,
  formatChoices,
  parseStartWeekAnswer,
  presetForOrder,
  readRookieDraftConfig,
  renderEnv,
  renderRookieDraftConfig,
} from './src/init.mjs';

const MIN_NODE_MAJOR = 18;

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
 */
async function askLeague(fallbackId) {
  let leagueId = fallbackId;
  while (true) {
    const answer = await askWithDefault('Sleeper league ID or URL', leagueId);
    const candidate = extractLeagueId(answer);
    if (!candidate) {
      say(red("  That doesn't contain a league ID. It should be a long run of digits."));
      continue;
    }
    say(dim('  Checking with Sleeper...'));
    let raw;
    try {
      raw = await createClient({ leagueId: candidate, dataDir: null }).league();
    } catch (error) {
      say(red(`  ${error.message}`));
      if (!(await askYesNo('  Try a different ID?', true))) return null;
      continue;
    }
    const league = normalizeLeague(raw);
    say(green(`  ✓ Found "${league.name}" — ${league.teamCount ?? '?'} teams, ${league.season} season`));
    if (await askYesNo('  Is this your league?', true)) return { leagueId: candidate, league };
    leagueId = '';
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

  heading('Your Sleeper league');
  say('Open your league on sleeper.com and copy the address from the browser bar.');
  say(dim('  Example: https://sleeper.com/leagues/1234567890123456789/team'));
  say('You can paste the whole address — the ID will be picked out of it.');
  say('');
  const found = await askLeague(existing.SLEEPER_LEAGUE_ID ?? '');
  if (!found) return 1;
  const { leagueId, league } = found;

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

  if (existing.SLEEPER_LEAGUE_ID && existing.SLEEPER_LEAGUE_ID !== leagueId) {
    say('');
    say(red(`  ${workspaceRoot} already holds a different league (ID ${existing.SLEEPER_LEAGUE_ID}).`));
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
  say(`Sleeper's settings say this is a ${FORMAT_LABELS[detectedType].toLowerCase()} league.`);
  say('Sleeper cannot tell a guillotine league from an ordinary one, because the');
  say('commissioner runs it by hand. If yours is one, choose it here.');
  say('');
  const formatType = await askChoice(
    'Which kind of league is it?',
    formatChoices({ detectedType, currentType: existing.LEAGUE_FORMAT?.trim().toLowerCase() || null }),
    defaultFormatType({ detectedType, existing: existing.LEAGUE_FORMAT }),
  );

  heading('How your league scores');
  say('Every edition is written from these, read from your league in Sleeper:');
  for (const line of describeScoringSummary(league.format.scoring)) say(`  ${line}`);
  for (const line of describeUnmodelledScoring(league.format.scoring)) say(`  ${line}`);
  say('');
  if (!(await askYesNo('Does that match your league?', true))) {
    say('');
    say('These come straight from the league\'s scoring settings in Sleeper. If they are');
    say('wrong, the commissioner can correct them there, and `doctor` shows what');
    say('Fantasy Pressbox reads afterwards. Nothing here can override them.');
    if (!(await askYesNo('Carry on with setup anyway?', true))) return 1;
  }

  const draftPath = join(configDir, 'rookie-draft.yml');
  const guillotinePath = join(configDir, 'guillotine.yml');
  let rookieDraftText = null;
  let writeGuillotine = false;

  if (formatType === 'dynasty') {
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
    'Longest single Sleeper post, in characters',
    existing.SLEEPER_POST_MAX_LENGTH || '900',
  );

  heading('Saving');
  if (existsSync(envPath) && !(await askYesNo(`Replace the settings in ${envPath}? The current file is kept as .env.backup.`, true))) {
    say('Nothing was written. Your league folder is exactly as it was.');
    return 0;
  }

  const values = {
    SLEEPER_LEAGUE_ID: leagueId,
    // Always declared, even when it agrees with Sleeper: the operator has now
    // said what the league is, and doctor reports it as told rather than guessed.
    LEAGUE_FORMAT: formatType,
    AI_PROVIDER: provider,
    ANTHROPIC_API_KEY: anthropicKey,
    OPENAI_API_KEY: openaiKey,
    AI_MODEL: model,
    SLEEPER_SEASON: existing.SLEEPER_SEASON ?? '',
    FANTASY_WEEK: existing.FANTASY_WEEK ?? '',
    LEAGUE_DISPLAY_NAME: displayName,
    PRESSBOX_TONE: tone,
    SLEEPER_POST_MAX_LENGTH: maxChars,
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
  say('First, check that everything works:');
  say('');
  if (realpathSync(process.cwd()) !== realpathSync(workspaceRoot)) {
    say(`  ${bold(`cd ${displayPath(workspaceRoot)}`)}`);
  }
  say(`  ${bold(`${cli} doctor`)}`);
  say('');
  say('Then every week, from that folder:');
  say('');
  for (const line of weeklyRoutine(cli, formatType)) say(line);
  say('');
  say(`Output lands in ${displayPath(join(workspaceRoot, 'output'))}.`);
  if (provider) say(`Your API key is set, so ${bold('--generate')} works on any of those.`);
  if (formatType === 'dynasty') {
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
