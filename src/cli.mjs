#!/usr/bin/env node
/**
 * Fantasy Pressbox command line.
 *
 * Every command follows the same shape: work out which week we mean, fetch and
 * snapshot that week, build a prompt, and either write it out for you to paste
 * into a chat or send it to a model for you.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, rankEmoji, resolveRankingWeights, ROOT } from './config.mjs';
import { describeFormat, UNDETECTABLE_FORMAT_TYPES } from './format.mjs';
import { describeScoringSummary, describeUnmodelledScoring } from './scoringReport.mjs';
import { openLeague, resolveWeek, captureWeek } from './pipeline.mjs';
import { normalizeTransactions, normalizeFutureDraftCapital } from './sleeper/normalize.mjs';
import { buildContext, buildPrompt, systemPromptOnly, taskPromptOnly, describePlayer } from './promptContext.mjs';
import { generate, describeProvider, detectProvider } from './generate.mjs';
import { checkPosts, extractJsonBlock, stripJsonBlock } from './validate.mjs';
import { gradePredictions, withMovement, movementLabel } from './store.mjs';

const HELP = `
Fantasy Pressbox — AI league coverage from your Sleeper data

  npm run setup                 Set the project up (run this first)

  node src/cli.mjs <command> [options]

Commands
  doctor                        Check that everything is configured and reachable
  fetch                         Download and save a week of league data
  preview                       Build the weekly matchup previews
  recap                         Build the weekly recap and awards
  rankings                      Build the weekly power rankings
  preseason-rankings            Build preseason rankings (ignores all results)
  record <file>                 File a finished edition you pasted back from a chat
  check <file>                  Check a file of finished posts against the length limit
  grade                         Score last week's predictions against what happened

Options
  --week <n>                    Which week to work on (default: worked out from Sleeper)
  --format <sleeper|imessage>   Who the output is for (default: sleeper)
  --task <name>                 Which edition a recorded file is (used with record)
  --generate                    Call the AI provider in .env and write finished posts
  --refresh-players             Re-download the NFL player list instead of using the cache
  --help                        Show this message

Examples
  node src/cli.mjs doctor
  node src/cli.mjs preview --week 3
  node src/cli.mjs recap --format imessage --generate
  node src/cli.mjs record output/week2.txt --task preview
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--generate') args.generate = true;
    else if (token === '--refresh-players') args.refreshPlayers = true;
    else if (token === '--week') args.week = Number.parseInt(argv[++i], 10);
    else if (token === '--format') args.format = argv[++i];
    else if (token === '--task') args.task = argv[++i];
    else if (token.startsWith('--')) throw new Error(`Unknown option "${token}". Try --help.`);
    else args._.push(token);
  }
  return args;
}

const say = (...parts) => console.log(...parts);
const warn = (...parts) => console.warn(...parts);

function requireLeagueId(config) {
  if (config.leagueId) return;
  throw new Error(
    'No SLEEPER_LEAGUE_ID found.\n' +
      'Run `npm run setup` to create your .env file, or add the ID to .env by hand.',
  );
}

function writeOutput(config, name, body) {
  mkdirSync(config.outputDir, { recursive: true });
  const path = join(config.outputDir, name);
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

/* ---------------------------------------------------------------- commands */

