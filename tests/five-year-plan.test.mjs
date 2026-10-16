/**
 * The five-year plan's facts for one team (src/analysis/fiveYearPlan.mjs):
 * ages and age-curve stages for seasons S to S+4, today's starters against
 * their curves, the picks held for each draft, and today's strength, standing
 * and market value. Facts only: no projected points, records or titles.
 *
 * Every team, player and number below is invented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGE_BASIS,
  AGE_CURVE_STAGES,
  PICKS_ISSUE_UNKNOWN,
  ageCurveStage,
  buildFiveYearPlan,
  planSeasons,
} from '../src/analysis/fiveYearPlan.mjs';
import { buildPickCapital, pickCapitalSeasons } from '../src/analysis/pickCapital.mjs';
import { buildStrength } from '../src/analysis/strength.mjs';
import { PACKAGE_ROOT } from '../src/config.mjs';
import { futurePickOwnership } from '../src/league/draftCapital.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';
import { DEFAULT_RANKINGS, resolveAgeCurves, resolveSettings } from '../src/settings.mjs';

const SHIPPED = parseYaml(readFileSync(join(PACKAGE_ROOT, 'config', 'rankings.yml'), 'utf8'));
const CURVES = resolveAgeCurves(DEFAULT_RANKINGS);

/* ------------------------------------------------------------ the fixture */

const LEAGUE = { season: '2026', draftStatus: 'complete', draftRounds: 2 };

const PLAYERS = {
  q1: { name: 'Quill Thrower', position: 'QB', age: 29 },
  r1: { name: 'Rusty Plow', position: 'RB', age: 26 },
  r2: { name: 'Rookie Dash', position: 'RB', age: 21 },
  w1: { name: 'Wes Wideout', position: 'WR', age: 30 },
  t1: { name: 'Tully End', position: 'TE', age: 24 },
  k1: { name: 'Kip Boot', position: 'K', age: 33 },
  d1: { name: 'Gulls Defense', position: 'DEF' },
  x1: { name: 'Ageless Wonder', position: 'WR' },
  q2: { name: 'Other QB', position: 'QB', age: 24 },
  r3: { name: 'Other RB', position: 'RB', age: 25 },
};

const TEAMS = [
  {
    rosterId: 1,
    name: 'Bye Week Blues',
    playerIds: ['q1', 'r1', 'r2', 'w1', 't1', 'k1', 'd1', 'x1'],
    starterIds: ['q1', 'r1', 'w1', 't1', 'k1', 'd1', null],
    record: { wins: 3, losses: 1, ties: 0 },
    seasonPointsFor: 400,
  },
  {
    rosterId: 2,
    name: 'Punt Intended',
    playerIds: ['q2', 'r3'],
    starterIds: ['q2', 'r3'],
    record: { wins: 1, losses: 3, ties: 0 },
    seasonPointsFor: 380,
  },
];

const roster = (rosterId, starterIds, playerPoints) => ({ rosterId, starterIds, playerPoints });
const WEEKS = [
  {
    week: 1,
    rosters: [
      roster(1, ['q1', 'r1', 'w1', 't1', 'k1', 'd1'], { q1: 20, r1: 10, w1: 30, t1: 5, k1: 8, d1: 6 }),
      roster(2, ['q2', 'r3'], { q2: 15, r3: 12 }),
    ],
  },
  {
    week: 2,
    rosters: [
      roster(1, ['q1', 'r1', 'w1', 't1', 'k1', 'd1'], { q1: 20, r1: 10, w1: 0, t1: 5, k1: 2, d1: 4 }),
      roster(2, ['q2', 'r3'], { q2: 15, r3: 12 }),
    ],
  },
];

// 2027 picks have moved; nothing for 2028 is traded or priced.
const TRADED = [{ season: '2027', round: 1, originalRosterId: 2, ownerRosterId: 1, previousOwnerRosterId: 2 }];
const MARKET = {
  source: 'fantasycalc',
  label: 'FantasyCalc',
  week: 2,
  players: { q1: { value: 5000 }, r1: { value: 2000 }, w1: { value: 1000 }, q2: { value: 9000 } },
  picks: { '2027-1': { generic: 3000 }, '2027-2': { generic: 1000 } },
};

