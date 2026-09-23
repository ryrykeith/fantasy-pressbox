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
import { ROOT, resolveRankingWeights } from './config.mjs';
import { hasMatchups } from './format.mjs';

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

/**
 * One team's week, flattened into lines instead of nested objects.
 *
 * `record` is a head-to-head fact — wins are won against somebody — so a format
 * that plays no matchups does not get one, and cannot cite one.
 */
function teamWeekView(side, { includeRecord = true } = {}) {
  return {
    team: side.team,
    manager: side.manager,
    points: side.points,
    ...(includeRecord
      ? { record: side.record ? `${side.record.wins}-${side.record.losses}` : null }
      : {}),
    potentialPoints: side.potentialPoints,
    lineupEfficiency: side.lineupEfficiency,
    starters: side.starters.map(describeStarter),
    bestBenchPerformances: side.benchHighlights.map(describeBench),
    bestPossibleLineup: side.optimalLineup
      .filter((slot) => slot.name)
      .map((slot) => `${slot.slot} ${slot.name} ${slot.points}`),
  };
}

/** A played game, flattened into lines instead of nested objects. */
function gameView(game) {
  return {
    winner: game.winner,
    loser: game.loser,
    margin: game.margin,
    teams: game.teams.map((side) => teamWeekView(side)),
  };
}

/** The plain-English name of a position, for prose the model will echo. */
const POSITION_LABEL = { RB: 'running back', WR: 'wide receiver', TE: 'tight end' };

/**
 * The kind of player a reception premium actually rewards at each position.
 *
 * "An every-down tight end" and "a pass-catching running back" are the players
 * a premium makes valuable; "a high-volume TE" is a description of a statistic.
 * The first tells a model what to look for on a roster, the second does not.
 */
const PREMIUM_PLAYER_PHRASE = {
  RB: 'a pass-catching running back',
  WR: 'a high-target wide receiver',
  TE: 'an every-down tight end',
};

/**
 * Fantasy football's ordinary passing touchdown.
 *
 * Not a Sleeper detail — it is the value nearly every league uses, and the
 * number a manager has in mind when they call six-point passing touchdowns
 * unusual. Kept here rather than imported from the Sleeper defaults table so
 * that provider field names stay behind src/sleeper/.
 */
const ORDINARY_PASSING_TOUCHDOWN = 4;

/**
 * What this league's scoring does to the value of a position.
 *
 * The scoring profile is facts: a tight end catch is worth 1.5 here. On its own
 * that changes nothing — a model handed the number reports the number and goes
 * on ranking tight ends as ordinary flex pieces. What changes an edition is the
 * sentence saying what the number means for a ranking, so every entry carries
 * the fact and the instruction together, the same way `unavailable` does.
 *
 * Derived rather than written into the prompt files because an instruction
 * about TE premium is noise in a league that does not have one, and a prompt
 * file cannot leave itself out. Only settings that differ upward from the
 * ordinary case produce an entry; a league on Sleeper's defaults gets none,
 * and its prompt says nothing about premiums it does not have.
 *
 * The instructions are deliberately about relative positional value rather
 * than arithmetic. Told a tight end catch is worth 1.5, a model will try to do
 * sums with it. Told an every-down tight end is a structural advantage, it
 * ranks the roster that has one above the roster that does not — which is the
 * judgement a power ranking is actually made of.
 */
