/**
 * The future stock edition: a dynasty ranking of who is set up for the next
 * three seasons, weighing roster age, where the points come from, and future
 * draft capital alongside current production.
 *
 * This module is the edition's gate and its facts. It refuses the formats the
 * edition means nothing in, and turns the roster window
 * (src/analysis/rosterWindow.mjs) and priced pick capital
 * (src/analysis/pickCapital.mjs) into the compact per-team view the model
 * reads. Picks of the draft this season's standings decide are placed at their
 * projected slot with src/tradePicks.mjs#pickProjection, under the same rules
 * the trade report follows (projectedPicksUnavailable). Every absence becomes
 * an `unavailable` entry with an instruction, as everywhere else in
 * src/promptContext.mjs.
 *
 * Nothing here judges. How much a 1.02 is worth against a productive
 * 26-year-old core is the prompt's call (prompts/future-stock.md), and the
 * guard against ranking youth and picks over production lives there.
 */
import { pickProjection, projectedPicksUnavailable, tradeProspectBoard } from './tradePicks.mjs';

/** The edition's task name, and the command that builds it. */
export const FUTURE_STOCK_TASK = 'future-stock';

const NOT_DYNASTY_BECAUSE = {
  redraft:
    'this is a redraft league, so there is no next three seasons to rank: every roster is drafted again ' +
    'from scratch next year and no player or pick carries over.',
  guillotine:
    'this is a guillotine league, where the lowest score each week is eliminated. A team plays for this ' +
    'week or goes out, so there is no multi-season window and a future pick is worth nothing to it.',
};

/**
 * Refuses a future stock edition for a league it means nothing in. A null
 * format (not yet known, before Sleeper has been asked) is not refused.
 */
export function refuseFutureStock({ formatType }) {
  if (!formatType || formatType === 'dynasty') return;
  const because = NOT_DYNASTY_BECAUSE[formatType] ?? `this is a ${formatType} league, with no multi-season window.`;
  throw new Error(`\`${FUTURE_STOCK_TASK}\` is a dynasty edition: ${because}`);
}

/** "3 (mean 27.3, median 27, 24-31)" — one age summary as a line. */
function ageLine(summary) {
  if (!summary || summary.count === 0) return 'none';
  const unknown = summary.unknownAge ? `, ${summary.unknownAge} with no age on record` : '';
  if (summary.meanAge === null) return `${summary.count}, no ages on record`;
  return (
    `${summary.count} (mean ${summary.meanAge}, median ${summary.medianAge}, ` +
    `${summary.youngest}-${summary.oldest}${unknown})`
  );
}

/** One team's age structure and production by age band, as lines. */
function windowView(row) {
  return {
    startingLineupAge: ageLine(row.starters),
    pointsWeightedStarterAge: row.starters.pointsWeightedMeanAge,
    byPosition: Object.fromEntries(
      Object.entries(row.positions).map(([position, summary]) => [
        position,
        `roster ${ageLine(summary)}; starting ${ageLine(summary.starters)}`,
      ]),
    ),
    starterPoints: row.production.totalPoints,
    starterPointsByAgeBand: Object.fromEntries(
      row.production.bands.map(({ label, points, share }) => [
        label,
        share === null ? `${points} points` : `${points} points, ${Math.round(share * 100)}% of starter points`,
      ]),
    ),
  };
}

/** A held pick: whose it was, its price, and where it projects when its draft is projected. */
function heldPickView(pick, season, { draftOrder, board, priced }) {
  const projection = pickProjection(
    { season, round: pick.round, originalRosterId: pick.originalRosterId },
    { draftOrder, board },
  );
  return {
    pick: `${season} round ${pick.round}`,
    originalTeam: pick.originalTeam,
    ...(pick.tier ? { tier: pick.tier } : {}),
    ...(priced ? { value: pick.value, basis: pick.basis } : {}),
    ...(projection ?? {}),
  };
}

const capitalTotals = (row, priced) => ({
  picksHeld: row.picksHeld,
  ownPicks: row.baseline,
  netPicks: row.netPicks,
  ...(priced ? { value: row.value, netValue: row.netValue, unpricedPicks: row.unpricedPicks } : {}),
});

/** One team's future picks across the horizon. */
function draftCapitalView(row, { draftOrder, board, priced }) {
  return {
    horizon: capitalTotals(row.horizon, priced),
    seasons: row.seasons.map((season) => ({
      season: season.season,
      ...capitalTotals(season, priced),
      picks: season.picks.map((pick) => heldPickView(pick, season.season, { draftOrder, board, priced })),
    })),
  };
}

/**
 * Everything the edition says about each team's window, as facts.
 *
 * @param teams        normalized teams, in the order the context lists them
 * @param rosterWindow src/analysis/rosterWindow.mjs#buildRosterWindow
 * @param pickCapital  src/analysis/pickCapital.mjs#buildPickCapital
 * @param draftOrder   the projected order for the draft the standings decide, or null
 * @param board        the declared prospect board for that class, or null
 * @returns {{ byRosterId: Map, window, draftCapital, prize, heldPicks }}
 *          per-team entries to attach to each team's roster view, the two
 *          league-level legends, the board cut down to the prospects some
 *          held 1st is around, and every held pick (for the unavailable list)
 */
