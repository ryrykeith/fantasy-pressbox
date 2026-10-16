#!/usr/bin/env node
/**
 * Fantasy Pressbox command line.
 *
 * Every command follows the same shape: work out which week we mean, fetch and
 * snapshot that week, build a prompt, and either write it out for you to paste
 * into a chat or send it to a model for you.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getProvider, providerDisplayName } from './providers.mjs';
import { ESPN_COOKIE_HELP } from './init.mjs';
import {
  LEAGUE_ID_KEYS,
  loadConfig,
  loadDiskAssets,
  loadProspectBoard,
  PACKAGE_ROOT,
  describePromptOverrides,
  rankEmoji,
  rankEmojiOf,
  resolveRankingChoice,
  resolveWorkspaceRoot,
  WORKSPACE_ENV_VAR,
  workspaceConfigDir,
  workspaceIsPackage,
} from './config.mjs';
import { copyLeagueWorkspace, isLeagueWorkspace, requireLeagueWorkspace } from './workspace.mjs';
import { describeFormat, hasFutureDraftCapital, UNDETECTABLE_FORMAT_TYPES } from './format.mjs';
import { describeScoringSummary, describeUnmodelledScoring } from './scoringReport.mjs';
import { describeEliminationLedger } from './eliminationReport.mjs';
import { describeDraftOrder } from './rookieDraft.mjs';
import { describeProspectBoard } from './prospectBoard.mjs';
import { resolveWeek, captureWeek, importSavedFiles, readEliminationLedger } from './pipeline.mjs';
import { FUTURE_STOCK_TASK } from './futureStock.mjs';
import { FIVE_YEAR_PLAN_TASK } from './fiveYearPlan.mjs';
import { describeInspection, inspectLeague } from './inspect.mjs';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.mjs';
import { systemPromptOnly, taskPromptOnly } from './promptContext.mjs';
import { generate, describeProvider, detectProvider } from './generate.mjs';
import { checkPosts, looksCollapsed, stripJsonBlock } from './validate.mjs';
import { gradePredictions } from './rankingGrades.mjs';
import { createStore } from './store.mjs';
import {
  leagueFileFromWorkspace,
  leagueFileName,
  parseLeagueFile,
  serializeLeagueFile,
  workspaceFromLeagueFile,
} from './leagueFile.mjs';
import { readLeagueFolder, writeLeagueFolder } from './leagueFolder.mjs';
import { LEAGUE_JSON_LIMITS } from './lib/safeInput.mjs';
import {
  EDITIONS,
  OPTIONS,
  RECORDABLE_TASKS,
  editionForCommand,
  editionNamed,
  editionOptions,
  optionUsage,
  parseArgs,
} from './options.mjs';
import {
  openLeagueOnSurface,
  prepareEdition,
  recordEdition,
  refuseMultiWeekMatchup,
  refuseOrdinaryEditionInGuillotineLeague as refuseOrdinaryEditionFor,
  refuseSurvivalEditionWithoutEliminations as refuseSurvivalEditionFor,
  describeMultiWeekMatchup,
  teamIdentityFor,
} from './edition.mjs';

// The edition steps live in src/edition.mjs, shared with the website. These
// stay importable from here, where they used to be defined.
export {
  describeMultiWeekMatchup,
  describeQuietTransactionWeek,
  recordBlock,
  refuseEditionForProvider,
  refuseMultiWeekMatchup,
  summarizeTransactionWeek,
} from './edition.mjs';
export { parseArgs };
import { TANK_WATCH_TASK } from './tankWatch.mjs';
import { banner, cliCommand, displayPath, gettingStarted, weeklyRoutine } from './welcome.mjs';

/** The league folder's file store: the CLI's history lives under its data/. */
const fileStore = (config) => createStore({ dataDir: config.dataDir });
// The shipped prompts and defaults, read from disk; a workspace's own prompts shadow them.
const diskAssets = (config) => loadDiskAssets({ promptsDir: config.promptsDir });
/**
 * Opens the league with the folder's store and the shipped assets (prompts and
 * the bye-week table). Every command opens through this, so none can open a
 * league without the table that captureWeek needs.
 */
const openFolderLeague = (config, options = {}) =>
  openLeagueOnSurface(config, { surface: 'cli', store: fileStore(config), assets: diskAssets(config), ...options });

/**
 * This CLI as a command typed from the current folder: the installed
 * `fantasy-pressbox`, `npx fantasy-pressbox`, or node and a path, whichever
 * works for how the package got here (src/welcome.mjs). A league folder can
 * live anywhere, so advice cannot assume `node src/cli.mjs` resolves.
 */
const CLI_COMMAND = cliCommand({ packageRoot: PACKAGE_ROOT });
const INIT_COMMAND = `${CLI_COMMAND} init`;

/** Who files a reply from this command line, as a league file names its writer. */
const CLI_WRITTEN_BY = Object.freeze({ package: PACKAGE_NAME, version: PACKAGE_VERSION, surface: 'cli' });

/**
 * The same command typed from inside a league folder, for the getting-started
 * steps, which `cd` there before running anything.
 */
const LEAGUE_FOLDER_COMMAND = cliCommand({ packageRoot: PACKAGE_ROOT, from: join(homedir(), 'leagues', 'my-league') });

/**
 * The commands that build no edition, as `--help` lists them: the setup
 * commands before the editions, the rest after. Every edition's own line comes
 * from EDITIONS (src/options.mjs).
 */
const SETUP_COMMANDS = [
  ['init', 'Set up a league folder (run this first)'],
  ['doctor', 'Check that everything is configured and reachable'],
  ['migrate <folder>', 'Copy this league into a new folder; nothing is removed'],
  ['export-league [file]', "Save this league's history and settings as one league file"],
  ['import-league <file>', 'Turn a league file into a league folder'],
];
const OTHER_COMMANDS = [
  [
    'record <file>',
    "File a finished edition you pasted back from a chat (copy it with the chat's copy button, not by highlighting)",
  ],
  ['grade', "Score last week's predictions against what happened"],
  ['check <file>', "Check a file of finished posts against the league's post length limit"],
  ['fetch', 'Download and save a week of league data'],
  [
    'import-espn [--week <n>] <files>',
    [
      'ESPN leagues: import pages you saved from ESPN in your browser',
      '(run it with no files to see the addresses to save)',
    ],
  ],
];

