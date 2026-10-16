/**
 * The five-year plan edition: one dynasty team's outlook over seasons S to
 * S+4, chosen with --team. An outlook built from facts, not a prediction
 * (docs/plans/football-settings-rivalries-five-year-plan.md, section 6).
 *
 * This module is the edition's gate and its view. It refuses the formats the
 * edition means nothing in and a --team that names no single team, and turns
 * the plan's facts (src/analysis/fiveYearPlan.mjs) into the compact view the
 * model reads: one line per player rather than an object per season. Every
 * absence stays an `unavailable` entry with its reason, as the facts module
 * wrote it, and the edition-wide absences come with an instruction, as
 * everywhere else in src/promptContext.mjs.
 *
 * Nothing here judges. Which player to sell before his cliff, and which picks
 * are the team's currency, is the prompt's call (prompts/five-year-plan.md).
 *
 * Browser-safe: nothing here imports from `node:` (src/core may reach it).
 */
import { projectedPicksUnavailable } from './tradePicks.mjs';

/** The edition's task name, and the command that builds it. */
export const FIVE_YEAR_PLAN_TASK = 'five-year-plan';

/** The flag that names the team, as OPTIONS describes it (src/options.mjs). */
export const TEAM_FLAG = '--team';

/** The longest --team accepted: a team name, or a roster id written as text. */
export const TEAM_REFERENCE_MAX_LENGTH = 100;

const NOT_DYNASTY_BECAUSE = {
  redraft:
    'this is a redraft league, so there are no next five seasons to plan: every roster is drafted again ' +
    'from scratch next year and no player or pick carries over.',
  guillotine:
    'this is a guillotine league, where the lowest score each week is eliminated. A team plays for this ' +
    'week or goes out, so there is no multi-season window to plan and a future pick is worth nothing to it.',
};

/**
 * Refuses a five-year plan for a league it means nothing in. A null format
 * (not yet known, before the provider has been asked) is not refused.
 */
export function refuseFiveYearPlan({ formatType }) {
  if (!formatType || formatType === 'dynasty') return;
  const because = NOT_DYNASTY_BECAUSE[formatType] ?? `this is a ${formatType} league, with no multi-season window.`;
  throw new Error(`\`${FIVE_YEAR_PLAN_TASK}\` is a dynasty edition: ${because}`);
}

/**
 * Refuses a missing, blank or over-long --team, before the league is opened:
 * none of those can name a team, whatever the league holds.
 *
 * `commandFor(name)` is how the message names the command to run.
 */
export function refuseWithoutTeam(reference, { commandFor = (name) => name } = {}) {
  const text = typeof reference === 'number' ? String(reference) : typeof reference === 'string' ? reference.trim() : '';
  if (!text) {
    throw new Error(
      `\`${FIVE_YEAR_PLAN_TASK}\` is about one team: name it with ${TEAM_FLAG}, by its name or its roster id. ` +
        `For example: ${commandFor(FIVE_YEAR_PLAN_TASK)} ${TEAM_FLAG} 3`,
    );
  }
  if (text.length > TEAM_REFERENCE_MAX_LENGTH) {
    throw new Error(`${TEAM_FLAG} is longer than ${TEAM_REFERENCE_MAX_LENGTH} characters, so it is not a team name.`);
  }
}

/** "Team A (roster 1), Team B (roster 2)": every team, for a refusal to list. */
const teamList = (teams) => teams.map((team) => `${team.name} (roster ${team.rosterId})`).join(', ');

/**
 * The team --team names, resolved through the league's team identity
 * (src/teamIdentity.mjs): its name now, a name it was published under, its
 * manager's username, or its roster id. An unknown or ambiguous reference is
 * refused, naming it and listing the league's teams, rather than guessed at.
 *
 * @param reference the --team value
 * @param identity  a team identity for the opened league (createTeamIdentity)
 * @returns the normalized team
 */