async function commandDoctor(config) {
  say('Fantasy Pressbox check\n');
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  say(`  Node.js            ${process.versions.node} ${major >= 18 ? '✓' : '✗ needs 18 or newer'}`);
  say(`  League ID          ${config.leagueId || '✗ not set — run npm run setup'}`);
  say(`  AI provider        ${describeProvider(config.ai)}`);
  say(`  Data folder        ${config.dataDir}`);
  say(`  Output folder      ${config.outputDir}`);
  say(`  Sleeper post limit ${config.editorial.output.sleeper_max_chars} characters`);

  const missingPrompts = ['system.md', 'weekly-preview.md', 'weekly-recap.md', 'weekly-power-rankings.md']
    .filter((file) => {
      const path = join(ROOT, 'prompts', file);
      return !existsSync(path) || readFileSync(path, 'utf8').trim() === '';
    });
  say(`  Prompt files       ${missingPrompts.length ? `✗ empty or missing: ${missingPrompts.join(', ')}` : '✓'}`);

  // Every set in config/rankings.yml was already checked to sum to 1.0 when
  // config was loaded — loadConfig throws before doctor gets this far if one
  // does not, naming the offending set and its actual sum. Reaching here means
  // that check already passed for all of them.
  const definedWeightSets = Object.keys(config.rankings.weights ?? {});
  say(
    `  Ranking weights    ✓ ${definedWeightSets.length ? `${definedWeightSets.join(', ')} each sum to 1.0` : 'no sets defined'}`,
  );

  if (!config.leagueId) return 1;

  say('\n  Contacting Sleeper...');
  const { league, teams, client } = await openLeague(config);
  const { week, source } = await resolveWeek({ client, league, config });
  say(`  League             ${league.name} (${league.season})`);
  say(`  Teams              ${teams.length}`);
  say(`  Format             ${describeFormat(league.format)}`);
  if (league.format.source === 'detected') {
    say(`                     Set LEAGUE_FORMAT in .env if that is wrong ` +
        `(${UNDETECTABLE_FORMAT_TYPES.join(', ')} can only be declared)`);
  }
  try {
    const weights = resolveRankingWeights(config.rankings, league.format.type);
    say(`  Weights for league ✓ using the ${league.format.type} set (${Object.keys(weights).length} factors)`);
  } catch (error) {
    say(`  Weights for league ✗ ${error.message}`);
  }
  for (const line of describeScoringSummary(league.format.scoring)) say(`  ${line}`);
  for (const line of describeUnmodelledScoring(league.format.scoring)) say(`  ${line}`);
  say(`  Current week       ${week} (from ${source})`);

  reportRankEmoji(config, teams.length);

  say('\nEverything looks good. Try: node src/cli.mjs preview');
  return 0;
}

/**
 * Shows the emoji each rank will actually print.
 *
 * Editing config/editorial.yml without being able to see the result is the
 * kind of thing people try once and give up on, so doctor prints the finished
 * table against the real number of teams in the league.
 */
function reportRankEmoji(config, teamCount) {
  if (!config.editorial.output.include_emoji) {
    say('\n  Rank emoji         off (INCLUDE_EMOJI is false)');
    say('                     Turn them on in config/editorial.yml or .env');
    return;
  }

  const table = config.editorial.ranking_emoji || {};
  const defined = Object.keys(table)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const highest = defined.length ? defined.at(-1) : 0;

  const line = Array.from({ length: teamCount }, (_, index) => {
    const rank = index + 1;
    return `${rank}${rankEmoji(config, rank)}`;
  }).join('  ');

  say(`\n  Rank emoji         ${line}`);
  say('                     Edit these in config/editorial.yml');

  if (highest < teamCount) {
    say(
      `                     Note: only ${highest} defined for ${teamCount} teams, ` +
        `so ranks ${highest + 1}-${teamCount} reuse the last one.`,
    );
  }
}

async function commandFetch(config, args) {
  requireLeagueId(config);
  const ctx = await openLeague(config, { refreshPlayers: args.refreshPlayers });
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week });
  const result = await captureWeek({ ...ctx, week });
  say(`Week ${week} saved.`);
  say(`  raw data   ${result.rawPath}`);
  say(`  snapshot   ${result.snapshotPath}`);
  say(`  status     ${result.played ? 'scores are in' : 'not played yet (all scores are zero)'}`);
  return 0;
}

/**
 * Previews, recaps and rankings differ only in which week they are about and
 * which history they need, so they share one path.
 */