/** The groups of editions `--help` lists, in order, each its own block. */
const EDITION_GROUPS = ['weekly', 'dynasty', 'guillotine'];

const HELP_COLUMN = 30;

/** One `--help` row: the usage, then its text in the column, on later lines when the usage is too long. */
function helpRow(usage, text) {
  const [first, ...more] = Array.isArray(text) ? text : [text];
  const indent = ' '.repeat(HELP_COLUMN + 2);
  const lines =
    usage.length < HELP_COLUMN ? [`  ${usage.padEnd(HELP_COLUMN)}${first}`] : [`  ${usage}`, `${indent}${first}`];
  return [...lines, ...more.map((line) => `${indent}${line}`)];
}

/** `--help`'s Commands block: the setup commands, every edition with a command, then the rest. */
export function describeCommands() {
  const blocks = [SETUP_COMMANDS.flatMap(([usage, text]) => helpRow(usage, text))];
  for (const group of EDITION_GROUPS) {
    blocks.push(
      EDITIONS.filter((edition) => edition.command && edition.group === group).flatMap((edition) =>
        helpRow(edition.command, edition.summary),
      ),
    );
  }
  blocks.push(OTHER_COMMANDS.flatMap(([usage, text]) => helpRow(usage, text)));
  return blocks.map((block) => block.join('\n')).join('\n\n');
}

/** `--help`'s Options block: every option OPTIONS gives a flag, in its order. */
export function describeOptions() {
  return OPTIONS.filter((option) => option.flag)
    .flatMap((option) => helpRow(optionUsage(option), option.help))
    .join('\n');
}

export function helpText(cli = CLI_COMMAND) {
  return `
Fantasy Pressbox — AI league coverage from your Sleeper data

Usage
  ${cli} <command> [options]

Each league lives in its own folder, holding its .env, config, data and
output. Run commands from inside that folder, or point at it with --workspace.

Getting started
${gettingStarted(LEAGUE_FOLDER_COMMAND).join('\n')}

Every week, from the league folder
${weeklyRoutine(LEAGUE_FOLDER_COMMAND).join('\n')}

Commands
${describeCommands()}

Options
${describeOptions()}

Examples
  ${cli} doctor --workspace ~/leagues/my-league
  ${cli} preview --week 3
  ${cli} recap --format imessage --generate
  ${cli} record output/week2.txt --task preview
  ${cli} survival-preview --week 3
  ${cli} transactions --week 3 --generate
  ${cli} tank-watch --week 9
  ${cli} future-stock --week 9 --generate
  ${cli} five-year-plan --team 3
`;
}

/**
 * What a bare run prints: the banner, then the next thing to do from here.
 * Outside a league folder that is init; inside one, the week's commands.
 */
function welcomeText(workspaceRoot) {
  const lines = ['', banner({ title: bold }), ''];
  if (isLeagueWorkspace(workspaceRoot)) {
    let formatType = null;
    try {
      formatType = loadConfig({ workspaceRoot }).leagueFormat ?? null;
    } catch {
      // A folder that does not load still gets its routine; doctor names the problem.
    }
    lines.push(`League folder: ${displayPath(workspaceRoot)}`, '', 'This week');
    lines.push(...weeklyRoutine(CLI_COMMAND, formatType));
    lines.push('', `Something not working?  ${CLI_COMMAND} doctor`);
  } else {
    lines.push(`No league here yet: ${displayPath(workspaceRoot)} has no .env.`, '', 'Getting started');
    lines.push(...gettingStarted(LEAGUE_FOLDER_COMMAND));
    lines.push('', 'Already have a league folder? Run commands from inside it, or add --workspace <folder>.');
  }
  lines.push(`Every command and option:  ${CLI_COMMAND} --help`, '');
  return lines.join('\n');
}

const say = (...parts) => console.log(...parts);
const warn = (...parts) => console.warn(...parts);
const bold = (text) => (process.stdout.isTTY ? `\x1b[1m${text}\x1b[0m` : text);

/** The league's prospect board for a draft class, from its workspace — never the package. */
function loadLeagueProspectBoard(config, draftYear) {
  return loadProspectBoard({ draftYear: Number(draftYear), configDir: workspaceConfigDir(config.workspaceRoot) });
}

/**
 * Every command that reads or writes a league starts here. The folder decides
 * the league: outside a league folder nothing runs, even with a league ID in
 * the shell, so one league's history can never be written somewhere else.
 */
function requireLeague(config) {
  requireLeagueWorkspace(config.workspaceRoot, { initCommand: INIT_COMMAND });
  if (config.leagueId) return;
  throw new Error(
    `No ${LEAGUE_ID_KEYS[config.league.provider]} found in ${join(config.workspaceRoot, '.env')}.\n` +
      `Run init to set the league up: ${INIT_COMMAND}\n` +
      'Or add the ID to .env by hand.',
  );
}

/** How a refusal names a command to run instead: this CLI, then the command. */
const cliCommandFor = (name) => `${CLI_COMMAND} ${name}`;

/**
 * The guillotine refusals (src/edition.mjs), naming this CLI's commands.
 * prepareEdition runs them before any work begins; exported for the tests.
 */
export const refuseOrdinaryEditionInGuillotineLeague = (config, task) =>
  refuseOrdinaryEditionFor(config, task, { commandFor: cliCommandFor });
export const refuseSurvivalEditionWithoutEliminations = (config, task) =>
  refuseSurvivalEditionFor(config, task, { commandFor: cliCommandFor });

