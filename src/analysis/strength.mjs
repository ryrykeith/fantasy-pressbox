/**
 * The team strength rating: a number from 0 to 100 for every team, relative to
 * its league, computed by the code from facts already on file.
 *
 * The power rankings are written by the model under the ranking weights; this
 * is the opposite kind of thing. The same saved data always gives the same
 * rating, so it can be reproduced and checked, and the model may cite it as
 * evidence but never as the whole case for a rank.
 *
 * Components (docs/editorial-model.md has the formula):
 *
 *   lineup         mean points of the best legal lineup each roster could have
 *                  fielded (src/analysis/week.mjs#optimalLineup, the same
 *                  solver as lineup efficiency), over the window weeks
 *   depth          mean points the bench supplies in a short week: the week's
 *                  `shortWeekStarters` highest-scoring starters of that best
 *                  lineup are removed and the solver fills the lineup again
 *                  from what is left; depth is the refilled lineup's total
 *                  minus what the remaining starters scored, which is exactly
 *                  what the bench put into the vacated slots
 *   market_value   the FantasyCalc value of the players on the roster today,
 *                  summed over the priced ones
 *   age_window     the starters' age against the league's points-weighted mean
 *                  age at the same position, weighted by the points each
 *                  scored as a starter in the window weeks; negative is younger
 *                  than the league (src/analysis/rosterWindow.mjs reads the
 *                  same starts)
 *   draft_capital  the priced value of the future picks the team holds
 *                  (src/analysis/pickCapital.mjs `horizon.value`)
 *
 * Each component is ranked across the teams that have it and scored by rank,
 * so the rating says where a team stands in its league, not how good it is in
 * any absolute sense. A component the league cannot supply is listed in
 * `unavailable` with its reason and the remaining weights are scaled back up to
 * 1.0; a team that alone lacks one has its own `unavailable` entry and its own
 * rescaled weights. Nothing missing ever counts as 0.
 *
 * Pure: no clock, no I/O, no node: imports (src/core reaches this module).
 */
import { fieldedStarterPoints, isAgedPosition } from './rosterWindow.mjs';
import { lineupCandidates, optimalLineup } from './week.mjs';
import { missingWeeksIn } from './weekCoverage.mjs';

/** How each component reads, in the order a rating lists them. */
export const STRENGTH_COMPONENTS = Object.freeze({
  lineup: {
    better: 'higher',
    measures: 'mean points of the best legal lineup the roster could have fielded, over the window weeks',
  },
  depth: {
    better: 'higher',
    measures:
      "mean points the bench would have supplied had each window week's best starters been missing " +
      '(see `window.shortWeekStarters`)',
  },
  market_value: {
    better: 'higher',
    measures: 'FantasyCalc trade value of the players on the roster today, summed over the priced ones',
  },
  age_window: {
    better: 'lower',
    measures:
      "starters' age in years against the league's average at the same position, weighted by their points " +
      'in the window weeks; negative is younger than the league',
  },
  draft_capital: {
    better: 'higher',
    measures: 'FantasyCalc value of the future draft picks the team holds, summed over the priced ones',
  },
});

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** A component this team has: its value and the facts behind it. */
const known = (value, detail = {}) => ({ value, ...detail });
/** A component this team lacks, and why. */
const missing = (reason) => ({ value: null, reason });

/**
 * The last `count` settled weeks, oldest first. `weeks` is `[{ week, rosters }]`
 * of settled weeks only; which weeks are settled is the caller's question.
 */
export function strengthWindow(weeks, count) {
  return [...weeks].sort((a, b) => a.week - b.week).slice(-count);
}

/**
 * `lineup` and `depth` for one team over the window weeks. A week the team
 * has no roster in, or whose best lineup cannot be known (a player with no
 * reported points, or no known position: week.mjs#optimalLineup), is not
 * counted; a team with no countable week lacks both components.
 */
