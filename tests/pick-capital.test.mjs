/**
 * Pick capital across the tradeable drafts (src/analysis/pickCapital.mjs and
 * src/pipeline.mjs#readPickCapital): every held pick priced from the saved
 * FantasyCalc snapshot, summed per season and across the horizon, with the
 * net against each team's own picks as the figure teams compare on.
 *
 * The league is the mock one after week 4 (tests/fixtures/mock-dynasty-league.mjs):
 * Taco Tuesday has traded its 2027 1st to Rebuild Szn and its 2nd to Lowered Expectations, and
 * holds three 2027 3rds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPickCapital, pickCapitalSeasons, pickTier, pickPrice } from '../src/analysis/pickCapital.mjs';
import { readPickCapital } from '../src/pipeline.mjs';
import {
  LOWERED_EXPECTATIONS,
  TACO_TUESDAY,
  REBUILD_SZN,
  LEAGUE,
  RULE,
  TEAMS_AFTER_WEEK_4,
  TRADED_PICKS,
} from './fixtures/mock-dynasty-league.mjs';

const CONFIG = { rookieDraft: { order: RULE, rounds: null } };

/** FantasyCalc's shape after normalizeMarketValues: 2027 and 2028 rounds 1-4, no 5ths. */
function marketPick(season, round, generic, tiers = {}) {
  return { season, round, generic, tiers };
}
const MARKET = {
  source: 'FantasyCalc',
  label: 'dynasty, superflex, 12 teams',
  fetchedAt: '2026-10-09T12:00:00.000Z',
  week: 4,
  players: {},
  picks: {
    '2027-1': marketPick('2027', 1, 6000, { Early: 8000, Mid: 6000, Late: 4500 }),
    '2027-2': marketPick('2027', 2, 2500, { Early: 3000, Mid: 2500, Late: 2000 }),
    '2027-3': marketPick('2027', 3, 1000),
    '2027-4': marketPick('2027', 4, 400),
    '2028-1': marketPick('2028', 1, 5500, { Early: 7000, Mid: 5500, Late: 4000 }),
    '2028-2': marketPick('2028', 2, 2200),
    '2028-3': marketPick('2028', 3, 900),
    '2028-4': marketPick('2028', 4, 350),
  },
};

const capital = (overrides = {}) =>
  readPickCapital({
    league: LEAGUE,
    teams: TEAMS_AFTER_WEEK_4,
    tradedPicks: TRADED_PICKS,
    market: MARKET,
    config: CONFIG,
    ...overrides,
  });

const teamRow = (result, rosterId) => result.teams.find((row) => row.rosterId === rosterId);
const seasonRow = (row, season) => row.seasons.find((entry) => entry.season === season);

test('the tier is the third of the round a pick falls in', () => {
  const tiers = Array.from({ length: 12 }, (_, i) => pickTier(i + 1, 12));
  assert.deepEqual(tiers, [
    'Early', 'Early', 'Early', 'Early',
    'Mid', 'Mid', 'Mid', 'Mid',
    'Late', 'Late', 'Late', 'Late',
  ]);
  assert.deepEqual(
    Array.from({ length: 10 }, (_, i) => pickTier(i + 1, 10)),
    ['Early', 'Early', 'Early', 'Mid', 'Mid', 'Mid', 'Late', 'Late', 'Late', 'Late'],
  );
});

test('the horizon is the seasons with tradeable or priced picks, never a fixed three', () => {
  assert.deepEqual(
    pickCapitalSeasons({ tradedSeasons: ['2028', '2027'], pricedSeasons: ['2027', '2028'], nextDraft: '2027' }),
    ['2027', '2028'],
  );
  // No trades and no market still leaves the draft the standings decide.
  assert.deepEqual(pickCapitalSeasons({ tradedSeasons: [], pricedSeasons: [], nextDraft: '2027' }), ['2027']);

  const result = capital();
  assert.deepEqual(result.seasons, ['2027', '2028']);
  // A 2029 pick listed nowhere is not a column; a 2029 trade would make it one.
  assert.ok(!result.seasons.includes('2029'));
  const with2029 = capital({
    tradedPicks: [...TRADED_PICKS, { season: '2029', round: 1, roster_id: REBUILD_SZN, owner_id: LOWERED_EXPECTATIONS }],
  });
  assert.deepEqual(with2029.seasons, ['2027', '2028', '2029']);
});