function writeOutput(config, name, body) {
  mkdirSync(config.outputDir, { recursive: true });
  const path = join(config.outputDir, name);
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

/* ---------------------------------------------------------------- commands */

/**
 * Where each league setting was read from, and which shipped defaults this
 * workspace overrides — so a confusing output can be traced to a local file.
 */
function describeLocalSettings(config) {
  const { sources } = config;
  const from = (path) => (path ? `read from ${path}` : 'not found — nothing declared');
  const lines = [
    `  League settings    .env ${sources.env ? `read from ${sources.env}` : 'not found'}`,
    `                     rookie-draft.yml ${from(sources.rookieDraft)}`,
    `                     guillotine.yml ${from(sources.guillotine)}`,
    `                     rivalries.yml ${from(sources.rivalries)}`,
  ];
  const overrides = [];
  if (sources.editorialOverride) overrides.push(`config/editorial.yml (${sources.editorialOverride})`);
  if (sources.rankingsOverride) overrides.push(`config/rankings.yml (${sources.rankingsOverride})`);
  const { overridden, unmatched } = describePromptOverrides(config.promptsDir);
  for (const file of overridden) overrides.push(`prompts/${file} (${join(config.promptsDir, file)})`);
  lines.push(
    overrides.length
      ? `  Local overrides    ${overrides.join('\n                     ')}`
      : '  Local overrides    none — using the shipped defaults',
  );
  for (const file of unmatched) {
    lines.push(`                     ✗ ${join(config.promptsDir, file)} matches no shipped prompt, so it is never read`);
  }
  return lines;
}

async function commandDoctor(config) {
  say('Fantasy Pressbox check\n');
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  say(`  Node.js            ${process.versions.node} ${major >= 22 ? '✓' : '✗ needs 22 or newer'}`);
  const inLeague = isLeagueWorkspace(config.workspaceRoot);
  say(`  League ID          ${config.leagueId || `✗ not set — run ${INIT_COMMAND}`}`);
  say(`  AI provider        ${describeProvider(config.ai)}`);
  say(
    `  Workspace          ${config.workspaceRoot}` +
      (inLeague ? '' : ` ✗ not a league folder (no .env) — run ${INIT_COMMAND}`),
  );
  say(`  Data folder       ${config.dataDir}`);
  say(`  Output folder      ${config.outputDir}`);
  say(`  ${providerDisplayName(config.league.provider)} post limit ${config.editorial.output.sleeper_max_chars} characters`);

  const missingPrompts = ['system.md', 'weekly-preview.md', 'weekly-recap.md', 'weekly-power-rankings.md']
    .filter((file) => {
      const path = join(PACKAGE_ROOT, 'prompts', file);
      return !existsSync(path) || readFileSync(path, 'utf8').trim() === '';
    });
  say(`  Prompt files       ${missingPrompts.length ? `✗ empty or missing: ${missingPrompts.join(', ')}` : '✓'}`);
  for (const line of describeLocalSettings(config)) say(line);

  // Every set in config/rankings.yml was already checked to sum to 1.0 when
  // config was loaded — loadConfig throws before doctor gets this far if one
  // does not, naming the offending set and its actual sum. Reaching here means
  // that check already passed for all of them.
  const definedWeightSets = Object.keys(config.rankings.weights ?? {});
  say(
    `  Ranking weights    ✓ ${definedWeightSets.length ? `${definedWeightSets.join(', ')} each sum to 1.0` : 'no sets defined'}`,
  );

  // Outside a league folder doctor stops here even with a league ID exported
  // in the shell, as every league command does.
  if (!inLeague || !config.leagueId) return 1;

  // ESPN only: its route and, on the fetch route, which cookies are set.
  // Sleeper's output has no such lines.
  const espnRoute = describeEspnRoute(config);
  for (const line of espnRoute.lines) say(line);

  // The import route never contacts the platform: doctor reads saved files.
  if (!espnRoute.imported) say(`\n  Contacting ${providerDisplayName(config.league.provider)}...`);
  // A stale saved league page is opened here only to report it: every
  // edition refuses it (reportSavedPages).
  let ctx;
  let week;
  let source;
  try {
    ctx = await openFolderLeague(config, { allowStaleLeague: true });
    ({ week, source } = await resolveWeek({ client: ctx.client, league: ctx.league, config }));
  } catch (error) {
    // Nothing imported yet on the import route: the same addresses and notes a
    // successful open prints, with no weeks. No request is made.
    if (espnRoute.imported && error?.name === 'EspnImportError' && /has not been imported yet/.test(error.message)) {
      say(`\n  ✗ ${error.message.split('\n')[0]}`);
      for (const line of describeImportToSave(config, { season: config.league.season, weeks: [] })) say(line);
      return 1;
    }
    const explained = explainEspnError(error, config);
    if (!explained) throw error;
    say(`\n  ✗ ${explained.join('\n    ')}`);
    return 1;
  }
  const { league, teams } = ctx;
  say(`  League             ${league.name} (${league.season})`);
  say(`  Teams              ${teams.length}`);
  say(`  Format             ${describeFormat(league.format, { provider: providerDisplayName(league.provider) })}`);
  if (league.format.source === 'detected') {
    say(`                     Set LEAGUE_FORMAT in .env if that is wrong ` +
        `(${UNDETECTABLE_FORMAT_TYPES.join(', ')} can only be declared)`);
  }
  try {
    const { preset, weights } = resolveRankingChoice(config.rankings, league.format.type);
    const chosenBy = preset ? `the ${preset} preset` : 'the league\'s own weights';
    say(`  Weights for league ✓ ${chosenBy} for ${league.format.type} (${Object.keys(weights).length} factors)`);
  } catch (error) {
    say(`  Weights for league ✗ ${error.message}`);
  }
  for (const line of describeScoringSummary(league.format.scoring)) say(`  ${line}`);
  for (const line of describeUnmodelledScoring(league.format.scoring, { provider: providerDisplayName(league.provider) })) say(`  ${line}`);
  // The status report (src/inspect.mjs). The import route has no live state:
  // its week comes from the saved pages and is reported as such, never as live.
  const report = inspectLeague({
    // The fetch route's context holds no store: read the folder's own.
    store: ctx.store ?? fileStore(config),
    provider: league.provider,
    leagueId: config.leagueId,
    season: league.season,
    declaredFormat: config.leagueFormat ?? null,
    displayName: config.leagueDisplayName ?? null,
    weekOverride: config.week ?? null,
    espnRoute: league.provider === 'espn' ? config.league.route : null,
    live: espnRoute.imported ? null : { league, week, source },
    // Declared in config/rivalries.yml; checked against the teams doctor just opened.
    rivalries: config.rivalries,
    teams,
  });
  const status = describeInspection(report);
  for (const line of status.week) say(line);
  const staleLeaguePage = reportSavedPages(ctx);
  for (const line of [...status.coverage, ...status.rivalries, ...status.next]) say(line);
  const mismatch = report.problems.find((problem) => problem.code === 'league-mismatch');
  if (mismatch) say(`  League ID          ✗ ${mismatch.message}`);
  if (espnRoute.imported) for (const line of describeImportToSave(config, { season: league.season, weeks: savedWeeks(ctx) })) say(line);

  // Who is still in the league, for the formats where that changes. Built from
  // the weeks already fetched, so doctor stays a cheap check — a league with no
  // saved weeks yet simply has nothing to report.
  for (const line of describeEliminationLedger(readEliminationLedger({ ...ctx, throughWeek: week }))) {
    say(`  ${line}`);
  }

  // The declared rookie draft order, for the formats where picks carry over.
  // Sleeper cannot report this rule, so doctor says plainly what was declared
  // — or that nothing was, which means no draft order can be projected.
  if (hasFutureDraftCapital(league.format)) {
    for (const line of describeDraftOrder(config.rookieDraft.order, {
      teamCount: teams.length,
      playoffTeams: league.playoffTeams,
      rounds: config.rookieDraft.rounds ?? null,
    })) {
      say(`  ${line}`);
    }
  }

  // The prospect board for the coming rookie class, in the same formats. An
  // invalid file is reported here rather than aborting the rest of doctor.
  if (hasFutureDraftCapital(league.format)) {
    const draftYear = Number.parseInt(league.season, 10) + 1;
    try {
      for (const line of describeProspectBoard(loadLeagueProspectBoard(config, draftYear), { draftYear })) {
        say(`  ${line}`);
      }
    } catch (error) {
      say(`  Prospect board ✗ ${error.message}`);
    }
  }

  reportRankEmoji(config, teams.length);

  if (staleLeaguePage) {
    say(`\nThe league page is out of date.\n${staleLeaguePage}`);
    return 1;
  }
  if (mismatch) return 1;

  say(
    `\nEverything looks good. Try: ${CLI_COMMAND} preview` +
      (workspaceIsPackage(config.workspaceRoot) ? '' : ` --workspace ${config.workspaceRoot}`),
  );
  return 0;
}

/**
 * Doctor's lines about an ESPN league's route, or none for any other provider.
 * `imported` is true on the import route, where doctor makes no request.
 * Cookies are reported as present or missing, never by value, and only on the
 * fetch route: under import they are never read (src/config.mjs).
 */
function describeEspnRoute(config) {
  const { provider, route, secrets = {} } = config.league;
  if (provider !== 'espn') return { lines: [], imported: false };
  const lines = [];
  if (getProvider(provider).experimental) {
    lines.push(
      `  Provider           ${providerDisplayName(provider)} — experimental: built from public descriptions of an ` +
        'unofficial API, not yet checked against a live league (docs/espn-data.md)',
    );
  }
  if (route === 'fetch') {
    lines.push(
      "  ESPN route         fetch — automated access you opted into under ESPN's terms of use (Disney Terms of Use §2.B(x))",
    );
    const status = (key) => (secrets[key] ? 'present' : 'missing');
    lines.push(
      `  ESPN cookies       ESPN_S2 ${status('ESPN_S2')}, ESPN_SWID ${status('ESPN_SWID')}` +
        (secrets.ESPN_S2 ? '' : ' (needed only for a private league)'),
    );
    return { lines, imported: false };
  }
  lines.push('  ESPN route         import — doctor never contacts ESPN; it reports from the files you imported');
  return { lines, imported: true };
}

/** What to save on the import route, and which weeks are saved already. */
function savedWeeks(ctx) {
  return (ctx.provider.savedPages?.()?.weeks ?? []).map((w) => w.week);
}

function describeImportToSave(config, { season, weeks }) {
  const links = getProvider(config.league.provider).importLinks({ leagueId: config.league.id, season, weeks });
  const lines = [
    `  Imported weeks     ${weeks.length ? weeks.join(', ') : 'none yet'}`,
    "  Addresses to save  Open each in a browser signed in to ESPN and save the page in this league's folder,",
    "                     then import it. This is your own manual, personal use under ESPN's terms.",
    "                     Whether a private league's page shows on a plain signed-in visit is unverified.",
    `                     league          ${links.league}`,
  ];
  for (const { week, matchups, transactions } of links.weeks) {
    lines.push(
      `                     week ${week} matchups      ${matchups}`,
      `                     week ${week} transactions  ${transactions}`,
    );
  }
  return lines;
}

/**
 * The explanation for an ESPN failure doctor can name, as lines, or null for
 * any other error (which is then rethrown unchanged). Matched by error name and
 * status so the CLI never imports a provider's own modules.
 */
function explainEspnError(error, config) {
  if (config.league.provider !== 'espn') return null;
  if (error?.name === 'EspnError' && error.status === 401) {
    return [
      'private league: add ESPN_S2 and ESPN_SWID to .env (or refresh them if they worked before)',
      ...ESPN_COOKIE_HELP,
    ];
  }
  if (error?.name === 'EspnShapeError') {
    return [
      `ESPN's ${error.view} response does not match the documented shape: ${error.path}.`,
      'ESPN may have changed its API. See docs/espn-data.md.',
    ];
  }
  return null;
}

/**
 * Doctor's report on saved pages, for a provider with an import route (ESPN
 * under ESPN_ROUTE=import): the scoring period each saved page is from, and a
 * flag on a league page older than the latest one. A provider that fetches
 * has nothing to report.
 *
 * → the stale-league notice to print (the addresses and the command), or null.
 */
function reportSavedPages(ctx) {
  const pages = ctx.provider.savedPages?.();
  if (!pages) return null;
  const period = (p) => (p === null ? 'unknown' : `scoring period ${p}`);
  const flag = pages.stale ? ` ✗ behind the latest saved page (${period(pages.latestPeriod)})` : ' ✓';
  say(`  Saved pages        league page: ${pages.league ? `${period(pages.league.period)}${flag}` : 'not imported'}`);
  for (const { week, matchupsPeriod, transactionsPeriod } of pages.weeks) {
    say(
      `                     week ${week}: matchups ${period(matchupsPeriod)}, transactions ` +
        (transactionsPeriod === null ? 'not imported' : period(transactionsPeriod)),
    );
  }
  return pages.stale ? ctx.provider.staleLeagueNotice() : null;
}

/**
 * Shows the emoji each rank will actually print.
 *
 * Editing config/editorial.yml without being able to see the result is the
 * kind of thing people try once and give up on, so doctor prints the finished
 * table against the real number of teams in the league.
 */
function reportRankEmoji(config, teamCount) {
  const { mode, table } = rankEmojiOf(config);
  if (mode === 'none') {
    say('\n  Rank emoji         none (INCLUDE_EMOJI is false)');
    say('                     Turn them on in config/editorial.yml or .env');
    return;
  }

  const defined = Object.keys(table)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const highest = defined.length ? defined.at(-1) : 0;

  const line = Array.from({ length: teamCount }, (_, index) => {
    const rank = index + 1;
    return `${rank}${rankEmoji(config, rank)}`;
  }).join('  ');

  say(`\n  Rank emoji         ${mode}: ${line}`);
  say('                     Edit these in config/editorial.yml');

  if (highest < teamCount) {
    say(
      `                     Note: only ${highest} defined for ${teamCount} teams, ` +
        `so ranks ${highest + 1}-${teamCount} reuse the last one.`,
    );
  }
}

async function commandFetch(config, args) {
  requireLeague(config);
  const ctx = await openFolderLeague(config, { refreshPlayers: args.refreshPlayers });
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week });
  const result = await captureWeek({ ...ctx, week });
  reportCapture(result, week, ctx);
  return 0;
}