function pickCapital({ market = MARKET, traded = TRADED } = {}) {
  const seasons = pickCapitalSeasons({
    tradedSeasons: traded.map((pick) => pick.season),
    pricedSeasons: Object.keys(market?.picks ?? {}).map((key) => key.split('-')[0]),
    nextDraft: '2027',
  });
  const picks = seasons.flatMap((season) =>
    futurePickOwnership({ tradedPicks: traded, rosterIds: [1, 2], roundsPerDraft: 2, season }),
  );
  return buildPickCapital({ teams: TEAMS, seasons, picks, market });
}

function strength() {
  return buildStrength({
    formatType: 'dynasty',
    weights: DEFAULT_RANKINGS.strength.dynasty,
    inputs: { lineupWeeks: 4, shortWeekStarters: 1 },
    teams: TEAMS,
    players: PLAYERS,
    slots: ['QB', 'RB'],
    weeks: { settled: WEEKS, unavailable: null },
    market: MARKET,
    pickCapital: pickCapital(),
  });
}

function plan(overrides = {}) {
  return buildFiveYearPlan({
    league: LEAGUE,
    team: TEAMS[0],
    teams: TEAMS,
    players: PLAYERS,
    weeks: WEEKS,
    ageCurves: CURVES,
    pickCapital: pickCapital(),
    strength: strength(),
    market: MARKET,
    ...overrides,
  });
}

const player = (result, id) => result.players.find((row) => row.id === id);

/* ---------------------------------------------------------- ages, stages */

test('the plan covers seasons S to S+4 and says how ages are taken', () => {
  const result = plan();
  assert.deepEqual(result.seasons, ['2026', '2027', '2028', '2029', '2030']);
  assert.deepEqual(planSeasons(2030), ['2030', '2031', '2032', '2033', '2034']);
  assert.equal(result.ageBasis, AGE_BASIS);
  assert.match(result.ageBasis, /Sleeper/);
  assert.match(result.ageBasis, /one year per season/);
  assert.match(result.ageCurveBasis, /editorial judgement/);
  assert.deepEqual(result.ageCurves, CURVES);
  assert.deepEqual(result.team, { rosterId: 1, name: 'Bye Week Blues' });
});

test("each rostered player's age at each season's start, shifted a year per season, and his stage", () => {
  const result = plan();
  const quill = player(result, 'q1');
  assert.equal(quill.ageToday, 29);
  assert.equal(quill.starter, true);
  assert.deepEqual(
    quill.seasons.map(({ age, stage }) => [age, stage]),
    [[29, 'peak'], [30, 'peak'], [31, 'peak'], [32, 'peak'], [33, 'peak']],
  );
  const rusty = player(result, 'r1');
  assert.deepEqual(
    rusty.seasons.map(({ age, stage }) => [age, stage]),
    [[26, 'peak'], [27, 'declining'], [28, 'declining'], [29, 'declining'], [30, 'cliff']],
  );
  const rookie = player(result, 'r2');
  assert.equal(rookie.starter, false);
  assert.deepEqual(rookie.seasons.map(({ stage }) => stage), ['rising', 'rising', 'peak', 'peak', 'peak']);
});