test('a spent draft is outside the horizon even when Sleeper still lists its moves', () => {
  const result = capital({
    tradedPicks: [...TRADED_PICKS, { season: '2026', round: 1, roster_id: REBUILD_SZN, owner_id: LOWERED_EXPECTATIONS }],
  });
  assert.deepEqual(result.seasons, ['2027', '2028']);
});

test('Taco Tuesday holds no 2027 1st or 2nd but three 3rds, and is net negative', () => {
  const taco = teamRow(capital(), TACO_TUESDAY);
  const y2027 = seasonRow(taco, '2027');
  assert.deepEqual(
    y2027.picks.map((pick) => [pick.round, pick.originalTeam]),
    [
      [3, 'Lowered Expectations'],
      [3, 'Rebuild Szn'],
      [3, 'Taco Tuesday'],
      [4, 'Taco Tuesday'],
      [5, 'Taco Tuesday'],
    ],
  );
  assert.equal(y2027.picksHeld, 5);
  assert.equal(y2027.baseline, 5);
  assert.equal(y2027.netPicks, 0);
  // Counting says nothing changed; pricing says the 1st and 2nd were the capital.
  assert.equal(y2027.value, 1000 * 3 + 400);
  assert.equal(y2027.ownValue, 6000 + 2500 + 1000 + 400);
  assert.equal(y2027.netValue, y2027.value - y2027.ownValue);
  assert.ok(taco.horizon.netValue < 0);
});

test("the projected draft's 1sts are priced at their projected tier and labelled an estimate", () => {
  const result = capital();
  assert.deepEqual(result.projectedDraft, { season: '2027', status: 'projected' });
  const rebuildSzn = seasonRow(teamRow(result, REBUILD_SZN), '2027');
  const firsts = rebuildSzn.picks.filter((pick) => pick.round === 1);
  assert.deepEqual(firsts, [
    {
      round: 1,
      originalRosterId: REBUILD_SZN,
      originalTeam: 'Rebuild Szn',
      projectedPick: '1.02',
      tier: 'Early',
      value: 8000,
      basis: 'projected_tier',
    },
    {
      round: 1,
      originalRosterId: TACO_TUESDAY,
      originalTeam: 'Taco Tuesday',
      projectedPick: '1.07',
      tier: 'Mid',
      value: 6000,
      basis: 'projected_tier',
    },
  ]);
});

test('later rounds of the projected draft use the generic value until the round order is declared', () => {
  const loweredExpectations2027 = seasonRow(teamRow(capital(), LOWERED_EXPECTATIONS), '2027');
  const tacoSecond = loweredExpectations2027.picks.find((pick) => pick.round === 2 && pick.originalTeam === 'Taco Tuesday');
  assert.deepEqual(tacoSecond, {
    round: 2,
    originalRosterId: TACO_TUESDAY,
    originalTeam: 'Taco Tuesday',
    value: 2500,
    basis: 'generic',
  });

  // A snake order puts the 1.07 team at 2.06: still Mid.
  const snake = capital({ config: { rookieDraft: { order: RULE, rounds: 'snake' } } });
  const snakeSecond = seasonRow(teamRow(snake, LOWERED_EXPECTATIONS), '2027').picks.find(
    (pick) => pick.round === 2 && pick.originalTeam === 'Taco Tuesday',
  );
  assert.deepEqual(snakeSecond, {
    round: 2,
    originalRosterId: TACO_TUESDAY,
    originalTeam: 'Taco Tuesday',
    projectedPick: '2.06',
    tier: 'Mid',
    value: 2500,
    basis: 'projected_tier',
  });
});

test('a later draft uses the generic round value', () => {
  const rebuildSzn2028 = seasonRow(teamRow(capital(), REBUILD_SZN), '2028');
  const first = rebuildSzn2028.picks.find((pick) => pick.round === 1);
  assert.deepEqual(first, {
    round: 1,
    originalRosterId: REBUILD_SZN,
    originalTeam: 'Rebuild Szn',
    value: 5500,
    basis: 'generic',
  });
});

test('a pick the market does not price is unpriced, never given a value', () => {
  const jd2027 = seasonRow(teamRow(capital(), TACO_TUESDAY), '2027');
  const fifth = jd2027.picks.find((pick) => pick.round === 5);
  assert.deepEqual(fifth, {
    round: 5,
    originalRosterId: TACO_TUESDAY,
    originalTeam: 'Taco Tuesday',
    value: null,
    basis: 'unpriced',
  });
  assert.equal(jd2027.unpricedPicks, 1);
  assert.equal(teamRow(capital(), TACO_TUESDAY).horizon.unpricedPicks, 2);
});

