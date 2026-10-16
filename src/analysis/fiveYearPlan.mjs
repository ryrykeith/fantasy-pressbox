/**
 * The five-year plan's facts for one dynasty team: where its roster sits on
 * each position's age curve in each of the next five seasons, what that does
 * to today's starters, and the picks it holds for each draft.
 *
 * An outlook built from facts, not a prediction. Nothing here projects points,
 * a record or a title: the only thing carried forward is the calendar (a
 * player is a year older each season) and the picks already issued. Which
 * season a team should sell a player before is the prompt's judgement.
 *
 * Ages. The basis is the age on each player's record today (Sleeper's `age`),
 * taken as his age at the start of this season and shifted forward a year per
 * season; `ageBasis` says so in the output. A player whose record has no age
 * is `unavailable`, never aged 0, and he enters no count or share.
 *
 * Stages come from editorial per-position curves (config/rankings.yml
 * `age_curves`, resolved by src/settings.mjs#resolveAgeCurves): rising below
 * `peak`, peak until `decline`, declining until `cliff`, and the cliff from
 * there on. A position with no curve gets no stage, and says so.
 *
 * Pure: no clock, no I/O, no node: imports (src/core may reach this module).
 */
import { futurePickOwnership, isFuturePick } from '../league/draftCapital.mjs';
import { buildPickCapital } from './pickCapital.mjs';
import { ageBandsFor, DEFAULT_AGE_BAND_EDGES, fieldedStarterPoints, isAgedPosition } from './rosterWindow.mjs';
import { currentSeeds, seedsByWinsThenPointsFor } from './standings.mjs';
import { rosterMarketValue } from './strength.mjs';

/** How many seasons the plan covers, this one included. */
export const FIVE_YEAR_PLAN_SEASONS = 5;

/** The stages of an age curve, youngest first. */
export const AGE_CURVE_STAGES = Object.freeze(['rising', 'peak', 'declining', 'cliff']);

/** The reason a draft with no issued picks gives. */
export const PICKS_NOT_ISSUED = 'not issued yet';

export const AGE_BASIS =
  "Each player's age on his record today (Sleeper's), taken as his age at the start of this season and " +
  'shifted forward one year per season after it. A birthday during a season is not tracked, so a real age ' +
  'can be up to a year off.';

export const AGE_CURVE_BASIS =
  'Stages come from the per-position age curves in config/rankings.yml (age_curves). They are editorial ' +
  'judgement, not a fact about any player: rising before `peak`, peak from `peak`, declining from ' +
  '`decline`, and the cliff from `cliff`.';

const round2 = (value) => Math.round(value * 100) / 100;

/** A position's stage at an age on its curve. */
export function ageCurveStage(age, curve) {
  if (age < curve.peak) return 'rising';
  if (age < curve.decline) return 'peak';
  if (age < curve.cliff) return 'declining';
  return 'cliff';
}

/** Seasons S to S+4, as strings. */
export function planSeasons(season) {
  const first = Number(season);
  return Array.from({ length: FIVE_YEAR_PLAN_SEASONS }, (_, offset) => String(first + offset));
}

/** A team defense: a franchise, with no age (rosterWindow.mjs#isAgedPosition). */
const isAgeless = (position) => Boolean(position) && !isAgedPosition(position);

/** Why an aged player has no stage, or null when he has one. */
function stageGap(position, ageCurves) {
  if (!position) return 'his position is not known';
  if (!ageCurves[position]) return `config/rankings.yml age_curves has no curve for ${position}`;
  return null;
}

/**
 * Each rostered player's age and stage in every plan season.
 */
function playerRows({ team, players, ageCurves, seasons, starterIds }) {
  return (team.playerIds || []).map((id) => {
    const player = players[id];
    const position = player?.position ?? null;
    const base = { id, name: player?.name ?? null, position, starter: starterIds.has(id) };
    if (isAgeless(position)) return { ...base, unavailable: { field: 'age', reason: 'a team defense has no age' } };
    const ageToday = player?.age;
    if (!Number.isFinite(ageToday)) {
      return {
        ...base,
        unavailable: { field: 'age', reason: player ? 'his player record has no age' : 'he is not in the player dictionary' },
      };
    }
    const noStage = stageGap(position, ageCurves);
    const curve = ageCurves[position];
    return {
      ...base,
      ageToday,
      seasons: seasons.map((season, offset) => ({
        season,
        age: ageToday + offset,
        ...(noStage ? {} : { stage: ageCurveStage(ageToday + offset, curve) }),
      })),
      ...(noStage ? { unavailable: { field: 'stage', reason: noStage } } : {}),
    };
  });
}

/**
 * The points each of today's starters scored in starts in `weeks`, for
 * whichever team started him: his production, wherever it went on a score.
 * A start with no reported points is counted apart, never as 0.
 */