async function commandEdition(config, args, task) {
  requireLeagueId(config);
  const format = args.format || 'sleeper';
  if (!['sleeper', 'imessage'].includes(format)) {
    throw new Error(`--format must be "sleeper" or "imessage", got "${format}".`);
  }

  const ctx = await openLeague(config, { refreshPlayers: args.refreshPlayers });
  const { league, teams, players, store, client, tradedPicks } = ctx;
  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));

  const futureDraftCapital = normalizeFutureDraftCapital({
    tradedPicks,
    league,
    teamsByRosterId,
    roundsPerDraft: league.draftRounds,
  });

  // A preview looks at the week about to be played; a recap and its rankings
  // look at the week that just finished.
  const offset = task === 'preview' ? 0 : -1;
  const { week, source } = await resolveWeek({ client, league, config, requested: args.week, offset });
  say(`Building ${task} for week ${week} (week chosen from ${source}).`);

  let weekAnalysis = null;
  let upcomingAnalysis = null;
  let priorWeekAnalysis = null;
  let transactions = null;
  let gradedPredictions = null;

  if (task === 'preseason-rankings') {
    say('Preseason edition: regular-season results are deliberately excluded.');
  } else {
    const captured = await captureWeek({ ...ctx, week });
    transactions = normalizeTransactions(captured.transactions, {
      teamsByRosterId,
      players,
      describePlayer,
      league,
    });

    if (task === 'preview') {
      // The week has not been played, so the preview gets the pairings plus
      // last week's results — never this week's partial scores.
      upcomingAnalysis = captured.analysis;
      if (captured.played) {
        warn(`Note: week ${week} already has scores. A preview may read strangely.`);
      }
      if (week > 1) {
        const prior = await captureWeek({ ...ctx, week: week - 1 });
        priorWeekAnalysis = prior.analysis;
      }
    } else {
      if (!captured.played) {
        warn(`Week ${week} has no scores yet. Re-run once the games are final.`);
      }
      weekAnalysis = captured.analysis;
      const saved = store.loadPredictions(league.season, week);
      gradedPredictions = gradePredictions(saved?.predictions, captured.analysis);
      if (gradedPredictions) {
        say(`Grading week ${week} predictions: ${gradedPredictions.correct}/${gradedPredictions.total} correct.`);
      }
    }
  }

  const previousRankings =
    task === 'preseason-rankings' ? null : store.loadPreviousRankings(league.season, week);
  if (previousRankings) {
    say(`Measuring movement against "${previousRankings.label ?? 'previous'}" rankings.`);
  }

  const context = buildContext({
    task,
    config,
    league,
    teams,
    players,
    week,
    weekAnalysis,
    upcomingAnalysis,
    priorWeekAnalysis,
    previousRankings,
    gradedPredictions,
    transactions,
    futureDraftCapital,
    format,
  });

  const prompt = buildPrompt({ task, context });
  const base =
    task === 'preseason-rankings'
      ? `${league.season}-preseason-rankings`
      : `${league.season}-week${String(week).padStart(2, '0')}-${task}`;
  const promptPath = writeOutput(config, `${base}-prompt.md`, prompt);
  say(`\nPrompt written to ${promptPath}`);

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
        'Run `npm run setup` and choose Claude or ChatGPT, or drop --generate and paste\n' +
        `the prompt file into a chat instead: ${promptPath}`,
    );
  }

  say(`Generating with ${describeProvider(config.ai)}...`);
  const result = await generate({
    ai: config.ai,
    system: systemPromptOnly(),
    user: [taskPromptOnly(task), '', '# LEAGUE CONTEXT', '', '```json', JSON.stringify(context, null, 2), '```'].join('\n'),
  });

  const body = stripJsonBlock(result.text);
  const outPath = writeOutput(config, `${base}-${format}.txt`, body);
  say(`Posts written to ${outPath}`);

  const block = extractJsonBlock(result.text);
  recordBlock({ store, league, week, task, block, previousRankings, say });

  reportLengths(body, config, format);
  return 0;
}

/**
 * Files the machine-readable tail of an edition.
 *
 * Previews end with their predictions and ranking editions end with their
 * order. Saving them is what lets a later edition grade a prediction or print
 * "↑2" without anyone re-typing anything.
 */
function recordBlock({ store, league, week, task, block, previousRankings, say }) {
  if (!Array.isArray(block) || block.length === 0) {
    say('No machine-readable block found in the output — nothing recorded for next week.');
    return false;
  }

  if (task === 'preview') {
    const path = store.savePredictions(league.season, week, block);
    say(`Recorded ${block.length} predictions → ${path}`);
    say("Next week's recap will grade them.");
    return true;
  }

  if (task === 'rankings' || task === 'preseason-rankings' || task === 'postseason') {
    const label =
      task === 'preseason-rankings' ? 'preseason' : task === 'postseason' ? 'final' : `week-${week}`;
    const ranked = withMovement(
      block
        .filter((entry) => entry && entry.team)
        .map((entry, index) => ({ rank: Number(entry.rank) || index + 1, team: String(entry.team) }))
        .sort((a, b) => a.rank - b.rank),
      previousRankings ?? store.loadPreviousRankings(league.season, week),
    );
    const path = store.saveRankings(league.season, label, {
      season: String(league.season),
      label,
      week: task === 'rankings' ? week : null,
      publishedAt: new Date().toISOString(),
      rankings: ranked,
    });
    say(`Recorded ${ranked.length} rankings → ${path}`);
    for (const entry of ranked) {
      say(`  ${String(entry.rank).padStart(2)}. ${entry.team} ${movementLabel(entry.movement)}`);
    }
    return true;
  }

  say(`Nothing to record for a ${task} edition.`);
  return false;
}