test('the horizon sums the seasons, and the net figure balances across the league', () => {
  const result = capital();
  for (const row of result.teams) {
    const sum = (field) => row.seasons.reduce((total, season) => total + season[field], 0);
    assert.equal(row.horizon.picksHeld, sum('picksHeld'));
    assert.equal(row.horizon.baseline, sum('baseline'));
    assert.equal(row.horizon.netPicks, sum('netPicks'));
    assert.equal(row.horizon.value, sum('value'));
    assert.equal(row.horizon.netValue, sum('netValue'));
  }
  // Picks only change hands, so the league's net is zero.
  assert.equal(result.teams.reduce((total, row) => total + row.horizon.netValue, 0), 0);
  assert.equal(result.teams.reduce((total, row) => total + row.horizon.netPicks, 0), 0);
  // 2028: Rebuild Szn's 2nd went to Taco Tuesday, Taco Tuesday's 3rd to Rebuild Szn.
  assert.equal(seasonRow(teamRow(result, REBUILD_SZN), '2028').netValue, 900 - 2200);
});

test('a league with no traded future picks gives every team equal capital, not nulls', () => {
  const result = capital({ tradedPicks: [] });
  assert.deepEqual(result.seasons, ['2027', '2028']);
  assert.equal(result.teams.length, 12);
  for (const row of result.teams) {
    assert.equal(row.horizon.picksHeld, 10);
    assert.equal(row.horizon.baseline, 10);
    assert.equal(row.horizon.netPicks, 0);
    assert.equal(row.horizon.netValue, 0);
  }
});

test('without a market the counts stand and every value is null, with the reason', () => {
  const result = capital({ market: { unavailable: 'FantasyCalc did not answer' } });
  assert.equal(result.valueSource, null);
  assert.equal(result.marketUnavailable, 'FantasyCalc did not answer');
  // The horizon falls back to the drafts Sleeper reports moves for.
  assert.deepEqual(result.seasons, ['2027', '2028']);
  const taco = teamRow(result, TACO_TUESDAY);
  assert.equal(taco.horizon.picksHeld, 10);
  assert.equal(taco.horizon.value, null);
  assert.equal(taco.horizon.netValue, null);
  assert.equal(seasonRow(taco, '2027').picks[0].basis, 'unpriced');
});

test('without a declared draft order the projected draft is priced generically', () => {
  const result = capital({ config: null });
  assert.equal(result.projectedDraft, null);
  const first = seasonRow(teamRow(result, REBUILD_SZN), '2027').picks.find((pick) => pick.round === 1);
  assert.deepEqual(first, {
    round: 1,
    originalRosterId: REBUILD_SZN,
    originalTeam: 'Rebuild Szn',
    value: 6000,
    basis: 'generic',
  });
});

test('a tier the market does not list falls back to the generic value', () => {
  const pick = { season: '2027', round: 1, originalRosterId: REBUILD_SZN };
  const draftOrder = {
    draftSeason: '2027',
    roundOrder: null,
    slots: [REBUILD_SZN, LOWERED_EXPECTATIONS, TACO_TUESDAY].map((originalRosterId, i) => ({ originalRosterId, slot: i + 1 })),
  };
  const market = { picks: { '2027-1': marketPick('2027', 1, 6000, {}) } };
  assert.deepEqual(pickPrice(pick, { market, draftOrder }), {
    projectedPick: '1.01',
    tier: 'Early',
    value: 6000,
    basis: 'generic',
  });
});

test('a redraft league has no pick capital', () => {
  assert.equal(capital({ league: { ...LEAGUE, format: { type: 'redraft', source: 'declared' } } }), null);
});

test('buildPickCapital reads normalized picks only', () => {
  const result = buildPickCapital({
    teams: [{ rosterId: 1, name: 'A' }, { rosterId: 2, name: 'B' }],
    seasons: ['2027'],
    picks: [
      { season: '2027', round: 1, originalRosterId: 1, ownerRosterId: 2 },
      { season: '2027', round: 1, originalRosterId: 2, ownerRosterId: 2 },
    ],
    market: null,
    draftOrder: null,
  });
  assert.equal(result.teams[0].horizon.picksHeld, 0);
  assert.equal(result.teams[0].horizon.netPicks, -1);
  assert.equal(result.teams[1].horizon.netPicks, 1);
  assert.equal(result.marketUnavailable, null);
});