/** What fetch and import-espn print about a captured week. */
function reportCapture(result, week, ctx) {
  say(
    result.kept
      ? `Week ${week} is settled: its snapshot was saved after ${providerDisplayName(ctx.league.provider ?? 'sleeper')} ` +
        'scored it, and is kept as it is.'
      : `Week ${week} saved.`,
  );
  say(`  raw data   ${result.rawPath}`);
  say(`  snapshot   ${result.snapshotPath}`);
  const multiWeek = describeMultiWeekMatchup(result, week);
  say(
    `  status     ${
      multiWeek
        ? 'no single week\'s score (multi-week matchup period)'
        : result.played
          ? 'scores are in'
          : 'not played yet (all scores are zero)'
    }`,
  );
  if (multiWeek) say(`  ${multiWeek}`);
  if (result.transactionsUnavailable) {
    say(`  moves      unavailable: week ${week}'s transactions page was not imported`);
    const provider = getProvider(ctx.league.provider);
    if (provider.importInstructions) {
      say(`\nTo add them, save and import week ${week}'s transactions page:`);
      say(provider.importInstructions({ leagueId: ctx.config.league.id, season: ctx.config.league.season, week }));
    }
  }
}

/** Is `path` the folder `root` or inside it? Both are real paths. */
const isInsideFolder = (root, path) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