function starterProduction(starterIds, weeks) {
  const points = new Map([...starterIds].map((id) => [id, 0]));
  let startsWithoutPoints = 0;
  for (const { rosters = [] } of weeks) {
    for (const roster of rosters) {
      for (const start of fieldedStarterPoints(roster)) {
        if (!points.has(start.id)) continue;
        if (start.points === null) startsWithoutPoints += 1;
        else points.set(start.id, points.get(start.id) + start.points);
      }
    }
  }
  return { points, startsWithoutPoints };
}

/** The roll-ups for one season: today's starters against their curves, and the roster by age band. */
function seasonRollup({ season, offset, rows, production, bands, noProduction }) {
  const starters = rows.filter((row) => row.starter);
  const staged = starters.filter((row) => row.seasons?.[offset]?.stage);
  const pastDecline = staged.filter((row) => ['declining', 'cliff'].includes(row.seasons[offset].stage));
  const unstaged = starters.filter((row) => !row.seasons?.[offset]?.stage);

  const pointsOf = (row) => production.points.get(row.id) ?? 0;
  const stagedPoints = staged.reduce((sum, row) => sum + pointsOf(row), 0);
  const beforeCliff = staged
    .filter((row) => row.seasons[offset].stage !== 'cliff')
    .reduce((sum, row) => sum + pointsOf(row), 0);
  const unstagedPoints = unstaged.reduce((sum, row) => sum + pointsOf(row), 0);

  const rosterBands = new Map([...bands.map((band) => [band.label, 0]), ['unknown', 0]]);
  for (const row of rows) {
    if (isAgeless(row.position)) continue;
    const age = row.seasons?.[offset]?.age;
    const label = Number.isFinite(age) ? bands.find((band) => age >= band.min && age < band.max).label : 'unknown';
    rosterBands.set(label, rosterBands.get(label) + 1);
  }

  return {
    season,
    startersPastDecline: {
      count: pastDecline.length,
      of: staged.length,
      players: pastDecline.map((row) => row.name ?? row.id),
      ...(unstaged.length ? { withoutStage: unstaged.length } : {}),
    },
    starterPointsBeforeCliff: noProduction
      ? { unavailable: noProduction }
      : stagedPoints > 0
        ? {
            share: round2(beforeCliff / stagedPoints),
            points: round2(beforeCliff),
            ofPoints: round2(stagedPoints),
            ...(unstagedPoints > 0 ? { pointsWithoutStage: round2(unstagedPoints) } : {}),
          }
        : {
            unavailable:
              "today's starters with a known age and an age curve scored no reported points in the weeks on file",
          },
    rosterByAgeBand: [...rosterBands].map(([label, count]) => ({ label, count })),
  };
}

/** One season's picks from a pick capital row, without the market's internals. */
function picksView(row) {
  return {
    picksHeld: row.picksHeld,
    ownPicks: row.baseline,
    netPicks: row.netPicks,
    value: row.value,
    netValue: row.netValue,
    unpricedPicks: row.unpricedPicks,
    picks: row.picks.map((pick) => ({
      round: pick.round,
      originalTeam: pick.originalTeam,
      originalRosterId: pick.originalRosterId,
      value: pick.value,
      basis: pick.basis,
      ...(pick.projectedPick !== undefined ? { projectedPick: pick.projectedPick, tier: pick.tier } : {}),
    })),
  };
}

/**
 * The team's picks for every plan season. A draft already held, a season with
 * no issued picks, or a league with no pick capital is `unavailable` with its
 * reason, never an empty list. A season inside the issued range that no trade
 * or price touched still holds the team's own picks, unpriced.
 */
function picksBySeason({ seasons, league, teams, team, pickCapital, pickCapitalUnavailable }) {
  if (!pickCapital) {
    const reason = pickCapitalUnavailable ?? 'future draft capital is not known for this league';
    return new Map(seasons.map((season) => [season, { unavailable: reason }]));
  }
  const row = pickCapital.teams.find((entry) => entry.rosterId === team.rosterId);
  const issued = [...pickCapital.seasons].sort();
  const lastIssued = issued[issued.length - 1];
  return new Map(
    seasons.map((season) => {
      if (!isFuturePick({ season }, league)) return [season, { unavailable: "this season's rookie draft has been held" }];
      const seasonRow = row?.seasons.find((entry) => entry.season === season);
      if (seasonRow) return [season, picksView(seasonRow)];
      if (lastIssued === undefined || season > lastIssued) return [season, { unavailable: PICKS_NOT_ISSUED }];
      if (!Number.isInteger(league.draftRounds) || league.draftRounds < 1) {
        return [season, { unavailable: 'the league reports no round count for its drafts' }];
      }
      // Inside the issued range: no pick of this draft has moved and none is
      // priced, so every team holds its own.
      const own = buildPickCapital({
        teams,
        seasons: [season],
        picks: futurePickOwnership({
          tradedPicks: [],
          rosterIds: teams.map((entry) => entry.rosterId),
          roundsPerDraft: league.draftRounds,
          season,
        }),
      });
      return [season, picksView(own.teams.find((entry) => entry.rosterId === team.rosterId).seasons[0])];
    }),
  );
}

