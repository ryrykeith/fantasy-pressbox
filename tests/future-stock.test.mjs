/**
 * The future stock edition (src/futureStock.mjs, prompts/future-stock.md): a
 * dynasty ranking of who is set up for the next three seasons.
 *
 * Built on the operator's league after week 4 (tests/fixtures), with rosters
 * invented to make the motivating case concrete. Taco Tuesday is a contender
 * whose points come from an old core, and it holds no 2027 1st or 2nd. Rebuild Szn
 * is 1-3 with young starters and two 2027 1sts: its own, projected 1.02, and
 * Taco Tuesday', projected 1.07, which would become 1.02 if Taco Tuesday missed
 * the playoffs. The Waiver Wire is the ideal: young starters who are already
 * producing.
 *
 * The ranking itself is the model's. What these tests pin down is that the
 * facts the ranking turns on reach the context, and that the prompt says out
 * loud how to weigh them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, resolveFutureStockWeights, validateRankingWeights } from '../src/config.mjs';

import { FUTURE_STOCK_TASK, refuseFutureStock } from '../src/futureStock.mjs';
import { buildContext, buildPrompt, TASKS } from '../src/promptContext.mjs';
import { buildRosterWindow } from '../src/analysis/rosterWindow.mjs';
import { readDraftOrder, readPickCapital } from '../src/pipeline.mjs';
import {
  RULE,
  TEAMS_2026_10_09,
  LEAGUE,
  TRADED_PICKS,
  TACO_TUESDAY,
  REBUILD_SZN,
  WAIVER_WIRE,
} from './fixtures/league-2026-week04.mjs';

const CONFIG_DRAFT = { order: RULE, rounds: null };
const FUTURE_STOCK_WEIGHTS = { roster_age_window: 0.6, future_draft_capital: 0.4 };

/** Five starters per team: position and age. Names are invented. */
const LINEUPS = {
  [TACO_TUESDAY]: [['QB', 34], ['RB', 30], ['WR', 31], ['WR', 30], ['TE', 33]],
  [REBUILD_SZN]: [['QB', 23], ['RB', 22], ['WR', 22], ['WR', 23], ['TE', 24]],
  [WAIVER_WIRE]: [['QB', 26], ['RB', 23], ['WR', 24], ['WR', 25], ['TE', 26]],
};
/** Points per starter per week: the old core and the young core both produce; Rebuild Szn's barely does. */
const WEEKLY_POINTS = { [TACO_TUESDAY]: 22, [REBUILD_SZN]: 9, [WAIVER_WIRE]: 21 };

const players = {};
const rosterIds = new Map();
for (const [rosterId, lineup] of Object.entries(LINEUPS)) {
  const ids = lineup.map(([position, age], i) => {
    const id = `p${rosterId}-${i}`;
    players[id] = { full_name: `Player ${rosterId}-${i}`, position, team: 'FA', age };
    return id;
  });
  rosterIds.set(Number(rosterId), ids);
}

const TEAMS = TEAMS_2026_10_09.map((team) => {
  const ids = rosterIds.get(team.rosterId) ?? [];
  return {
    ...team,
    manager: `manager ${team.rosterId}`,
    seasonPointsAgainst: 500,
    playerIds: ids,
    starterIds: ids,
    taxiIds: [],
    reserveIds: [],
  };
});

const WEEKS = [1, 2, 3, 4].map((week) => ({
  week,
  rosters: TEAMS.map((team) => ({
    rosterId: team.rosterId,
    starterIds: team.starterIds,
    playerPoints: Object.fromEntries(team.starterIds.map((id) => [id, WEEKLY_POINTS[team.rosterId] ?? 0])),
  })),
}));

const MARKET = {
  source: 'FantasyCalc',
  label: 'dynasty, superflex, 12 teams',
  fetchedAt: '2026-10-09T12:00:00.000Z',
  week: 4,
  players: {},
  picks: {
    '2027-1': { season: '2027', round: 1, generic: 6000, tiers: { Early: 8000, Mid: 6000, Late: 4500 } },
    '2027-2': { season: '2027', round: 2, generic: 2500, tiers: { Early: 3000, Mid: 2500, Late: 2000 } },
    '2027-3': { season: '2027', round: 3, generic: 1000, tiers: {} },
    '2028-1': { season: '2028', round: 1, generic: 5500, tiers: { Early: 7000, Mid: 5500, Late: 4000 } },
    '2028-2': { season: '2028', round: 2, generic: 2200, tiers: {} },
    '2028-3': { season: '2028', round: 3, generic: 900, tiers: {} },
  },
};