test('a player with no age is unavailable, never aged 0; a defense and an uncurved position get no stage', () => {
  const result = plan();
  const ageless = player(result, 'x1');
  assert.deepEqual(ageless.unavailable, { field: 'age', reason: 'his player record has no age' });
  assert.equal(ageless.seasons, undefined);
  assert.equal(ageless.ageToday, undefined);

  assert.deepEqual(player(result, 'd1').unavailable, { field: 'age', reason: 'a team defense has no age' });

  const kicker = player(result, 'k1');
  assert.deepEqual(kicker.seasons.map(({ age }) => age), [33, 34, 35, 36, 37]);
  assert.ok(kicker.seasons.every((season) => !('stage' in season)));
  assert.match(kicker.unavailable.reason, /no curve for K/);

  const unknown = buildFiveYearPlan({
    league: LEAGUE,
    team: { rosterId: 1, name: 'Bye Week Blues', playerIds: ['ghost'], starterIds: ['ghost'] },
    players: {},
    ageCurves: CURVES,
  });
  assert.equal(unknown.players[0].unavailable.reason, 'he is not in the player dictionary');
  assert.equal(unknown.bySeason[0].startersPastDecline.count, 0);
  assert.equal(unknown.bySeason[0].startersPastDecline.withoutStage, 1);
});

test('ageCurveStage reads each stage from the first age of the next', () => {
  const curve = { peak: 24, decline: 28, cliff: 31 };
  assert.deepEqual([23, 24, 27, 28, 30, 31, 40].map((age) => ageCurveStage(age, curve)), [
    'rising', 'peak', 'peak', 'declining', 'declining', 'cliff', 'cliff',
  ]);
  assert.deepEqual(AGE_CURVE_STAGES, ['rising', 'peak', 'declining', 'cliff']);
});

/* ---------------------------------------------------------- the roll-ups */

test("per season: today's starters past their decline age, and the share of starter points before the cliff", () => {
  const result = plan();
  // Staged starters: Quill (QB 29), Rusty (RB 26), Wes (WR 30), Tully (TE 24).
  // The kicker has no curve and the defense no age: both are outside the counts.
  const [s2026, s2027, , , s2030] = result.bySeason;
  assert.deepEqual(s2026.startersPastDecline, {
    count: 1,
    of: 4,
    players: ['Wes Wideout'],
    withoutStage: 2,
  });
  assert.deepEqual(s2027.startersPastDecline.players, ['Rusty Plow', 'Wes Wideout']);

  // Points: Quill 40, Rusty 20, Wes 30, Tully 10 = 100 staged.
  assert.deepEqual(s2026.starterPointsBeforeCliff, { share: 1, points: 100, ofPoints: 100, pointsWithoutStage: 20 });
  // 2030: Rusty is 30 (RB cliff) and Wes 34 (WR cliff 32): 50 of 100 left.
  assert.equal(s2030.starterPointsBeforeCliff.share, 0.5);
  assert.equal(s2030.starterPointsBeforeCliff.points, 50);
  assert.deepEqual(result.starterProduction.weeksCovered, [1, 2]);
});

test('starter points with no settled week are unavailable, not 0', () => {
  const result = plan({ weeks: [] });
  for (const season of result.bySeason) {
    assert.deepEqual(season.starterPointsBeforeCliff, { unavailable: 'no settled week of this season is on file' });
  }
  // The age counts do not need points.
  assert.equal(result.bySeason[0].startersPastDecline.count, 1);
});

test("the roster by the roster window's age bands, each season", () => {
  const [s2026, s2027] = plan().bySeason;
  // Aged players: q1 29, r1 26, r2 21, w1 30, t1 24, k1 33, x1 unknown (the defense is left out).
  assert.deepEqual(s2026.rosterByAgeBand, [
    { label: '<25', count: 2 },
    { label: '25-28', count: 1 },
    { label: '29+', count: 3 },
    { label: 'unknown', count: 1 },
  ]);
  // A year on, Tully (25) joins Rusty (27) in 25-28.
  assert.deepEqual(s2027.rosterByAgeBand.map(({ count }) => count), [1, 2, 3, 1]);
});

/* ---------------------------------------------------------- picks */