function reportLengths(body, config, format) {
  if (format !== 'sleeper') return;
  const max = config.editorial.output.sleeper_max_chars;
  const report = checkPosts(body, { maxChars: max });
  say(`\n${report.count} post(s), limit ${max} characters.`);
  if (report.allOk) {
    say('All posts are within the limit.');
    return;
  }
  warn('Some posts are too long for Sleeper and were NOT shortened:');
  for (const post of report.violations) {
    warn(`  post ${post.index}: ${post.length} chars (${post.overBy} over) — ${post.firstLine}`);
  }
  warn('Edit those posts down before sending, or raise SLEEPER_POST_MAX_LENGTH in .env.');
}

/**
 * Reads back an edition you generated in a chat window and files its results.
 *
 * Without this, the copy-and-paste workflow has no memory: rankings would
 * never show movement and predictions would never be graded.
 */
async function commandRecord(config, args) {
  requireLeagueId(config);
  const file = args._[1];
  if (!file) throw new Error('Usage: node src/cli.mjs record <file> --task <preview|rankings> [--week <n>]');
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);

  const task = args.task;
  if (!['preview', 'rankings', 'preseason-rankings', 'postseason'].includes(task ?? '')) {
    throw new Error('Pass --task preview, rankings, preseason-rankings or postseason.');
  }

  const ctx = await openLeague(config);
  const offset = task === 'preview' ? 0 : -1;
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week, offset });

  const text = readFileSync(file, 'utf8');
  const block = extractJsonBlock(text);
  if (!block) {
    throw new Error(
      'No ```json block found at the end of that file.\n' +
        'Copy the whole reply from the chat, including the JSON block after the last %%%.',
    );
  }

  say(`Recording ${task} for week ${week}.`);
  const recorded = recordBlock({
    store: ctx.store,
    league: ctx.league,
    week,
    task,
    block,
    previousRankings: null,
    say,
  });
  reportLengths(stripJsonBlock(text), config, 'sleeper');
  return recorded ? 0 : 1;
}

function commandCheck(config, args) {
  const file = args._[1];
  if (!file) throw new Error('Usage: node src/cli.mjs check <file>');
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  // The machine-readable tail is not a post and must not be counted as one.
  reportLengths(stripJsonBlock(readFileSync(file, 'utf8')), config, 'sleeper');
  return 0;
}

async function commandGrade(config, args) {
  requireLeagueId(config);
  const ctx = await openLeague(config);
  const { week } = await resolveWeek({ ...ctx, config, requested: args.week, offset: -1 });
  const captured = await captureWeek({ ...ctx, week });
  const saved = ctx.store.loadPredictions(ctx.league.season, week);
  const graded = gradePredictions(saved?.predictions, captured.analysis);
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
    if (!row.graded) continue;
    say(
      `  ${row.correct ? '✓' : '✗'} picked ${row.predicted_winner}; ` +
        `${row.team_a} ${row.actual_score_a} — ${row.team_b} ${row.actual_score_b}`,
    );
  }
  return 0;
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (args.help || !command) {
    say(HELP.trim());
    return 0;
  }

  const config = loadConfig();

  switch (command) {
    case 'doctor':
      return commandDoctor(config);
    case 'fetch':
      return commandFetch(config, args);
    case 'preview':
      return commandEdition(config, args, 'preview');
    case 'recap':
      return commandEdition(config, args, 'recap');
    case 'rankings':
      return commandEdition(config, args, 'rankings');
    case 'preseason-rankings':
      return commandEdition(config, args, 'preseason-rankings');
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

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(`\nError: ${error.message}\n`);
    if (process.env.DEBUG === 'true') console.error(error.stack);
    process.exit(1);
  });