export function resolvePlanTeam(reference, identity) {
  refuseWithoutTeam(reference);
  const written = String(reference).trim();
  const found = identity.lookup(written);
  if (found.status === 'found') return identity.teams.find((team) => team.rosterId === found.rosterId);
  const teams = teamList(identity.teams);
  if (found.status === 'ambiguous') {
    throw new Error(
      `${TEAM_FLAG} "${written}" has meant more than one team in this league, so the plan cannot tell which. ` +
        `Use the roster id instead: ${teams}.`,
    );
  }
  throw new Error(`${TEAM_FLAG} "${written}" is not a team in this league. Its teams are: ${teams}.`);
}

/* ------------------------------------------------------------------ view */

/** "rising before 26, peak 26-33, declining 34-36, cliff from 37": one curve as a line. */
function curveLine({ peak, decline, cliff }) {
  return `rising before ${peak}, peak ${peak}-${decline - 1}, declining ${decline}-${cliff - 1}, cliff from ${cliff}`;
}

/** "RB Rex Carter: 2026 age 23 rising; 2027 age 24 peak; ..." — one player across the plan. */
function playerLine(row) {
  const label = `${row.position ?? 'position unknown'} ${row.name ?? `player ${row.id}`}`;
  if (!row.seasons) return `${label}: no age (${row.unavailable.reason})`;
  const seasons = row.seasons
    .map(({ season, age, stage }) => `${season} age ${age}${stage ? ` ${stage}` : ''}`)
    .join('; ');
  return `${label}: ${seasons}${row.unavailable ? ` (no stage: ${row.unavailable.reason})` : ''}`;
}

/** "under 24: 5, 24-27: 8, 28-30: 3, 31+: 2, unknown: 1" — the roster by age band. */
const bandLine = (bands) => bands.map(({ label, count }) => `${label}: ${count}`).join(', ');

/** One season's picks, without roster ids; an `unavailable` season passes through. */
function picksView(picks, rosterId) {
  if (picks.unavailable) return picks;
  return {
    ...picks,
    picks: picks.picks.map(({ originalRosterId, ...pick }) => ({
      ...pick,
      originalTeam: originalRosterId === rosterId ? `${pick.originalTeam} (own)` : pick.originalTeam,
    })),
  };
}

/** The strength view without roster ids (the context names teams, as every view does). */
function strengthView(strength) {
  if (strength.unavailable) return strength;
  const { components, ...rest } = strength;
  return {
    scale:
      'Computed by code from the facts on file, not a judgement: 0-100 relative to this league. Each component ' +
      'is ranked across the league and scored by rank (100 first, 0 last); the rating is the weighted mean of ' +
      'those scores. A component left out was never counted as zero.',
    ...rest,
    components,
  };
}

/**
 * The plan as the model reads it.
 *
 * @param plan src/analysis/fiveYearPlan.mjs#buildFiveYearPlan
 */
export function fiveYearPlanView(plan) {
  const rosterId = plan.team.rosterId;
  const lines = (rows) => rows.map(playerLine);
  const aged = plan.players.filter((row) => row.seasons);
  return {
    team: plan.team.name,
    seasons: plan.seasons,
    ageBasis: plan.ageBasis,
    ageCurveBasis: plan.ageCurveBasis,
    ageCurves: Object.fromEntries(Object.entries(plan.ageCurves).map(([position, curve]) => [position, curveLine(curve)])),
    starters: lines(aged.filter((row) => row.starter)),
    bench: lines(aged.filter((row) => !row.starter)),
    ...(plan.players.some((row) => !row.seasons) ? { withoutAge: lines(plan.players.filter((row) => !row.seasons)) } : {}),
    starterProduction: plan.starterProduction,
    bySeason: plan.bySeason.map(({ rosterByAgeBand, picks, ...season }) => ({
      ...season,
      rosterByAgeBand: bandLine(rosterByAgeBand),
      picks: picksView(picks, rosterId),
    })),
    strength: strengthView(plan.strength),
    standing: plan.standing,
    marketValue: plan.marketValue,
  };
}