function lineupAndDepth(rosterId, { window, players, slots, shortWeekStarters }) {
  const totals = [];
  const benchSupplied = [];
  let unknownWeeks = 0;
  for (const { rosters = [] } of window) {
    const roster = rosters.find((entry) => entry.rosterId === rosterId);
    if (!roster) continue;
    const { candidates } = lineupCandidates(roster, players);
    const best = optimalLineup(slots, candidates);
    if (!best) {
      unknownWeeks += 1;
      continue;
    }
    totals.push(best.total);

    // The short week: the best lineup's top scorers are out (ties broken by
    // id, so the same week always loses the same players).
    const out = best.lineup
      .map(({ entry }) => entry)
      .filter((entry) => entry && entry.id !== null)
      .sort((a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id)))
      .slice(0, shortWeekStarters);
    const outIds = new Set(out.map((entry) => entry.id));
    const refilled = optimalLineup(
      slots,
      candidates.filter((entry) => !outIds.has(entry.id)),
    );
    const kept = best.total - out.reduce((sum, entry) => sum + entry.points, 0);
    benchSupplied.push(Math.max(0, refilled.total - kept));
  }
  const unknown = unknownWeeks ? { unknownWeeks } : {};
  if (!totals.length) {
    const reason = unknownWeeks
      ? 'its best lineup cannot be known in any window week: a player on the roster has no reported points or no known position'
      : 'it has no roster in any window week';
    return { lineup: missing(reason), depth: missing(reason) };
  }
  return {
    lineup: known(round2(mean(totals)), { weeks: totals.length, ...unknown }),
    depth: known(round2(mean(benchSupplied)), { weeks: benchSupplied.length, ...unknown }),
  };
}

/**
 * `market_value` for one team: today's roster at the snapshot's prices.
 * `{ value, pricedPlayers, unpricedPlayers }`, or `{ value: null, reason }`
 * when the market prices no one on it. The five-year plan reads it too.
 */
export function rosterMarketValue(team, market) {
  let value = 0;
  let priced = 0;
  let unpriced = 0;
  for (const id of team.playerIds || []) {
    const entry = market.players?.[id];
    if (Number.isFinite(entry?.value)) {
      value += entry.value;
      priced += 1;
    } else {
      unpriced += 1;
    }
  }
  if (!priced) return missing('FantasyCalc prices no player on this roster');
  return known(round2(value), { pricedPlayers: priced, unpricedPlayers: unpriced });
}

/**
 * `age_window` for every team at once, since each age is measured against the
 * league's points-weighted mean at the same position.
 */
function ageWindows(teams, { window, players }) {
  const ageOf = (id) => (Number.isFinite(players[id]?.age) ? players[id].age : null);
  const positionOf = (id) => players[id]?.position ?? null;

  // Every scored, aged start in the window, by the team that fielded it.
  const starts = new Map(teams.map((team) => [team.rosterId, []]));
  for (const { rosters = [] } of window) {
    for (const roster of rosters) {
      if (!starts.has(roster.rosterId)) continue;
      for (const { id, points } of fieldedStarterPoints(roster)) {
        const age = ageOf(id);
        const position = positionOf(id);
        if (points === null || points <= 0 || age === null || !isAgedPosition(position)) continue;
        starts.get(roster.rosterId).push({ position, age, points });
      }
    }
  }

  const byPosition = new Map();
  for (const list of starts.values()) {
    for (const { position, age, points } of list) {
      const entry = byPosition.get(position) ?? { weighted: 0, weight: 0 };
      entry.weighted += age * points;
      entry.weight += points;
      byPosition.set(position, entry);
    }
  }
  const leagueMean = new Map([...byPosition].map(([position, { weighted, weight }]) => [position, weighted / weight]));

  return new Map(
    teams.map((team) => {
      const list = starts.get(team.rosterId);
      if (!list.length) {
        return [team.rosterId, missing('no starter with a known age scored for it in the window weeks')];
      }
      const weight = list.reduce((sum, start) => sum + start.points, 0);
      const relative = list.reduce((sum, start) => sum + (start.age - leagueMean.get(start.position)) * start.points, 0);
      return [team.rosterId, known(round2(relative / weight), { starts: list.length })];
    }),
  );
}

/** `draft_capital` for one team, from its pick capital row. */
function draftCapital(row) {
  const value = row?.horizon?.value;
  if (!Number.isFinite(value)) return missing('its future picks are not priced');
  return known(round2(value), { picksHeld: row.horizon.picksHeld, unpricedPicks: row.horizon.unpricedPicks });
}

/**
 * Each team's rank on one component and its 0-100 score. Teams that lack the
 * component are left out. Rank is competition ranking (1, 2, 2, 4) on the
 * value as shown; the score uses the average of the ranks a tie spans, so
 * tied teams score the same: 100 for first, 0 for last, evenly between.
 */