test('picks per season come from pickCapital; a held draft and one of unknown issuance are unavailable', () => {
  const result = plan();
  const picks = Object.fromEntries(result.bySeason.map((season) => [season.season, season.picks]));
  assert.deepEqual(picks['2026'], { unavailable: "this season's rookie draft has been held" });
  assert.equal(picks['2027'].picksHeld, 3);
  assert.equal(picks['2027'].ownPicks, 2);
  assert.equal(picks['2027'].netPicks, 1);
  assert.equal(picks['2027'].value, 7000);
  assert.deepEqual(
    picks['2027'].picks.map((pick) => [pick.round, pick.originalTeam]),
    [[1, 'Bye Week Blues'], [1, 'Punt Intended'], [2, 'Bye Week Blues']],
  );
  for (const season of ['2028', '2029', '2030']) assert.deepEqual(picks[season], { unavailable: PICKS_ISSUE_UNKNOWN });
});

test('with no market and no trades past the next draft, later drafts are not claimed to be unissued', () => {
  const result = plan({ pickCapital: pickCapital({ market: { unavailable: 'fetch failed' }, traded: [] }) });
  const picks = Object.fromEntries(result.bySeason.map((season) => [season.season, season.picks]));
  for (const season of ['2028', '2029', '2030']) {
    assert.deepEqual(picks[season], { unavailable: PICKS_ISSUE_UNKNOWN });
  }
  // No season is ever called "not issued": no Sleeper horizon is documented,
  // so no season is known not to be issued.
  assert.ok(!JSON.stringify(result).toLowerCase().includes('not issued'));
  assert.match(PICKS_ISSUE_UNKNOWN, /is not known$/);
});

test('a draft inside the issued range that nothing touched holds the team its own picks, unpriced', () => {
  const traded = [...TRADED, { season: '2029', round: 2, originalRosterId: 1, ownerRosterId: 2, previousOwnerRosterId: 1 }];
  const result = plan({ pickCapital: pickCapital({ traded }) });
  const picks = Object.fromEntries(result.bySeason.map((season) => [season.season, season.picks]));
  assert.equal(picks['2028'].picksHeld, 2);
  assert.equal(picks['2028'].value, null);
  assert.ok(picks['2028'].picks.every((pick) => pick.basis === 'unpriced' && pick.originalTeam === 'Bye Week Blues'));
  assert.equal(picks['2029'].picksHeld, 1);
  assert.deepEqual(picks['2030'], { unavailable: PICKS_ISSUE_UNKNOWN });
});

test('a league with no pick capital gives its reason for every season', () => {
  const result = plan({ pickCapital: null, pickCapitalUnavailable: 'ESPN does not report traded picks' });
  for (const season of result.bySeason) {
    assert.deepEqual(season.picks, { unavailable: 'ESPN does not report traded picks' });
  }
});

/* ---------------------------------------------------------- today */

test("it carries today's strength rating and components, the league rank and the market value", () => {
  const result = plan();
  const rated = strength().teams.find((row) => row.rosterId === 1);
  assert.equal(result.strength.rating, rated.rating);
  assert.equal(result.strength.rank, rated.rank);
  assert.equal(result.strength.of, 2);
  assert.deepEqual(result.strength.components, rated.components);
  assert.ok(result.strength.legend.lineup);
  assert.equal(result.strength.weights, undefined, 'the house weights stay out');

  assert.deepEqual(result.standing, {
    rank: 1,
    of: 2,
    basis: "today's standings: wins (a tie is half a win), then points for",
  });

  assert.equal(result.marketValue.value, 8000);
  assert.equal(result.marketValue.rank, 2);
  assert.equal(result.marketValue.of, 2);
  assert.equal(result.marketValue.unpricedPlayers, 5);
});

test('a missing strength rating, standing or market is unavailable with its reason', () => {
  const result = plan({
    strength: null,
    strengthUnavailable: 'guillotine leagues get no strength rating',
    market: { unavailable: 'HTTP 503' },
    teams: TEAMS.map((team) => ({ ...team, record: { wins: 0, losses: 0, ties: 0 } })),
  });
  assert.deepEqual(result.strength, { unavailable: 'guillotine leagues get no strength rating' });
  assert.deepEqual(result.standing, { unavailable: 'no game of this season has been played yet' });
  assert.deepEqual(result.marketValue, { unavailable: 'FantasyCalc values could not be read (HTTP 503)' });
  assert.match(plan({ league: { ...LEAGUE, playoffSeeding: null } }).standing.unavailable, /not ordered/);
});