/**
 * One saved file, read for import-espn. Refused, naming the file, when it
 * does not exist, is not a file, is larger than the import reads, or lies
 * inside the package folder: saved pages are a league's own data and belong
 * in its league folder, never in the installed package.
 */
function readSavedFile(path, { maxBytes, workspaceRoot }) {
  const full = resolve(path);
  if (!existsSync(full)) throw new Error(`${path} does not exist.`);
  const real = realpathSync(full);
  if (isInsideFolder(realpathSync(PACKAGE_ROOT), real)) {
    throw new Error(
      `${path} is inside the Fantasy Pressbox package folder (${PACKAGE_ROOT}), so it was not read. ` +
        `A saved ESPN page is your league's data: keep it in the league folder (${workspaceRoot}).`,
    );
  }
  const stats = statSync(real);
  if (!stats.isFile()) throw new Error(`${path} is not a file.`);
  if (stats.size > maxBytes) {
    throw new Error(
      `${path} is larger than ${maxBytes / (1024 * 1024)} MB, so it was not read. ` +
        'A saved ESPN league or week is far smaller: check that this is the right file.',
    );
  }
  return { file: path, text: readFileSync(real, 'utf8') };
}

/**
 * Imports pages the operator saved from ESPN in their own browser (the
 * default ESPN route): the league page, and for `--week <n>` that week's
 * matchups and transactions pages. Nothing is requested from ESPN, and no
 * cookie is read. Every file is checked before any is saved, then the week
 * is captured exactly as fetch captures one.
 */