const BOARD = {
  draftYear: 2027,
  updated: '2026-10-01',
  entries: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((rank) => ({
    rank,
    name: `Prospect ${rank}`,
    position: 'WR',
    school: 'Example State',
    note: null,
    source: 'Example Rookie Board',
  })),
};

function testConfig() {
  return {
    leagueFormat: null,
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {},
    },
    rankings: { weights: { future_stock: FUTURE_STOCK_WEIGHTS, dynasty: { starting_lineup: 1 } }, weekly: {} },
    rookieDraft: CONFIG_DRAFT,
  };
}

function context({
  league = LEAGUE,
  market = MARKET,
  prospectBoard = BOARD,
  weeks = WEEKS,
  rookieDraft = CONFIG_DRAFT,
  withWindow = true,
} = {}) {
  const config = { ...testConfig(), rookieDraft };
  const fullLeague = { ...league, name: 'Fantasy Island', startingSlots: [], benchSlots: 0, taxiSlots: 0 };
  return buildContext({
    task: FUTURE_STOCK_TASK,
    config,
    league: fullLeague,
    teams: TEAMS,
    players,
    week: 4,
    transactions: [{ type: 'trade', week: 4, teams: ['A', 'B'], bid: null, moves: ['x'] }],
    draftOrder: readDraftOrder({ league: fullLeague, teams: TEAMS, config, tradedPicks: TRADED_PICKS }),
    prospectBoard,
    rosterWindow: withWindow ? buildRosterWindow({ teams: TEAMS, players, weeks }) : null,
    pickCapital: withWindow
      ? readPickCapital({ league: fullLeague, teams: TEAMS, tradedPicks: TRADED_PICKS, market, config })
      : null,
  });
}

const teamEntry = (ctx, name) => ctx.teams.find((entry) => entry.team === name);
const season = (entry, year) => entry.draftCapital.seasons.find((row) => row.season === year);
const unavailable = (ctx, field) => ctx.unavailable.find((entry) => entry.field === field);

/* ------------------------------------------------------------- refusals */

test('the edition is registered as a task with its own prompt', () => {
  assert.ok(TASKS.includes(FUTURE_STOCK_TASK));
});

test('refuses a redraft league, naming why: nothing carries over to a next season', () => {
  assert.throws(
    () => refuseFutureStock({ formatType: 'redraft' }),
    (error) => /dynasty edition/.test(error.message) && /redraft/.test(error.message) && /carries over/.test(error.message),
  );
});

test('refuses a guillotine league, naming why: there is no multi-season window', () => {
  assert.throws(
    () => refuseFutureStock({ formatType: 'guillotine' }),
    (error) => /guillotine/.test(error.message) && /no multi-season window/.test(error.message),
  );
});

test('a dynasty league, or one whose format is not known yet, is not refused', () => {
  assert.doesNotThrow(() => refuseFutureStock({ formatType: 'dynasty' }));
  assert.doesNotThrow(() => refuseFutureStock({ formatType: null }));
});

test('buildPrompt refuses a redraft or guillotine context too, for a caller that skips the CLI', () => {
  for (const type of ['redraft', 'guillotine']) {
    const ctx = context({ league: { ...LEAGUE, format: { type, source: 'declared' } } });
    assert.equal(ctx.rosterWindow, undefined, `${type}: no window reaches the context`);
    assert.throws(() => buildPrompt({ task: FUTURE_STOCK_TASK, context: ctx }), new RegExp(type));
  }
});

test('buildPrompt refuses a dynasty context built without the window and the capital', () => {
  assert.throws(
    () => buildPrompt({ task: FUTURE_STOCK_TASK, context: context({ withWindow: false }) }),
    /roster window and the draft capital/,
  );
});

/* ------------------------------------------------- the motivating case */

test('the old contender with no picks: old production, no 2027 1st or 2nd, net negative capital', () => {
  const jd = teamEntry(context(), 'Taco Tuesday');

  // Every point came from players 29 and over.
  assert.equal(jd.window.starterPointsByAgeBand['29+'], '440 points, 100% of starter points');
  assert.equal(jd.window.starterPointsByAgeBand['<25'], '0 points, 0% of starter points');
  assert.equal(jd.window.byPosition.RB, 'roster 1 (mean 30, median 30, 30-30); starting 1 (mean 30, median 30, 30-30)');

  const y2027 = season(jd, '2027');
  assert.deepEqual(
    y2027.picks.map((pick) => [pick.pick, pick.originalTeam]),
    [
      ['2027 round 3', 'Lowered Expectations'],
      ['2027 round 3', 'Rebuild Szn'],
      ['2027 round 3', 'Taco Tuesday'],
      ['2027 round 4', 'Taco Tuesday'],
      ['2027 round 5', 'Taco Tuesday'],
    ],
    'Taco Tuesday holds no 2027 1st or 2nd',
  );
  assert.ok(jd.draftCapital.horizon.netValue < 0);
  assert.equal(jd.record, '2-2');
});

