/**
 * Assembles the package handed to the language model.
 *
 * A prompt is three things, in this order:
 *   1. system.md            — who the publication is and what it may not do
 *   2. prompts/<task>.md    — what this particular edition must contain
 *   3. a JSON context block — the only facts that exist
 *
 * The JSON block is authoritative. If a number is not in it, the model has no
 * business printing that number. Keeping facts in structured form rather than
 * prose is what makes that rule enforceable.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const TASK_PROMPTS = {
  'preseason-rankings': 'preseason-power-rankings.md',
  rankings: 'weekly-power-rankings.md',
  preview: 'weekly-preview.md',
  recap: 'weekly-recap.md',
  postseason: 'postseason-power-rankings.md',
};

export const TASKS = Object.keys(TASK_PROMPTS);

function readPrompt(file) {
  const path = join(ROOT, 'prompts', file);
  if (!existsSync(path)) throw new Error(`Missing prompt file: prompts/${file}`);
  const text = readFileSync(path, 'utf8').trim();
  if (!text) throw new Error(`Prompt file prompts/${file} is empty.`);
  return text;
}

/**
 * Players are written as one compact line each rather than as objects.
 *
 * A 12-team dynasty league is around 400 players. Spelling each one out as a
 * pretty-printed JSON object turns the prompt into something too large to
 * paste into a chat window and expensive to send to an API, without telling
 * the model anything the line below does not.
 */
export function describePlayer(id, player) {
  if (!player) return `Unknown player ${id}`;
  const name =
    player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ') || id;
  const details = [player.position, player.team || 'FA', player.age ? `age ${player.age}` : null]
    .filter(Boolean)
    .join(', ');
  const injury = player.injury_status ? ` [${player.injury_status}]` : '';
  return `${name} (${details})${injury}`;
}

/** e.g. "QB Josh Allen (BUF) 35.66" */
function describeStarter(entry) {
  const where = entry.nflTeam ? ` (${entry.nflTeam})` : '';
  const injury = entry.injuryStatus ? ` [${entry.injuryStatus}]` : '';
  return `${entry.slot} ${entry.name}${where}${injury} ${entry.points}`;
}

function describeBench(entry) {
  const where = entry.nflTeam ? ` (${entry.nflTeam})` : '';
  return `${entry.position ?? '?'} ${entry.name}${where} ${entry.points}`;
}

/** Slimmed team view: enough to judge a roster, small enough to send. */
function rosterView(team, players) {
  const describe = (id) => describePlayer(id, players[id]);
  const taxi = new Set(team.taxiIds || []);
  const reserve = new Set(team.reserveIds || []);
  return {
    team: team.name,
    manager: team.manager,
    record: `${team.record.wins}-${team.record.losses}${team.record.ties ? `-${team.record.ties}` : ''}`,
    pointsFor: team.seasonPointsFor,
    pointsAgainst: team.seasonPointsAgainst,
    potentialPoints: team.seasonPotentialPoints,
    roster: team.playerIds.filter((id) => !taxi.has(id) && !reserve.has(id)).map(describe),
    taxiSquad: [...taxi].map(describe),
    injuredReserve: [...reserve].map(describe),
  };
}

/** A played game, flattened into lines instead of nested objects. */
function gameView(game) {
  return {
    winner: game.winner,
    loser: game.loser,
    margin: game.margin,
    teams: game.teams.map((side) => ({
      team: side.team,
      manager: side.manager,
      points: side.points,
      record: side.record ? `${side.record.wins}-${side.record.losses}` : null,
      potentialPoints: side.potentialPoints,
      lineupEfficiency: side.lineupEfficiency,
      starters: side.starters.map(describeStarter),
      bestBenchPerformances: side.benchHighlights.map(describeBench),
      bestPossibleLineup: side.optimalLineup
        .filter((slot) => slot.name)
        .map((slot) => `${slot.slot} ${slot.name} ${slot.points}`),
    })),
  };
}

function editorialView(config) {
  return {
    tone: config.editorial.tone,
    roastIntensity: config.editorial.roast_intensity,
    rankingEmoji: config.editorial.ranking_emoji,
    sleeperMaxChars: config.editorial.output.sleeper_max_chars,
    includeEmoji: config.editorial.output.include_emoji,
    rankingWeights: config.rankings.weights,
    movementGuidance: config.rankings.weekly,
    bannedPhrases: config.editorial.banned_phrases ?? [],
    awards: config.editorial.awards ?? {},
  };
}

/**
 * @param {object} input
 * @param {'preseason-rankings'|'rankings'|'preview'|'recap'|'postseason'} input.task
 */