async function commandImportEspn(config, args) {
  requireLeague(config);
  const { provider, id, season, route } = config.league;
  if (provider !== 'espn') {
    throw new Error(
      `import-espn reads pages saved from ESPN, and this league folder is a ${providerDisplayName(provider)} league ` +
        '(LEAGUE_PROVIDER in .env).',
    );
  }
  if (route !== 'import') {
    throw new Error(
      'ESPN_ROUTE is fetch in .env, so this league is read from ESPN, not imported. ' +
        'To import saved pages instead, set ESPN_ROUTE=import, or remove the line (import is the default).',
    );
  }
  if (!season) throw new Error('No ESPN season configured. Set LEAGUE_SEASON in .env (a four-digit year).');
  const week = args.week === undefined ? null : args.week;
  if (week !== null && !(Number.isInteger(week) && week > 0)) {
    throw new Error('--week must be a week number (1, 2, 3, ...).');
  }

  const espn = getProvider('espn');
  const paths = args._.slice(1);
  if (paths.length === 0) {
    throw new Error(
      `Usage: ${CLI_COMMAND} import-espn [--week <n>] <saved files>\n\n` +
        espn.importInstructions({ leagueId: id, season, week }),
    );
  }

  const files = paths.map((path) => readSavedFile(path, { maxBytes: espn.importMaxBytes, workspaceRoot: config.workspaceRoot }));
  const imported = importSavedFiles(config, { store: fileStore(config), files, week });
  say('Imported from pages you saved (nothing was requested from ESPN):');
  for (const [kind, file] of Object.entries(imported.files)) say(`  ${kind.padEnd(13)}${file}`);
  if (imported.leaguePath) say(`  league saved ${imported.leaguePath}`);

  // Opened even when the league page is now behind the week pages, only to
  // say so: nothing is captured from it then (a settled snapshot is kept as
  // it is, so stale standings must never reach one).
  const ctx = await openFolderLeague(config, { allowStaleLeague: true });
  say(`\n${ctx.league.name}: ${ctx.teams.length} teams, current week ${ctx.league.currentWeek ?? 'unknown'} (the latest saved page).`);
  const stale = ctx.provider.staleLeagueNotice?.({ week: imported.week }) ?? null;
  if (stale) {
    say(`\nThe league page is out of date.\n${stale}`);
    if (imported.week !== null) {
      say(`\nWeek ${imported.week}'s pages are saved, and the week is read once the league page is imported again.`);
    }
    return 0;
  }
  if (imported.week === null) return 0;

  say('');
  const captured = await captureWeek({ ...ctx, week: imported.week });
  reportCapture(captured, imported.week, ctx);
  return 0;
}

/**
 * Previews, recaps, rankings and every other edition: the shared steps
 * (src/edition.mjs#prepareEdition) build the prompt, and the CLI writes it
 * out, then optionally has it written and files what comes back.
 */
async function commandEdition(config, args, task) {
  requireLeague(config);
  const assets = diskAssets(config);
  const prepared = await prepareEdition({
    task,
    week: args.week,
    options: editionOptions(task, args),
    settings: config,
    store: fileStore(config),
    assets,
    prospectBoardFor: (draftYear) => loadLeagueProspectBoard(config, draftYear),
    surface: 'cli',
    commandFor: cliCommandFor,
    log: { say, warn },
  });
  if (!prepared.built) {
    say(prepared.message);
    return 0;
  }
  const { week, format, prompt, context, fileStem, league, teams, store, previousRankings, tankWatchPath } = prepared;

  const promptPath = writeOutput(config, `${fileStem}-prompt.md`, prompt);
  say(`\nPrompt written to ${promptPath}`);
  if (tankWatchPath) say(`Projection saved for the next tank watch → ${tankWatchPath}`);

  if (!args.generate) {
    if (!detectProvider(config.ai)) {
      say('Open that file, copy all of it, and paste it into ChatGPT or Claude.');
    } else {
      say('Paste that file into a chat, or re-run with --generate to have it written for you.');
    }
    return 0;
  }

  if (!detectProvider(config.ai)) {
    throw new Error(
      'You asked for --generate, but no AI provider is configured.\n' +
        `Run init again (${INIT_COMMAND}) and choose Claude or ChatGPT, or drop --generate and paste\n` +
        `the prompt file into a chat instead: ${promptPath}`,
    );
  }

  say(`Generating with ${describeProvider(config.ai)}...`);
  const result = await generate({
    ai: config.ai,
    system: systemPromptOnly(context.league.format?.type, { assets }),
    user: [taskPromptOnly(task, context.league.format?.type, { assets }), '', '# LEAGUE CONTEXT', '', '```json', JSON.stringify(context, null, 2), '```'].join('\n'),
  });

  const body = stripJsonBlock(result.text);
  const outPath = writeOutput(config, `${fileStem}-${format}.txt`, body);
  say(`Posts written to ${outPath}`);

  if (prepared.recordsBlock) {
    recordEdition({ task, week, text: result.text, store, league, teams, previousRankings, from: 'generated', writtenBy: CLI_WRITTEN_BY, log: { say, warn } });
  }

  reportLengths(body, config, format, context);
  return 0;
}

function reportLengths(body, config, format, context = null) {
  if (format !== 'sleeper') return;
  const max = config.editorial.output.sleeper_max_chars;
  const report = checkPosts(body, { maxChars: max, context });
  say(`\n${report.count} post(s), limit ${max} characters.`);
  if (looksCollapsed(report.posts)) {
    warn('These posts have no blank lines, which usually means the reply was highlighted and copied.');
    warn("Copy the reply with the chat's copy button instead, and the blank lines come through.");
  }
  if (report.allOk) {
    say('All posts are within the limit.');
    return;
  }
  const tooLong = report.violations.filter((post) => post.overBy > 0);
  if (tooLong.length) {
    warn('Some posts are too long for Sleeper and were NOT shortened:');
    for (const post of tooLong) {
      warn(`  post ${post.index}: ${post.length} chars (${post.overBy} over) — ${post.firstLine}`);
    }
    warn('Edit those posts down before sending, or raise SLEEPER_POST_MAX_LENGTH in .env.');
  }
  if (report.creditMissing.length) {
    warn("FantasyCalc's terms require its credit beside its values. These posts quote values without it:");
    for (const post of report.creditMissing) warn(`  post ${post.index} — ${post.firstLine}`);
    warn(`Add "${report.creditLine}" to the end of each.`);
  }
}