test("Rebuild Szn's two 1sts are placed at 1.02 and 1.07, and the 1.07 jumps to 1.02 if Taco Tuesday misses the playoffs", () => {
  const rebuildSzn = teamEntry(context(), 'Rebuild Szn');
  const firsts = season(rebuildSzn, '2027').picks.filter((pick) => pick.pick === '2027 round 1');
  assert.deepEqual(
    firsts.map((pick) => [pick.originalTeam, pick.projectedPick, pick.tier, pick.value]),
    [
      ['Rebuild Szn', '1.02', 'Early', 8000],
      ['Taco Tuesday', '1.07', 'Mid', 6000],
    ],
  );
  const jdFirst = firsts[1];
  assert.equal(jdFirst.ifOriginalTeamCrosses.pick, '1.02');
  assert.equal(jdFirst.ifOriginalTeamCrosses.picksMoved, 5);
  assert.deepEqual(
    jdFirst.boardAroundPick.map((entry) => entry.rank),
    [6, 7, 8],
  );
});

test('young starters who have not produced are visible as such: high youth share, low points', () => {
  const ctx = context();
  const rebuildSzn = teamEntry(ctx, 'Rebuild Szn');
  const waiverWire = teamEntry(ctx, 'The Waiver Wire');
  assert.equal(rebuildSzn.window.starterPointsByAgeBand['<25'], '180 points, 100% of starter points');
  // The ideal: just as young a core, and more than twice the production.
  assert.equal(waiverWire.window.starterPoints, 420);
  assert.ok(waiverWire.window.starterPoints > 2 * rebuildSzn.window.starterPoints);
});

test('no pick outside the projected draft is placed in a tier or a slot', () => {
  const ctx = context();
  for (const entry of ctx.teams) {
    for (const pick of season(entry, '2028').picks) {
      assert.equal(pick.tier, undefined, `${entry.team} ${pick.pick}`);
      assert.equal(pick.projectedPick, undefined, `${entry.team} ${pick.pick}`);
      assert.equal(pick.boardAroundPick, undefined, `${entry.team} ${pick.pick}`);
    }
  }
  const noSlot = unavailable(ctx, 'projectedDraftSlot');
  assert.ok(noSlot.instruction.startsWith('For a 2028 pick: '));
  assert.match(noSlot.instruction, /Do not place any pick in a tier/);
});

/* ------------------------------------------------- what travels, and what does not */

test('the prospect board travels with its source, under the trade report\'s rules', () => {
  const ctx = context();
  assert.ok(ctx.prospectBoard.prospects.every((p) => p.source === 'Example Rookie Board'));
  assert.ok(unavailable(ctx, 'prospectsNotOnBoard'));
  assert.match(unavailable(ctx, 'boardRankIsNotAvailability').instruction, /Do not say a pick will be/);
  // A trade edition's caveat about the day of the trade means nothing here.
  assert.equal(unavailable(ctx, 'projectedSlotAtTradeTime'), undefined);
});

test('without a board, the class is unknown and no prospect is named', () => {
  const ctx = context({ prospectBoard: null });
  assert.equal(ctx.prospectBoard, undefined);
  assert.match(unavailable(ctx, 'prospectBoard').instruction, /Do not name, rank or describe any/);
  const rebuildSzn = teamEntry(ctx, 'Rebuild Szn');
  assert.ok(season(rebuildSzn, '2027').picks.every((pick) => pick.boardAroundPick === undefined));
});

test('without a declared draft order no pick has a slot and no prospect may be named', () => {
  const ctx = context({ rookieDraft: null });
  assert.equal(ctx.draftProjection, undefined);
  assert.equal(ctx.prospectBoard, undefined);
  const rebuildSzn = teamEntry(ctx, 'Rebuild Szn');
  assert.ok(season(rebuildSzn, '2027').picks.every((pick) => pick.projectedPick === undefined && pick.tier === undefined));
  assert.ok(unavailable(ctx, 'projectedDraftSlot'));
  assert.ok(unavailable(ctx, 'prospectBoard'));
});