function rankComponent(entries, better) {
  const order = [...entries].sort((a, b) => (better === 'lower' ? a.value - b.value : b.value - a.value));
  const count = order.length;
  const ranked = new Map();
  for (let i = 0; i < count; ) {
    let j = i;
    while (j + 1 < count && order[j + 1].value === order[i].value) j += 1;
    const averageRank = (i + j) / 2 + 1;
    const score = count === 1 ? 100 : (100 * (count - averageRank)) / (count - 1);
    for (let k = i; k <= j; k += 1) ranked.set(order[k].rosterId, { rank: i + 1, score });
    i = j + 1;
  }
  return ranked;
}

/** A weight set restricted to `components` and scaled back up to sum to 1.0. */
function rescale(weights, components) {
  const total = components.reduce((sum, component) => sum + weights[component], 0);
  if (total <= 0) return null;
  return Object.fromEntries(components.map((component) => [component, round3(weights[component] / total)]));
}

/**
 * @param formatType      the league's resolved format; it must have a strength
 *                        rating (src/settings.mjs#STRENGTH_COMPONENTS_BY_FORMAT)
 * @param preset          the preset that chose the weights, or null for the league's own
 * @param weights         `{ component: weight }`, summing to 1.0
 *                        (src/settings.mjs#resolveStrengthChoice)
 * @param inputs          `{ lineupWeeks, shortWeekStarters }`
 * @param teams           normalized teams: rosterId, name, playerIds (today's roster)
 * @param players         the player dictionary, keyed by id (position, age)
 * @param slots           the league's starting slots
 * @param weeks           `{ settled: [{ week, rosters }], unavailable, throughWeek? }`:
 *                        every settled week on file (WeekData rosters), or the
 *                        reason there are none to read. With `throughWeek` (the
 *                        week the rating is for), `window.missingWeeks` names
 *                        the weeks from the window's first week to that week
 *                        that are not in `settled`
 * @param market          readMarketValues' snapshot, `{ unavailable }`, or null
 * @param pickCapital     buildPickCapital's output, or null
 * @param draftCapitalUnavailable why there is no pick capital, when it is null
 * @returns the rating: `{ formatType, preset, weights, weightsUsed, window,
 *          components, unavailable, note?, valueSource, teams }`, teams in the
 *          order given, each `{ rosterId, team, rating, rank, components,
 *          unavailable?, weightsUsed? }`
 */