/** Every held pick in the plan, `{ season, round, originalRosterId }`, for the projection entries. */
export function planHeldPicks(plan) {
  return plan.bySeason.flatMap(({ season, picks }) =>
    picks.unavailable ? [] : picks.picks.map((pick) => ({ season, round: pick.round, originalRosterId: pick.originalRosterId })),
  );
}

/** Whether any figure in the plan is a FantasyCalc value, so the market credit is owed. */
export function planQuotesMarket(plan) {
  return Boolean(
    plan.marketValue?.valueSource ||
      plan.bySeason.some(({ picks }) => !picks.unavailable && picks.picks.some((pick) => pick.value !== null && pick.value !== undefined)) ||
      plan.strength?.components?.market_value,
  );
}

/**
 * What a five-year plan does not know, each with its instruction. The plan's
 * own `unavailable` entries (a season's picks, the strength rating, the
 * standing, the market value, a player's age) carry their reasons inline;
 * these are the absences that shape the whole edition.
 *
 * @param plan              buildFiveYearPlan's output
 * @param draftProjection   the context's draftProjection, or null
 * @param marketUnavailable why pick and roster values are missing, when they are
 */
export function fiveYearPlanUnavailable({ plan, draftProjection = null, marketUnavailable = null }) {
  const missing = [
    {
      field: 'futureSeasons',
      why:
        'Nothing in this context projects a future season: no player\'s points, no team\'s record, no ' +
        'playoff place and no title. Only the calendar is carried forward (a player is a year older each ' +
        'season) and the picks already issued.',
      instruction:
        'Never project points, a record, a finish, a playoff place or a title for any season, and never say ' +
        'a player will break out, lose production or score any amount. A stage is the age curve applied to ' +
        'his age, not a forecast of his play: say "by this curve he reaches the cliff in 2029", not "he ' +
        'will fall off in 2029". Describe a season only through the ages, the stages, today\'s production ' +
        'and the picks the context gives for it.',
    },
    {
      field: 'otherRosters',
      why: 'Only this team\'s roster is in the context. Other teams appear only as the original teams of picks.',
      instruction:
        'Do not name a player on another team, a trade partner or a target. Describe a move by what this team ' +
        'would give up and why, from its own roster and picks.',
    },
  ];

  if (!plan.starterProduction.weeksCovered.length) {
    missing.push({
      field: 'starterProduction',
      why: 'No settled week of this season is on file, so today\'s starters have no points to read.',
      instruction:
        'Do not say who carries this team\'s scoring or quote any share of starter points. Plan from ages, ' +
        'stages and picks alone, and say once that production is not on record yet.',
    });
  }

  const pricedPick = plan.bySeason.some(
    ({ picks }) => !picks.unavailable && picks.picks.some((pick) => pick.value !== null && pick.value !== undefined),
  );
  if (!pricedPick) {
    missing.push({
      field: 'pickValues',
      why: `No pick held in this plan has a market price${marketUnavailable ? ` (${marketUnavailable})` : ''}.`,
      instruction:
        'Do not quote, estimate or recall a trade value for any pick. Describe the team\'s picks by season, ' +
        'round and original team only.',
    });
  }

  missing.push(...projectedPicksUnavailable({ picks: planHeldPicks(plan), draftProjection, board: null }));

  missing.push(
    {
      field: 'prospectBoard',
      why: 'No prospect board travels with this edition.',
      instruction:
        'Do not name, rank or describe any college or rookie prospect, and do not say what any pick will become.',
    },
    {
      field: 'pickTradeHistory',
      why: 'Who holds each pick is known; when it was traded and what was given for it are not included.',
      instruction: 'Say which picks the team holds and whose they were. Do not say when one moved or what it cost.',
    },
    {
      field: 'injuryDetail',
      why: 'No injury news is included.',
      instruction: 'Do not describe any injury, and do not plan around one.',
    },
  );

  return missing;
}