/** Today's strength rating for the team, without the house weights. */
function strengthView(strength, rosterId, strengthUnavailable) {
  if (!strength) return { unavailable: strengthUnavailable ?? 'no strength rating was computed for this league' };
  const row = strength.teams.find((entry) => entry.rosterId === rosterId);
  if (!row || row.rating === null) {
    return { unavailable: 'no component of the strength rating could be computed for this team' };
  }
  return {
    rating: row.rating,
    rank: row.rank,
    of: strength.teams.filter((entry) => entry.rating !== null).length,
    components: row.components,
    legend: strength.components,
    ...(strength.unavailable.length ? { leagueUnavailable: strength.unavailable } : {}),
    ...(strength.note ? { note: strength.note } : {}),
    ...(row.unavailable ? { teamUnavailable: row.unavailable } : {}),
  };
}

/** Where the team sits in today's standings, when the league's order is known and a game has been played. */
function standingView(league, teams, rosterId) {
  if (!seedsByWinsThenPointsFor(league)) {
    return { unavailable: "the league's standings are not ordered by wins, then points for, so its order is not known here" };
  }
  const played = teams.some((entry) => (entry.record?.wins ?? 0) + (entry.record?.losses ?? 0) + (entry.record?.ties ?? 0) > 0);
  if (!played) return { unavailable: 'no game of this season has been played yet' };
  return {
    rank: currentSeeds(teams).get(rosterId),
    of: teams.length,
    basis: "today's standings: wins (a tie is half a win), then points for",
  };
}

/** The roster's market value today and its rank among the league's priced rosters. */
function marketView(market, teams, team) {
  if (!market?.players) {
    return {
      unavailable: market?.unavailable
        ? `FantasyCalc values could not be read (${market.unavailable})`
        : 'no FantasyCalc values are on file for this week',
    };
  }
  const own = rosterMarketValue(team, market);
  if (own.value === null) return { unavailable: own.reason };
  const values = teams.map((entry) => rosterMarketValue(entry, market).value).filter((value) => value !== null);
  return {
    value: own.value,
    rank: 1 + values.filter((value) => value > own.value).length,
    of: values.length,
    pricedPlayers: own.pricedPlayers,
    unpricedPlayers: own.unpricedPlayers,
    valueSource: { source: market.source ?? null, label: market.label ?? null, week: market.week ?? null },
  };
}

/**
 * @param league       `{ season, draftStatus, draftRounds, playoffSeeding? }`
 * @param team         the normalized team the plan is about (rosterId, name,
 *                     playerIds, starterIds: today's roster and lineup)
 * @param teams        every normalized team in the league (records, rosters)
 * @param players      the player dictionary, keyed by id (name, position, age)
 * @param weeks        `[{ week, rosters }]`, WeekData rosters of the settled
 *                     weeks to read today's starters' production from
 * @param ageCurves    resolveAgeCurves' table
 * @param pickCapital  buildPickCapital's output, or null
 * @param pickCapitalUnavailable why there is no pick capital, when it is null
 * @param strength     buildStrength's output, or null
 * @param strengthUnavailable why there is no strength rating, when it is null
 * @param market       readMarketValues' snapshot, `{ unavailable }`, or null
 * @param ageBandEdges the roster window's band edges (rosterWindow.mjs)
 */
export function buildFiveYearPlan({
  league,
  team,
  teams = [team],
  players = {},
  weeks = [],
  ageCurves,
  pickCapital = null,
  pickCapitalUnavailable = null,
  strength = null,
  strengthUnavailable = null,
  market = null,
  ageBandEdges = DEFAULT_AGE_BAND_EDGES,
}) {
  const seasons = planSeasons(league.season);
  const starterIds = new Set((team.starterIds || []).filter((id) => id !== null));
  const rows = playerRows({ team, players, ageCurves, seasons, starterIds });
  const production = starterProduction(starterIds, weeks);
  const bands = ageBandsFor(ageBandEdges);
  const picks = picksBySeason({ seasons, league, teams, team, pickCapital, pickCapitalUnavailable });

  const noProduction = weeks.length ? null : 'no settled week of this season is on file';

  return {
    team: { rosterId: team.rosterId, name: team.name },
    seasons,
    ageBasis: AGE_BASIS,
    ageCurveBasis: AGE_CURVE_BASIS,
    ageCurves: Object.fromEntries(Object.entries(ageCurves).map(([position, curve]) => [position, { ...curve }])),
    starterProduction: {
      weeksCovered: weeks.map((entry) => entry.week).sort((a, b) => a - b),
      basis:
        "Points today's starters scored in starts in `weeksCovered`, for whichever team started them. " +
        'A player is placed on his curve by his age in each season; the points are the same ones each season.',
      ...(production.startsWithoutPoints ? { startsWithoutPoints: production.startsWithoutPoints } : {}),
    },
    players: rows,
    bySeason: seasons.map((season, offset) => ({
      ...seasonRollup({ season, offset, rows, production, bands, noProduction }),
      picks: picks.get(season),
    })),
    strength: strengthView(strength, team.rosterId, strengthUnavailable),
    standing: standingView(league, teams, team.rosterId),
    marketValue: marketView(market, teams, team),
  };
}