function describePositionalValue(scoring) {
  if (!scoring) return [];

  const entries = [];

  if (scoring.superflex) {
    entries.push({
      factor: 'superflex',
      why: 'This league starts more than one quarterback, so startable quarterbacks are scarce.',
      instruction:
        'Treat quarterback quality as worth more than the raw ranking weight suggests — the ' +
        'scarcity compounds. A team starting two quarterbacks it trusts holds a structural ' +
        'advantage over one streaming the second, even when the rest of the rosters look level.',
    });
  }

  const passingTouchdown = scoring.passing?.touchdown ?? null;
  if (passingTouchdown !== null && passingTouchdown > ORDINARY_PASSING_TOUCHDOWN) {
    entries.push({
      factor: 'passingTouchdown',
      why: `A passing touchdown is worth ${passingTouchdown} here, not the ordinary ${ORDINARY_PASSING_TOUCHDOWN}.`,
      instruction:
        'Quarterbacks score more relative to every other position than they usually do. A genuine ' +
        'difference-maker at quarterback separates teams further than the ranking weight implies, ' +
        'and a quarterback throwing three touchdowns is a bigger share of a winning score here.',
    });
  }

  const reception = scoring.reception ?? {};
  const base = reception.base ?? 0;

  if (base >= 1) {
    entries.push({
      factor: 'receptionTier',
      why: `Every reception is worth ${base}, so target volume is scoring in its own right.`,
      instruction:
        'Rate target earners and high-floor pass catchers above boom-or-bust yardage producers, ' +
        'and treat a running back who catches passes as materially more valuable than one who ' +
        'only runs.',
    });
  }

  for (const position of reception.premiumPositions ?? []) {
    const { perCatch, bonus } = reception.byPosition?.[position] ?? {};
    if (!bonus) continue;
    const label = POSITION_LABEL[position] ?? position;
    const player = PREMIUM_PLAYER_PHRASE[position] ?? `a high-volume ${label}`;
    entries.push({
      factor: `receptionPremium:${position}`,
      why:
        `A ${label} catch is worth ${perCatch} in this league — ${bonus} more than the ${base} ` +
        'every other position is paid for the same catch.',
      instruction:
        `Treat ${player} as a genuine positional advantage and rank it as one, not as an ` +
        `ordinary flex piece. A roster holding one is ahead of a roster without, and a ${label} ` +
        'out-producing the ones on every other roster is often where a week was decided.',
    });
  }

  return entries;
}

/**
 * Awards that only exist because two teams played each other.
 *
 * Keys are the ones in config/editorial.yml. A league with no matchups is never
 * shown them switched on: the facts behind them can never arrive, and an award
 * advertised as available is an invitation to invent the fact it needs.
 */
const MATCHUP_ONLY_AWARDS = ['biggest_blowout', 'closest_game', 'highest_losing_score'];

function awardsView(awards, headToHead) {
  if (headToHead) return awards;
  return Object.fromEntries(
    Object.entries(awards).filter(([key]) => !MATCHUP_ONLY_AWARDS.includes(key)),
  );
}