export function buildStrength({
  formatType,
  preset = null,
  weights,
  inputs,
  teams = [],
  players = {},
  slots = [],
  weeks = { settled: [], unavailable: null },
  market = null,
  pickCapital = null,
  draftCapitalUnavailable = null,
}) {
  const components = Object.keys(weights).filter((component) => weights[component] > 0);
  const window = strengthWindow(weeks.settled ?? [], inputs.lineupWeeks);
  // The window lists the weeks it used; a gap inside its span (a skipped
  // week) is otherwise indistinguishable from a bye.
  const windowMissing = window.length
    ? missingWeeksIn({ present: window.map((entry) => entry.week), from: window[0].week, through: weeks.throughWeek })
    : [];

  // Why a whole component cannot be computed for this league, if it cannot.
  const leagueGap = {};
  const noWeeks = window.length
    ? null
    : (weeks.unavailable ?? 'no week of this season is settled yet');
  if (noWeeks) {
    leagueGap.lineup = noWeeks;
    leagueGap.depth = noWeeks;
    leagueGap.age_window = noWeeks;
  }
  const hasMarket = Boolean(market?.players);
  if (!hasMarket) {
    leagueGap.market_value = market?.unavailable
      ? `FantasyCalc values could not be read (${market.unavailable})`
      : 'no FantasyCalc values are on file for this week';
  }
  if (!pickCapital) {
    leagueGap.draft_capital = draftCapitalUnavailable ?? 'future draft capital is not known for this league';
  } else if (!pickCapital.valueSource) {
    leagueGap.draft_capital = pickCapital.marketUnavailable
      ? `pick values could not be read (${pickCapital.marketUnavailable})`
      : 'no FantasyCalc pick values are on file for this week';
  }

  // Every team's value for every component the league can supply.
  const values = new Map(teams.map((team) => [team.rosterId, {}]));
  const wanted = (component) => components.includes(component) && !leagueGap[component];
  if (wanted('lineup') || wanted('depth')) {
    for (const team of teams) {
      const both = lineupAndDepth(team.rosterId, {
        window,
        players,
        slots,
        shortWeekStarters: inputs.shortWeekStarters,
      });
      if (wanted('lineup')) values.get(team.rosterId).lineup = both.lineup;
      if (wanted('depth')) values.get(team.rosterId).depth = both.depth;
    }
  }
  if (wanted('market_value')) {
    for (const team of teams) values.get(team.rosterId).market_value = rosterMarketValue(team, market);
  }
  if (wanted('age_window')) {
    const ages = ageWindows(teams, { window, players });
    for (const team of teams) values.get(team.rosterId).age_window = ages.get(team.rosterId);
  }
  if (wanted('draft_capital')) {
    const rows = new Map(pickCapital.teams.map((row) => [row.rosterId, row]));
    for (const team of teams) values.get(team.rosterId).draft_capital = draftCapital(rows.get(team.rosterId));
  }

  // A component no team has a value for is a league gap too: say why once.
  for (const component of components) {
    if (leagueGap[component]) continue;
    const reasons = teams.map((team) => values.get(team.rosterId)[component]).filter((entry) => entry.value === null);
    if (teams.length && reasons.length === teams.length) leagueGap[component] = `no team has one: ${reasons[0].reason}`;
  }
  const used = components.filter((component) => !leagueGap[component]);

  // Rank and score each component across the teams that have it.
  const ranks = Object.fromEntries(
    used.map((component) => [
      component,
      rankComponent(
        teams
          .map((team) => ({ rosterId: team.rosterId, value: values.get(team.rosterId)[component].value }))
          .filter((entry) => entry.value !== null),
        STRENGTH_COMPONENTS[component].better,
      ),
    ]),
  );

  const rated = teams.map((team) => {
    const own = values.get(team.rosterId);
    const has = used.filter((component) => own[component].value !== null);
    const teamGaps = used
      .filter((component) => own[component].value === null)
      .map((component) => ({ component, reason: own[component].reason }));
    const teamWeights = has.length ? rescale(weights, has) : null;
    const rating = teamWeights
      ? Math.round(has.reduce((sum, component) => sum + weights[component] * ranks[component].get(team.rosterId).score, 0) /
          has.reduce((sum, component) => sum + weights[component], 0))
      : null;
    return {
      rosterId: team.rosterId,
      team: team.name,
      rating,
      rank: null,
      components: Object.fromEntries(
        has.map((component) => {
          const { rank, score } = ranks[component].get(team.rosterId);
          return [component, { ...own[component], rank, score: round1(score) }];
        }),
      ),
      ...(teamGaps.length ? { unavailable: teamGaps, weightsUsed: teamWeights } : {}),
    };
  });

  const ratingRanks = rankComponent(
    rated.filter((team) => team.rating !== null).map((team) => ({ rosterId: team.rosterId, value: team.rating })),
    'higher',
  );
  for (const team of rated) team.rank = ratingRanks.get(team.rosterId)?.rank ?? null;

  const unavailable = components
    .filter((component) => leagueGap[component])
    .map((component) => ({ component, reason: leagueGap[component] }));
  const weightsUsed = used.length ? rescale(weights, used) : null;

  return {
    formatType,
    preset,
    weights: { ...weights },
    weightsUsed,
    window: {
      weeks: window.map((entry) => entry.week),
      ...(windowMissing.length ? { missingWeeks: windowMissing } : {}),
      lineupWeeks: inputs.lineupWeeks,
      shortWeekStarters: inputs.shortWeekStarters,
    },
    components: Object.fromEntries(used.map((component) => [component, STRENGTH_COMPONENTS[component]])),
    unavailable,
    ...(unavailable.length ? { note: describeRescale(unavailable, used, weightsUsed) } : {}),
    valueSource:
      hasMarket && (used.includes('market_value') || used.includes('draft_capital'))
        ? { source: market.source ?? null, label: market.label ?? null, week: market.week ?? null, fetchedAt: market.fetchedAt ?? null }
        : null,
    teams: rated,
  };
}

/** The sentence that says what was left out and how the rest was reweighted. */
function describeRescale(unavailable, used, weightsUsed) {
  const left = unavailable.map((entry) => entry.component).join(', ');
  if (!used.length) {
    return `No component could be computed (${left}), so there is no strength rating this time. Do not give one.`;
  }
  const shares = used.map((component) => `${component} ${weightsUsed[component]}`).join(', ');
  return (
    `Left out because this league cannot supply them: ${left}. They count as nothing, not as zero: ` +
    `the rating is built from ${used.join(', ')} alone, with their weights scaled back up to 1.0 (${shares}).`
  );
}