/**
 * Reads back an edition you generated in a chat window and files its results.
 *
 * Without this, the copy-and-paste workflow has no memory: rankings would
 * never show movement and predictions would never be graded.
 */
async function commandRecord(config, args) {
  requireLeague(config);
  const file = args._[1];
  if (!file) throw new Error(`Usage: ${CLI_COMMAND} record <file> --task <preview|rankings> [--week <n>]`);
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);

  const task = args.task;
  if (!RECORDABLE_TASKS.includes(task ?? '')) {
    throw new Error(`Pass --task followed by one of: ${RECORDABLE_TASKS.join(', ')}.`);
  }

  const ctx = await openFolderLeague(config);
  const offset = editionNamed(task).forwardLooking ? 0 : -1;
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week, offset });

  const text = readFileSync(file, 'utf8');
  const recorded = recordEdition({
    task,
    week,
    text,
    store: ctx.store,
    league: ctx.league,
    teams: ctx.teams,
    from: 'pasted',
    writtenBy: CLI_WRITTEN_BY,
    log: { say, warn },
  });
  reportLengths(stripJsonBlock(text), config, 'sleeper');
  return recorded ? 0 : 1;
}

function commandCheck(config, args) {
  const file = args._[1];
  if (!file) throw new Error(`Usage: ${CLI_COMMAND} check <file>`);
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  // The machine-readable tail is not a post and must not be counted as one.
  reportLengths(stripJsonBlock(readFileSync(file, 'utf8')), config, 'sleeper');
  return 0;
}

async function commandGrade(config, args) {
  requireLeague(config);
  const ctx = await openFolderLeague(config);
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week, offset: -1 });
  const captured = await captureWeek({ ...ctx, week });
  refuseMultiWeekMatchup(captured, { week, edition: 'grade' });
  const saved = ctx.store.loadPredictions(ctx.league.season, week);
  const graded = gradePredictions(saved?.predictions, captured.analysis, {
    identity: teamIdentityFor(ctx),
    eliminationLedger: captured.elimination ?? null,
  });
  if (!graded) {
    say(`No saved predictions for week ${week}.`);
    say('Predictions are filed when you run preview --generate, or when you run');
    say('record on a preview you pasted back from a chat.');
    return 0;
  }
  const lastScored = ctx.league.lastScoredWeek;
  if (Number.isInteger(lastScored) && week > lastScored) {
    warn(`Week ${week} is still being played — these scores are not final.\n`);
  }

  say(`Week ${week} predictions: ${graded.correct}/${graded.total} correct (${graded.accuracy}%)\n`);
  for (const row of graded.results) {
    // An ungraded row is reported, not skipped. In a guillotine league it is
    // the ordinary Monday state — the scores are in but the chop has not been
    // processed — and a prediction that silently vanished from its own grading
    // would read as one that was never made.
    if (!row.graded) {
      say(`  · not scored yet: ${row.reason}`);
      continue;
    }
    if (row.actual_chop !== undefined) {
      say(
        `  ${row.correct ? '✓' : '✗'} called ${row.predicted_chop} for the chop; ` +
          `${row.actual_chop} went (${row.chop_source})`,
      );
      continue;
    }
    say(
      `  ${row.correct ? '✓' : '✗'} picked ${row.predicted_winner}; ` +
        `${row.team_a} ${row.actual_score_a} — ${row.team_b} ${row.actual_score_b}`,
    );
  }
  return 0;
}

/**
 * Sets up a league folder: makes the folder it is pointed at (--workspace, or
 * PRESSBOX_WORKSPACE, else the current folder) and runs the guided setup there,
 * which writes the league's .env and its data/ and output/ folders.
 */