function editorialView(config, format) {
  const formatType = format?.type;
  return {
    tone: config.editorial.tone,
    roastIntensity: config.editorial.roast_intensity,
    rankingEmoji: config.editorial.ranking_emoji,
    sleeperMaxChars: config.editorial.output.sleeper_max_chars,
    includeEmoji: config.editorial.output.include_emoji,
    // Weights are per-format: a redraft league is never judged on the
    // dynasty set's dynasty_value/future_draft_capital factors.
    rankingWeights: resolveRankingWeights(config.rankings, formatType),
    movementGuidance: config.rankings.weekly,
    bannedPhrases: config.editorial.banned_phrases ?? [],
    awards: awardsView(config.editorial.awards ?? {}, hasMatchups(format)),
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
  futureDraftCapital = null,
  format = 'sleeper',
}) {
  // Sleeper reports pairings for every league, including the formats that never
  // play one. Nothing below is allowed to pass one on: a matchup in the context
  // block is a fact the model is entitled to print.
  const headToHead = hasMatchups(league.format);

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
      // Every edition, not just the rankings: a premium that decides who to
      // rank first also decides who is favoured in a preview and who explains
      // a recap. Empty for a league that scores ordinarily.
      positionalValue: describePositionalValue(league.format?.scoring),
      playoffTeams: league.playoffTeams,
      playoffWeekStart: league.playoffWeekStart,
    },
    editorial: editorialView(config, league.format),
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
  if (upcomingAnalysis && headToHead) {
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

  // A week is reported as the games it contained, or — where there are none —
  // as one entry per team. The facts are the same facts either way; only the
  // thing they hang off changes, because in this format nothing happened
  // between two teams that could be described.
  if (weekAnalysis) {
    context.thisWeek = {
      week: weekAnalysis.week,
      ...(headToHead
        ? { games: weekAnalysis.games.map(gameView) }
        : {
            teams: weekAnalysis.teamWeeks.map((side) =>
              teamWeekView(side, { includeRecord: false }),
            ),
          }),
      scoringOrder: weekAnalysis.scoringOrder,
      awardFacts: weekAnalysis.awards,
    };
  }

  if (priorWeekAnalysis) {
    const sideSummary = (side) => ({
      team: side.team,
      points: side.points,
      potentialPoints: side.potentialPoints,
      lineupEfficiency: side.lineupEfficiency,
    });

    context.previousWeek = {
      week: priorWeekAnalysis.week,
      ...(headToHead
        ? {
            games: priorWeekAnalysis.games.map((game) => ({
              winner: game.winner,
              loser: game.loser,
              margin: game.margin,
              teams: game.teams.map(sideSummary),
            })),
          }
        : { teams: priorWeekAnalysis.teamWeeks.map(sideSummary) }),
      awardFacts: priorWeekAnalysis.awards,
    };
  }

  // Ranking editions weigh future draft capital; previews and recaps do not.
  if (futureDraftCapital && (task === 'rankings' || task === 'preseason-rankings' || task === 'postseason')) {
    context.futureDraftCapital = futureDraftCapital;
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

  // First in the list, because it is the one absence that changes what an
  // edition *is*. Every other entry says a fact is missing; this one says a
  // whole concept does not exist here, and a model that misses it writes an
  // edition about games nobody played.
  if (!hasMatchups(context.league.format)) {
    missing.push({
      field: 'matchups',
      why:
        `This is a ${context.league.format.type} league: every team scores on its own each week ` +
        'and no team plays another, so there are no games, no opponents and no results. ' +
        'Sleeper reports pairings for this league anyway; they are meaningless and have been ' +
        'discarded before reaching you.',
      instruction:
        'Matchups are not a concept in this league and no opponent exists. Never describe a game, ' +
        'a head-to-head result, a winner, a loser, a margin of victory, or who any team played. ' +
        'Do not pair teams against each other for effect. Every fact about a week is a team\'s own ' +
        'score, measured against the rest of the league.',
    });
  }

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

  if (isRanking && !context.futureDraftCapital) {
    // A dynasty league with nothing traded still has future picks — they are
    // just untraded, which is the ordinary case. A redraft league has no such
    // thing to begin with: rosters are torn up and re-drafted every season, so
    // "nothing traded" would wrongly imply picks exist and simply haven't
    // moved. The two absences need different instructions, not the same one.
    if (context.league.format?.type === 'redraft') {
      missing.push({
        field: 'futureDraftCapital',
        why: 'This is a redraft league: rosters are re-drafted every season, so there is no future draft capital.',
        instruction:
          'Draft capital is not a concept in this league and does not exist. Do not ' +
          'discuss draft picks, future picks, or "assets" of that kind at all — judge ' +
          'every roster only on the players currently on it.',
      });
    } else {
      missing.push({
        field: 'futureDraftCapital',
        why: 'No picks have been traded for any draft that has not yet been held.',
        instruction:
          'Every team holds its own future picks and nothing else. Do not discuss ' +
          'draft capital as a point of difference between teams, and do not mention ' +
          'picks for drafts that have already happened.',
      });
    }
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

/** Editions that assume two teams played a head-to-head game. */
const MATCHUP_ONLY_TASKS = ['preview', 'recap'];

/** The complete text to paste into a chat, or send to an API. */
export function buildPrompt({ task, context }) {
  const file = TASK_PROMPTS[task];
  if (!file) throw new Error(`Unknown task "${task}". Known tasks: ${TASKS.join(', ')}`);

  // Second line of defence: src/cli.mjs already refuses a guillotine
  // preview/recap before any work begins, using the declared format alone.
  // This catches any other caller that reaches buildPrompt directly and skips
  // that guard — the JSON context block is authoritative, so a prompt built
  // from it must never ask a model to describe a game nobody played.
  if (MATCHUP_ONLY_TASKS.includes(task) && !hasMatchups(context.league.format)) {
    throw new Error(
      `Cannot build a ${task} for a ${context.league.format.type} league: there are no ` +
        'head-to-head matchups to describe — every team just scores on its own each week. ' +
        'This should already have been refused in src/cli.mjs; if you are calling buildPrompt ' +
        'directly, add the same guard there.',
    );
  }

  return [
    // A pasted or attached file arrives with no surrounding instruction, and a
    // chat assistant will happily treat it as a document to review — summarise
    // it, then ask what you wanted. Saying plainly what the file is, before
    // anything else, is what makes "attach and send" work with no message.
    '**Read this first.** This file is a complete, ready-to-run assignment, not',
    'a document to review. Read all of it and write the edition it describes,',
    'following every rule below exactly.',
    '',
    'Do not summarise this file. Do not critique or improve it. Do not ask which',
    'option I want, and do not ask any clarifying questions — everything needed',
    'is already here. Reply with the finished posts and nothing else.',
    '',
    '---',
    '',
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