/* ---------------------------------------------------------- the guard */

/** Every key anywhere in a value, with its path. */
function keysOf(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((entry, index) => keysOf(entry, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => [`${path}.${key}`, ...keysOf(entry, `${path}.${key}`)]);
  }
  return [];
}

test('no projected points, records or titles anywhere in the output', () => {
  for (const result of [plan(), plan({ weeks: [], pickCapital: null, strength: null, market: null })]) {
    const keys = keysOf(result);
    const forbidden = keys.filter((path) => {
      const key = path.split('.').pop();
      return (
        /record|wins|losses|ties|title|champion|playoff|projection|forecast|expected/i.test(key) ||
        // A projected pick slot is a placement in the coming draft, not a forecast of play.
        (/^projected/i.test(key) && key !== 'projectedPick')
      );
    });
    assert.deepEqual(forbidden, []);
  }
});

test('the module imports nothing from node:', () => {
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'analysis', 'fiveYearPlan.mjs'), 'utf8');
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.doesNotMatch(source, /\bprocess\b|import\.meta/);
});

/* ---------------------------------------------------------- the curves */

test('the shipped age curves are the built-in ones and agree with the future stock prompt', () => {
  assert.deepEqual(SHIPPED.age_curves, DEFAULT_RANKINGS.age_curves);
  const prompt = readFileSync(join(PACKAGE_ROOT, 'prompts', 'future-stock.md'), 'utf8').replace(/\s+/g, ' ');

  // "A 29-year-old running back is near the end."
  assert.match(prompt, /29-year-old running back is near the end/);
  assert.equal(ageCurveStage(29, CURVES.RB), 'declining');
  assert.equal(ageCurveStage(30, CURVES.RB), 'cliff');
  // "A 29-year-old quarterback can have five good years left."
  assert.match(prompt, /29-year-old quarterback can have five good years left/);
  for (let age = 29; age < 34; age += 1) assert.equal(ageCurveStage(age, CURVES.QB), 'peak', `QB at ${age}`);
  // "Wide receivers and tight ends sit in between."
  assert.match(prompt, /Wide receivers and tight ends sit in between/);
  for (const position of ['WR', 'TE']) {
    for (const key of ['decline', 'cliff']) {
      assert.ok(CURVES.RB[key] < CURVES[position][key] && CURVES[position][key] < CURVES.QB[key], `${position}.${key}`);
    }
  }
});

test("a league's age curves layer onto the shipped ones and are checked at load", () => {
  const load = (rankings) => resolveSettings({ defaults: { rankings: SHIPPED }, league: { rankings } }).rankings;
  const curves = resolveAgeCurves(load({ age_curves: { RB: { cliff: 31 }, K: { peak: 25, decline: 36, cliff: 40 } } }));
  assert.deepEqual(curves.RB, { peak: 23, decline: 27, cliff: 31 });
  assert.deepEqual(curves.K, { peak: 25, decline: 36, cliff: 40 });
  assert.deepEqual(curves.QB, CURVES.QB);

  assert.throws(() => load({ age_curves: { RB: { cliff: 26 } } }), /peak < decline < cliff/);
  assert.throws(() => load({ age_curves: { RB: { peak: 22.5 } } }), /age_curves\.RB\.peak.*whole-number age/);
  assert.throws(() => load({ age_curves: { RB: { prime: 25 } } }), /does not read/);
  assert.throws(() => load({ age_curves: { DEF: { peak: 20, decline: 25, cliff: 30 } } }), /team defense has no age/);
  assert.throws(() => load({ age_curves: { rb: { peak: 20, decline: 25, cliff: 30 } } }), /not a position/);
});
