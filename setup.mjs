#!/usr/bin/env node
/**
 * Interactive setup for Fantasy Pressbox.
 *
 * Written for someone who has never set up a project before. It checks the
 * things that commonly go wrong, asks for each setting one at a time in plain
 * language, checks the league ID against Sleeper before accepting it, and
 * writes .env for you.
 *
 * Safe to run more than once. Existing answers become the defaults and your
 * previous .env is backed up before anything is overwritten.
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from './src/lib/env.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(ROOT, '.env');
const MIN_NODE_MAJOR = 18;

const say = (text = '') => console.log(text);
const bold = (text) => (process.stdout.isTTY ? `\x1b[1m${text}\x1b[0m` : text);
const dim = (text) => (process.stdout.isTTY ? `\x1b[2m${text}\x1b[0m` : text);
const green = (text) => (process.stdout.isTTY ? `\x1b[32m${text}\x1b[0m` : text);
const red = (text) => (process.stdout.isTTY ? `\x1b[31m${text}\x1b[0m` : text);

function heading(text) {
  say('');
  say(bold(text));
  say('─'.repeat(Math.min(text.length, 60)));
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
      originalWrite(text.includes('\n') ? '\n' : '\u2022');
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

async function askChoice(question, choices) {
  say(question);
  choices.forEach((choice, index) => say(`  ${index + 1}) ${choice.label}`));
  while (true) {
    const answer = await ask(`Choose 1-${choices.length} ${dim('[1]')}: `);
    const index = answer === '' ? 1 : Number.parseInt(answer, 10);
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
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const dependencyCount = Object.keys(manifest.dependencies ?? {}).length;

  if (dependencyCount === 0) {
    say(green('✓ No extra packages needed'));
    return true;
  }

  const installed = existsSync(join(ROOT, 'node_modules'));
  say(installed ? 'Updating packages...' : `Installing ${dependencyCount} package(s)...`);
  const result = spawnSync('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    say(red('✗ npm install failed. Check the messages above, then run: npm install'));
    return false;
  }
  say(green('✓ Packages ready'));
  return true;
}

async function verifyLeague(leagueId) {
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
    if (response.status === 404) return { ok: false, reason: 'Sleeper has no league with that ID.' };
    if (!response.ok) return { ok: false, reason: `Sleeper replied with HTTP ${response.status}.` };
    const league = await response.json();
    if (!league?.league_id) return { ok: false, reason: 'Sleeper returned an empty result.' };
    return { ok: true, league };
  } catch (error) {
    return { ok: false, reason: `Could not reach Sleeper: ${error.message}` };
  }
}

/** Accepts a bare ID or a pasted Sleeper URL. */
function extractLeagueId(input) {
  const match = /(\d{6,})/.exec(input ?? '');
  return match ? match[1] : '';
}

/* ------------------------------------------------------------------- write */

function renderEnv(values) {
  const template = readFileSync(join(ROOT, '.env.example'), 'utf8');
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

/* -------------------------------------------------------------------- main */

async function main() {
  say('');
  say(bold('  Fantasy Pressbox setup'));
  say(dim('  AI league coverage from your Sleeper data'));
  say('');
  say('  This asks a few questions and writes your settings file.');
  say('  Press Enter to accept the value shown in brackets.');

  heading('1. Checking your computer');
  if (!checkNode()) return 1;
  if (!checkPackages()) return 1;

  const existing = loadEnvFile(ENV_PATH);
  if (Object.keys(existing).length) {
    say(dim(`  Found an existing .env — your current answers are the defaults.`));
  }

  heading('2. Your Sleeper league');
  say('Open your league on sleeper.com and copy the address from the browser bar.');
  say(dim('  Example: https://sleeper.com/leagues/1234567890123456789/team'));
  say('You can paste the whole address — the ID will be picked out of it.');
  say('');

  let leagueId = existing.SLEEPER_LEAGUE_ID ?? '';
  let leagueName = null;
  while (true) {
    const answer = await askWithDefault('Sleeper league ID or URL', leagueId);
    const candidate = extractLeagueId(answer);
    if (!candidate) {
      say(red("  That doesn't contain a league ID. It should be a long run of digits."));
      continue;
    }
    say(dim('  Checking with Sleeper...'));
    const result = await verifyLeague(candidate);
    if (!result.ok) {
      say(red(`  ${result.reason}`));
      if (!(await askYesNo('  Try a different ID?', true))) return 1;
      continue;
    }
    leagueId = candidate;
    leagueName = result.league.name;
    const teams = result.league.settings?.num_teams ?? '?';
    say(green(`  ✓ Found "${leagueName}" — ${teams} teams, ${result.league.season} season`));
    break;
  }

  const displayName = await askWithDefault(
    'What should the publication call your league',
    existing.LEAGUE_DISPLAY_NAME || leagueName || '',
  );

  heading('3. Writing the posts');
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
  const provider = await askChoice('Which do you want?', [
    { label: `Paste it myself — no API key${!currentProvider ? dim(' (current)') : ''}`, value: '' },
    { label: `Claude (Anthropic API key)${currentProvider === 'anthropic' ? dim(' (current)') : ''}`, value: 'anthropic' },
    { label: `ChatGPT (OpenAI API key)${currentProvider === 'openai' ? dim(' (current)') : ''}`, value: 'openai' },
  ]);

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

  heading('4. Style');
  const tone = await askChoice('How should the writing sound?', [
    { label: 'Humorous — analytical, dry, willing to roast people', value: 'humorous' },
    { label: 'Analytical — straight football analysis, light on jokes', value: 'analytical' },
    { label: 'Unhinged — maximum pettiness', value: 'unhinged' },
  ]);

  const maxChars = await askWithDefault(
    'Longest single Sleeper post, in characters',
    existing.SLEEPER_POST_MAX_LENGTH || '900',
  );

  heading('5. Saving');
  const values = {
    SLEEPER_LEAGUE_ID: leagueId,
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

  if (existsSync(ENV_PATH)) {
    const backup = `${ENV_PATH}.backup`;
    copyFileSync(ENV_PATH, backup);
    say(dim(`  Previous settings backed up to .env.backup`));
  }
  writeFileSync(ENV_PATH, renderEnv(values));
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  mkdirSync(join(ROOT, 'output'), { recursive: true });
  say(green('✓ Settings saved to .env'));
  say(dim('  This file holds your keys and is never committed to git.'));

  heading('Done');
  say('Try these, in order:');
  say('');
  say(`  ${bold('node src/cli.mjs doctor')}     check everything is working`);
  say(`  ${bold('node src/cli.mjs preview')}    build this week's matchup previews`);
  say(`  ${bold('node src/cli.mjs recap')}      build last week's recap`);
  say(`  ${bold('node src/cli.mjs rankings')}   build the power rankings`);
  say('');
  say('Output lands in the "output" folder.');
  if (!provider) {
    say('Open the newest file there, copy all of it, and paste it into ChatGPT or Claude.');
  } else {
    say(`Add ${bold('--generate')} to any of those to have the posts written for you.`);
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
          'Run it directly in a terminal so it can ask you:  npm run setup\n',
      );
      process.exit(1);
    }
    console.error(red(`\nSetup failed: ${error.message}\n`));
    process.exit(1);
  });