test('without a market, picks carry no values and the edition is told not to invent one', () => {
  const ctx = context({ market: { unavailable: 'FantasyCalc did not answer' } });
  const jd = teamEntry(ctx, 'Taco Tuesday');
  assert.equal(jd.draftCapital.horizon.value, undefined);
  assert.equal(season(jd, '2027').picks[0].value, undefined);
  assert.match(unavailable(ctx, 'pickValues').why, /FantasyCalc did not answer/);
});

test('with no week on disk, production is named as unknown rather than read as zero', () => {
  const ctx = context({ weeks: [] });
  assert.match(unavailable(ctx, 'productionByAge').instruction, /unproven young roster is still unproven/);
});

test('no standings table, no transaction colour, no movement', () => {
  const ctx = context();
  assert.equal(ctx.standings, undefined);
  assert.equal(ctx.transactions, undefined);
  assert.equal(unavailable(ctx, 'transactions'), undefined);
  assert.ok(unavailable(ctx, 'previousFutureStock'));
  assert.ok(unavailable(ctx, 'playerProjections'));
  assert.equal(ctx.teams.length, 12);
});

/* ------------------------------------------------- the judgement the prompt carries */

test('the prompt ranks on three seasons and carries the guard against over-projection', () => {
  const prompt = buildPrompt({ task: FUTURE_STOCK_TASK, context: context() });
  const guards = [
    /next three seasons/,
    /An old contender with no picks ranks low/,
    /near the \*\*bottom\*\* of this ranking, however good its record is/,
    /Youth without production is potential, not value/,
    /Cite this split for\s+every team/,
    /Current production still counts/,
    /29-year-old running back is near the end/,
    /A projected pick is still a projection/,
    /never outweighs a productive young core/,
    /The same guard covers picks and players/,
    /A board rank is a ranking,\s+not a promise/,
    /Rank every team in `teams`, each exactly once/,
  ];
  for (const guard of guards) assert.match(prompt, guard);
});

/* ------------------------------------------------------ weights and the CLI */

test('the edition is handed its own weight set, not the dynasty one', () => {
  const ctx = context();
  assert.deepEqual(ctx.editorial.rankingWeights, FUTURE_STOCK_WEIGHTS);
  assert.match(buildPrompt({ task: FUTURE_STOCK_TASK, context: ctx }), /editorial\.rankingWeights/);
});

test('a config with no future_stock set is refused rather than ranked on the dynasty weights', () => {
  const config = { ...testConfig(), rankings: { weights: { dynasty: { starting_lineup: 1 } }, weekly: {} } };
  assert.throws(
    () =>
      buildContext({
        task: FUTURE_STOCK_TASK,
        config,
        league: { ...LEAGUE, startingSlots: [], benchSlots: 0, taxiSlots: 0 },
        teams: TEAMS,
        players,
        week: 4,
      }),
    /weights\.future_stock/,
  );
});

test('config/rankings.yml ships a future_stock set that validates, sums to 1.0 and has an age factor', () => {
  const { rankings } = loadConfig();
  const weights = resolveFutureStockWeights(rankings);
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `sums to ${sum}`);
  assert.doesNotThrow(() => validateRankingWeights(rankings.weights));
  assert.ok(weights.roster_age_window > 0, 'an age factor, which the dynasty set lacks');
  assert.equal(rankings.weights.dynasty.roster_age_window, undefined);
  assert.ok(weights.future_draft_capital > rankings.weights.dynasty.future_draft_capital);
  assert.ok(weights.starting_lineup < rankings.weights.dynasty.starting_lineup);
});

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

test('--help documents the command with an example', () => {
  const { stdout } = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.match(stdout, /^ {2}future-stock {2,}Rank teams/m);
  assert.match(stdout, /node src\/cli\.mjs future-stock --week \d+ --generate/);
});

for (const formatType of ['redraft', 'guillotine']) {
  test(`the command refuses a declared ${formatType} league before contacting Sleeper`, () => {
    // A league folder of its own: the command refuses to run outside one,
    // which would hide the refusal under test.
    const workspace = mkdtempSync(join(tmpdir(), 'pressbox-future-stock-'));
    writeFileSync(join(workspace, '.env'), '');
    const result = spawnSync(process.execPath, [cli, 'future-stock'], {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, SLEEPER_LEAGUE_ID: '1', LEAGUE_FORMAT: formatType },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /`future-stock` is a dynasty edition/);
  });
}