export function futureStockView({ teams, rosterWindow, pickCapital, draftOrder = null, board = null }) {
  const priced = Boolean(pickCapital.valueSource);
  // The board only travels for the class the projected order decides.
  const classBoard = draftOrder && board ? board : null;
  const windowRows = new Map(rosterWindow.teams.map((row) => [row.rosterId, row]));
  const capitalRows = new Map(pickCapital.teams.map((row) => [row.rosterId, row]));

  const byRosterId = new Map(
    teams.map((team) => {
      const windowRow = windowRows.get(team.rosterId);
      const capitalRow = capitalRows.get(team.rosterId);
      return [
        team.rosterId,
        {
          ...(windowRow ? { window: windowView(windowRow) } : {}),
          ...(capitalRow ? { draftCapital: draftCapitalView(capitalRow, { draftOrder, board: classBoard, priced }) } : {}),
        },
      ];
    }),
  );

  const heldPicks = pickCapital.teams.flatMap((row) =>
    row.seasons.flatMap((season) =>
      season.picks.map((pick) => ({ season: season.season, round: pick.round, originalRosterId: pick.originalRosterId })),
    ),
  );
  const projections = heldPicks.map((pick) => pickProjection(pick, { draftOrder, board: classBoard })).filter(Boolean);

  return {
    byRosterId,
    window: {
      ageBands: rosterWindow.bands,
      weeksCovered: rosterWindow.weeksCovered,
      basis:
        "Ages are each player's age today. `starterPointsByAgeBand` splits the points each team's starters " +
        'scored in `weeksCovered` by the age of the player who scored them; bench points are not counted, ' +
        'and a traded player\'s points stay with the team that started him. `pointsWeightedStarterAge` is ' +
        'the average age of those starters, weighted by the points each one scored.',
    },
    draftCapital: {
      seasons: pickCapital.seasons,
      ...(pickCapital.projectedDraft ? { projectedDraft: pickCapital.projectedDraft } : {}),
      ...(priced
        ? {
            valueSource: pickCapital.valueSource,
            scale:
              'Unitless trade value; higher is worth more. `netValue` is what a team holds minus what its own ' +
              'picks are worth at the same prices, wherever they are now, so it is zero for a team that has ' +
              'traded no picks and the league\'s net values sum to zero. A pick with `basis: unpriced` has no ' +
              'market price and adds nothing to any total.',
          }
        : {}),
    },
    prize: tradeProspectBoard(classBoard, projections),
    heldPicks,
  };
}

/**
 * What a future stock edition does not know, each with its instruction.
 *
 * @param window          futureStockView's `window`
 * @param draftCapital    futureStockView's `draftCapital`
 * @param heldPicks       futureStockView's `heldPicks`
 * @param draftProjection the context's draftProjection, or null
 * @param prize           the board as it reached the context, or null
 * @param marketUnavailable why pick values are missing, when they are
 */
export function futureStockUnavailable({ window, draftCapital, heldPicks, draftProjection, prize, marketUnavailable }) {
  const missing = [
    {
      field: 'previousFutureStock',
      why: 'No earlier future stock edition is on record, so there is nothing to measure movement against.',
      instruction:
        'Print no movement arrows and no previous ranks. Do not write ↑, ↓ or —, and do not compare this ' +
        'order with the weekly power rankings.',
    },
    {
      field: 'playerProjections',
      why:
        'No projection of any player\'s future production is included: only ages, the points each team\'s ' +
        'starters have scored this season, and the rosters.',
      instruction:
        'Do not predict that a player will break out, decline, or score any amount, and do not describe ' +
        'a young player\'s ceiling as if it were production. Describe a player\'s future only through his ' +
        'age, his position and what he has scored here.',
    },
  ];

  if (!window.weeksCovered.length) {
    missing.push({
      field: 'productionByAge',
      why: 'No completed week of this season is on disk, so no team has any starter points to split by age.',
      instruction:
        'Do not say any team is producing or failing to produce, and do not cite points by age band. Say ' +
        'once that production is not on record yet, and do not let age stand in for it: an unproven young ' +
        'roster is still unproven.',
    });
  }

  if (!draftCapital.valueSource) {
    missing.push({
      field: 'pickValues',
      why: `No trade-value market was available for this edition${marketUnavailable ? ` (${marketUnavailable})` : ''}.`,
      instruction:
        'Do not quote, estimate or recall a trade value for any pick. Compare draft capital by which picks ' +
        'a team holds, their rounds and their projected slots only.',
    });
  }

  missing.push(...projectedPicksUnavailable({ picks: heldPicks, draftProjection, board: prize }));

  // With a projected draft, projectedPicksUnavailable has already said what
  // the board allows. Without one, no pick has a slot to be in range of, so
  // the class stays out whether or not a board is declared.
  if (!draftProjection) {
    missing.push({
      field: 'prospectBoard',
      why: 'The rookie draft order is not projected, so no pick can be placed in range of any prospect.',
      instruction:
        'Do not name, rank or describe any college or rookie prospect, and do not say what any pick could ' +
        'become. Treat a pick as its round and its original team only.',
    });
  }

  missing.push(
    {
      field: 'pickTradeHistory',
      why: 'Who holds each pick is known; when it was traded and what was given for it are not included.',
      instruction:
        'Say who holds a pick and whose finish decides it. Do not say when it moved, what it cost, or who ' +
        'won the deal.',
    },
    {
      field: 'injuryDetail',
      why: 'Only Sleeper injury designations (in brackets after a player) are available, not injury news.',
      instruction: 'Do not describe an injury beyond the designation shown.',
    },
  );

  return missing;
}