function commandInit(args) {
  const workspaceRoot = resolveWorkspaceRoot({ flag: args.workspace, create: true });
  const result = spawnSync(process.execPath, [join(PACKAGE_ROOT, 'setup.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, [WORKSPACE_ENV_VAR]: workspaceRoot },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * Copies the league in this workspace into a new folder: its .env, league
 * config, data and output (src/workspace.mjs#copyLeagueWorkspace). Nothing
 * here is removed — the operator checks the new folder, then deletes the old
 * one by hand.
 */
function commandMigrate(config, args) {
  const destination = args._[1];
  if (!destination) {
    throw new Error(
      `Usage: ${CLI_COMMAND} migrate <folder>\n` +
        'Copies this league into <folder>, which must be new or empty. Nothing here is removed.',
    );
  }
  requireLeagueWorkspace(config.workspaceRoot, { initCommand: INIT_COMMAND });
  const target = resolve(destination);
  const copied = copyLeagueWorkspace({
    source: config.workspaceRoot,
    destination: target,
    dataDir: config.dataDir,
    outputDir: config.outputDir,
    fromPackage: workspaceIsPackage(config.workspaceRoot),
  });
  say(`Copied the league in ${config.workspaceRoot} to ${target}:`);
  for (const { what, to } of copied) say(`  ${what.padEnd(28)} → ${to}`);
  say(`\nNothing in ${config.workspaceRoot} was removed. Check the new folder first:`);
  say(`  ${CLI_COMMAND} doctor --workspace ${target}`);
  say('then run every command from there, and delete the old copies by hand once you are happy.');
  return 0;
}

/**
 * Writes this league as one league file (src/leagueFile.mjs): its history
 * under data/ and its settings from .env and config/, through the same
 * mapping the website uses. An AI key, the ESPN cookies and the other .env
 * lines a league file never holds are dropped as the .env is read.
 */
function commandExportLeague(config, args) {
  requireLeague(config);
  const { entries, unread } = readLeagueFolder({
    workspaceRoot: config.workspaceRoot,
    dataDir: config.dataDir,
    fromPackage: workspaceIsPackage(config.workspaceRoot),
  });
  const { leagueFile, skipped, ignoredEnvKeys } = leagueFileFromWorkspace(entries, { surface: 'cli' });
  const text = serializeLeagueFile(leagueFile);

  const target = resolve(args._[1] ?? join(config.outputDir, leagueFileName(leagueFile)));
  if (isInsideFolder(resolve(config.dataDir), target)) {
    throw new Error(`${target} is inside the league's data folder, which holds only its history. Choose another place.`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);

  say(`League file written to ${target} (${formatBytes(Buffer.byteLength(text))}).`);
  for (const [season, kinds] of Object.entries(leagueFile.seasons)) {
    const counts = Object.entries(kinds)
      .filter(([, files]) => Object.keys(files).length)
      .map(([kind, files]) => `${kind} ${Object.keys(files).length}`);
    say(`  ${season}: ${counts.join(', ') || 'no history'}`);
  }
  if (ignoredEnvKeys.length) {
    say(`Left out of the file from .env: ${ignoredEnvKeys.join(', ')}. A league file never holds a key or a cookie.`);
  }
  const notRead = [...new Set([...unread, ...skipped])];
  if (notRead.length) say(`Not read: ${notRead.join(', ')}`);
  return 0;
}

/**
 * Turns a league file into a league folder: the workspace (--workspace,
 * PRESSBOX_WORKSPACE or this folder) gets the .env, config files and data/
 * the file describes. Refused when the folder already holds a league, or any
 * file the import would write.
 */
function commandImportLeague(args) {
  const file = args._[1];
  if (!file) {
    throw new Error(
      `Usage: ${CLI_COMMAND} import-league <file> [--workspace <folder>]\n` +
        'Writes the league in <file> into a new league folder (this folder, or the one --workspace names).',
    );
  }
  const workspaceRoot = resolveWorkspaceRoot({ flag: args.workspace, create: true });
  if (isInsideFolder(realpathSync(PACKAGE_ROOT), realpathSync(workspaceRoot))) {
    throw new Error(
      `${workspaceRoot} is inside the Fantasy Pressbox package folder (${PACKAGE_ROOT}). ` +
        'A league lives in its own folder: name one with --workspace <folder>.',
    );
  }
  if (isLeagueWorkspace(workspaceRoot)) {
    throw new Error(
      `${workspaceRoot} is already a league folder (it has a .env). ` +
        'Import into a new or empty folder with --workspace <folder>, so no two histories are mixed.',
    );
  }

  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`${file} does not exist.`);
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error(`${file} is not a file.`);
  if (stats.size > LEAGUE_JSON_LIMITS.maxBytes) {
    throw new Error(`${file} is larger than ${formatBytes(LEAGUE_JSON_LIMITS.maxBytes)}, the most a league file may be, so it was not read.`);
  }
  const leagueFile = parseLeagueFile(readFileSync(path, 'utf8'), { name: file });
  const written = writeLeagueFolder({ workspaceRoot, entries: workspaceFromLeagueFile(leagueFile) });

  const { writtenBy, writtenAt, league } = leagueFile;
  say(`Imported the ${providerDisplayName(league.provider)} league ${league.leagueId ?? '(no league ID yet)'} into ${workspaceRoot}`);
  say(`  written by ${writtenBy.package} ${writtenBy.version} (${writtenBy.surface}) at ${writtenAt}; ${written.length} file(s).`);
  if (!league.leagueId) say(`Add the league ID to ${join(workspaceRoot, '.env')} before running anything.`);
  say(`\nCheck it with: ${CLI_COMMAND} doctor --workspace ${workspaceRoot}`);
  say('A league file never holds an AI key: add yours to .env again if you use --generate.');
  return 0;
}

/** A byte count as people read it: 812 bytes, 41.3 KB, 2.4 MB. */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (args.help) {
    say(helpText().trim());
    return 0;
  }
  if (!command) {
    say(welcomeText(resolveWorkspaceRoot({ flag: args.workspace })));
    return 0;
  }

  // Before any config is read: the folder init sets up may not exist yet, and
  // neither may the one a league file is imported into.
  if (command === 'init') return commandInit(args);
  if (command === 'import-league') return commandImportLeague(args);

  const config = loadConfig({ workspaceRoot: resolveWorkspaceRoot({ flag: args.workspace }) });

  switch (command) {
    case 'migrate':
      return commandMigrate(config, args);
    case 'export-league':
      return commandExportLeague(config, args);
    case 'doctor':
      return commandDoctor(config);
    case 'fetch':
      return commandFetch(config, args);
    case 'import-espn':
      return commandImportEspn(config, args);
    // Every command EDITIONS names (src/options.mjs); tests/options.test.mjs
    // checks this list and that one agree.
    case 'preview':
    case 'survival-preview':
    case 'recap':
    case 'chop-recap':
    case 'rankings':
    case 'survival-rankings':
    case 'preseason-rankings':
    case 'transactions':
    case TANK_WATCH_TASK:
    case FUTURE_STOCK_TASK:
    case FIVE_YEAR_PLAN_TASK:
      return commandEdition(config, args, editionForCommand(command).name);
    case 'record':
      return commandRecord(config, args);
    case 'check':
      return commandCheck(config, args);
    case 'grade':
      return commandGrade(config, args);
    default:
      throw new Error(`Unknown command "${command}". Run with --help to see the list.`);
  }
}

/**
 * Whether this file is the program being run, rather than a module a test
 * imported (to reach exports like refuseOrdinaryEditionInGuillotineLeague)
 * without wanting main() to call process.exit() out from under the runner.
 *
 * Both sides are compared as real paths. The installed `fantasy-pressbox` bin
 * is a symlink npm puts on the PATH: argv[1] is the link, while
 * import.meta.url is the file it points at, so comparing them as given made
 * the installed command print nothing and exit zero
 * (tests/installed-bin.test.mjs). argv[1] is absent under `node -e`, a REPL
 * or an embedder, and none of those is a real run.
 */
function isRunAsProgram() {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || !existsSync(entry)) return false;
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

if (isRunAsProgram()) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((error) => {
      console.error(`\nError: ${error.message}\n`);
      if (process.env.DEBUG === 'true') console.error(error.stack);
      process.exit(1);
    });
}