export function buildContext({
  task,
  config,
  league,
  teams,
  players,
  week,
  weekAnalysis = null,
  upcomingAnalysis = null,
  priorWeekAnalysis = null,
  previousRankings = null,
  gradedPredictions = null,
  transactions = null,
  format = 'sleeper',
}) {
  const context = {
    task,
    generatedAt: new Date().toISOString(),
    outputFormat: format,
    league: {
      name: config.leagueDisplayName || league.name,
      season: league.season,
      teamCount: teams.length,
      status: league.status,
      startingSlots: league.startingSlots,
      benchSlots: league.benchSlots,
      taxiSlots: league.taxiSlots,
      format: league.format,
      playoffTeams: league.playoffTeams,
      playoffWeekStart: league.playoffWeekStart,
    },
    editorial: editorialView(config),
    week,
  };

  // Rankings editions judge rosters, so they get the full roster picture.
  if (task === 'preseason-rankings' || task === 'rankings' || task === 'postseason') {
    context.teams = teams.map((team) => rosterView(team, players));
  } else {
    context.standings = teams
      .slice()
      .sort(
        (a, b) =>
          b.record.wins - a.record.wins ||
          b.seasonPointsFor - a.seasonPointsFor,
      )
      .map((team) => ({
        team: team.name,
        manager: team.manager,
        record: `${team.record.wins}-${team.record.losses}`,
        pointsFor: team.seasonPointsFor,
        pointsAgainst: team.seasonPointsAgainst,
      }));
  }

  if (previousRankings) {
    context.previousRankings = {
      label: previousRankings.label ?? null,
      publishedFor: previousRankings.week ?? null,
      rankings: (previousRankings.rankings || []).map((entry) => ({
        rank: entry.rank,
        team: entry.team,
      })),
    };
  }

  // A preview is about games that have not happened. It still needs to know
  // who is playing whom — Sleeper publishes the pairings before kickoff — but
  // it must not be shown scores, which at this point are zeros or partials.
  if (upcomingAnalysis) {
    context.upcomingMatchups = upcomingAnalysis.games.map((game) => ({
      matchupId: game.matchupId,
      teams: game.teams.map((side) => ({
        team: side.team,
        manager: side.manager,
        record: side.record ? `${side.record.wins}-${side.record.losses}` : null,
      })),
    }));
    if (upcomingAnalysis.unpairedRosterIds?.length) {
      context.unpairedTeams = upcomingAnalysis.unpairedRosterIds;
    }
  }

  if (weekAnalysis) {
    context.thisWeek = {
      week: weekAnalysis.week,
      games: weekAnalysis.games.map(gameView),
      scoringOrder: weekAnalysis.scoringOrder,
      awardFacts: weekAnalysis.awards,
    };
  }

  if (priorWeekAnalysis) {
    context.previousWeek = {
      week: priorWeekAnalysis.week,
      games: priorWeekAnalysis.games.map((game) => ({
        winner: game.winner,
        loser: game.loser,
        margin: game.margin,
        teams: game.teams.map((t) => ({
          team: t.team,
          points: t.points,
          potentialPoints: t.potentialPoints,
          lineupEfficiency: t.lineupEfficiency,
        })),
      })),
      awardFacts: priorWeekAnalysis.awards,
    };
  }

  if (gradedPredictions) context.previousPredictions = gradedPredictions;
  if (transactions?.length) context.transactions = transactions;

  context.unavailable = describeMissingContext({ task, context, week });

  return context;
}

/**
 * States plainly what this edition does NOT know.
 *
 * A first-ever ranking has nothing to measure movement against, and a week 1
 * preview has no prior results. Left to infer that from an absent key, a model
 * will happily print "↑2" anyway — inventing exactly the kind of fact this
 * project refuses to invent. So absence is made explicit and instructions are
 * attached to it.
 */
function describeMissingContext({ task, context, week }) {
  const missing = [];
  const isRanking =
    task === 'rankings' || task === 'preseason-rankings' || task === 'postseason';

  if (isRanking && !context.previousRankings) {
    missing.push({
      field: 'previousRankings',
      why: 'No earlier ranking has been published, so this is the first edition.',
      instruction:
        'Print no movement arrows and no previous ranks. Do not write ↑, ↓ or —. ' +
        'Say in the opening that this is the first edition and there is nothing to move from.',
    });
  }

  if (task === 'preview' && !context.previousWeek) {
    missing.push({
      field: 'previousWeek',
      why:
        week <= 1
          ? 'This is the first week of the season, so no games have been played.'
          : 'No results for the previous week were available.',
      instruction:
        'Do not describe how any team performed last week and do not cite any score. ' +
        'Base the previews on rosters, records and league format only.',
    });
  }

  if (task === 'recap' && !context.previousPredictions) {
    missing.push({
      field: 'previousPredictions',
      why: 'No prediction was recorded for this week.',
      instruction:
        'Do not claim to have predicted anything, and do not grade yourself. ' +
        'Skip the self-grading section entirely rather than inventing a record.',
    });
  }

  if (!context.transactions) {
    missing.push({
      field: 'transactions',
      why: 'No completed transactions were found for this week.',
      instruction: 'Do not mention trades, waiver claims or free-agent moves.',
    });
  }

  return missing;
}

/** The complete text to paste into a chat, or send to an API. */
export function buildPrompt({ task, context }) {
  const file = TASK_PROMPTS[task];
  if (!file) throw new Error(`Unknown task "${task}". Known tasks: ${TASKS.join(', ')}`);

  return [
    readPrompt('system.md'),
    '',
    '---',
    '',
    readPrompt(file),
    '',
    '---',
    '',
    '# LEAGUE CONTEXT',
    '',
    'The JSON below is the complete and authoritative record of this league.',
    'Every score, name, record and roster you use must come from it.',
    'If something you want to say is not supported here, do not say it.',
    '',
    'Read the `unavailable` list first. It names the things this edition does',
    'not know. Each entry carries an instruction; follow it exactly. Do not',
    'estimate, infer or invent anything listed there, however natural it would',
    'feel to include it.',
    '',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
  ].join('\n');
}

export function systemPromptOnly() {
  return readPrompt('system.md');
}

export function taskPromptOnly(task) {
  return readPrompt(TASK_PROMPTS[task]);
}
