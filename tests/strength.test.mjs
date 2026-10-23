/**
 * The team strength rating (src/analysis/strength.mjs): a 0-100 number per
 * team, relative to its league, computed by the code from facts on file.
 *
 * Every team, player and number below is invented.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildStrength, STRENGTH_COMPONENTS } from '../src/analysis/strength.mjs';
import { PACKAGE_ROOT, loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { capabilityGap } from '../src/format.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';
import { readStrength } from '../src/pipeline.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { getProvider } from '../src/providers.mjs';
import {
  DEFAULT_RANKINGS,
  STRENGTH_COMPONENTS_BY_FORMAT,
  resolveSettings,
  resolveStrengthChoice,
} from '../src/settings.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';

const SHIPPED = parseYaml(readFileSync(join(PACKAGE_ROOT, 'config', 'rankings.yml'), 'utf8'));
const sum = (set) => Object.values(set).reduce((total, weight) => total + weight, 0);

/* ------------------------------------------------------------ the fixture */

const SLOTS = ['QB', 'RB', 'WR', 'FLEX'];

/** Four invented teams, five players each: one QB, two RBs, two WRs. */
const TEAMS = [
  { rosterId: 1, name: 'Bye Week Blues', playerIds: ['q1', 'r1', 'r2', 'w1', 'w2'] },
  { rosterId: 2, name: 'Punt Intended', playerIds: ['q2', 'r3', 'r4', 'w3', 'w4'] },
  { rosterId: 3, name: 'Lowered Expectations', playerIds: ['q3', 'r5', 'r6', 'w5', 'w6'] },
  { rosterId: 4, name: 'Sunday Scaries', playerIds: ['q4', 'r7', 'r8', 'w7', 'w8'] },
];

const player = (position, age) => ({ position, age, name: `${position} ${age}` });
const PLAYERS = {
  q1: player('QB', 24), r1: player('RB', 22), r2: player('RB', 30), w1: player('WR', 25), w2: player('WR', 27),
  q2: player('QB', 33), r3: player('RB', 27), r4: player('RB', 24), w3: player('WR', 31), w4: player('WR', 29),
  q3: player('QB', 27), r5: player('RB', 25), r6: player('RB', 23), w5: player('WR', 23), w6: player('WR', 24),
  q4: player('QB', 29), r7: player('RB', 29), r8: player('RB', 26), w7: player('WR', 28), w8: player('WR', 26),
};

/** A WeekData roster: who started (QB, RB, WR, FLEX) and what everyone scored. */
const roster = (rosterId, starterIds, playerPoints) => ({
  rosterId,
  starterIds,
  playerIds: Object.keys(playerPoints),
  playerPoints,
});

const WEEKS = [
  {
    week: 1,
    rosters: [
      roster(1, ['q1', 'r1', 'w1', 'r2'], { q1: 20, r1: 15, r2: 10, w1: 12, w2: 8 }),
      roster(2, ['q2', 'r3', 'w3', 'w4'], { q2: 25, r3: 9, r4: 14, w3: 11, w4: 6 }),
      roster(3, ['q3', 'r5', 'w5', 'w6'], { q3: 18, r5: 12, r6: 7, w5: 16, w6: 13 }),
      roster(4, ['q4', 'r7', 'w7', 'r8'], { q4: 15, r7: 8, r8: 9, w7: 10, w8: 5 }),
    ],
  },
  {
    week: 2,
    rosters: [
      roster(1, ['q1', 'r1', 'w1', 'w2'], { q1: 22, r1: 18, r2: 4, w1: 9, w2: 14 }),
      roster(2, ['q2', 'r4', 'w3', 'r3'], { q2: 19, r3: 11, r4: 16, w3: 10, w4: 12 }),
      roster(3, ['q3', 'r5', 'w5', 'r6'], { q3: 24, r5: 6, r6: 15, w5: 11, w6: 9 }),
      roster(4, ['q4', 'r8', 'w8', 'w7'], { q4: 12, r7: 13, r8: 7, w7: 9, w8: 11 }),
    ],
  },
];

/** A FantasyCalc snapshot, as readMarketValues saves one. */
const MARKET = {
  source: 'FantasyCalc',
  label: 'Dynasty, superflex',
  week: 2,
  fetchedAt: '2026-09-20T12:00:00.000Z',
  players: Object.fromEntries(
    Object.entries({
      q1: 6000, r1: 5000, r2: 900, w1: 4000, w2: 2500,
      q2: 3000, r3: 2200, r4: 3800, w3: 1200, w4: 1500,
      q3: 5200, r5: 3100, r6: 4100, w5: 4800, w6: 3600,
      q4: 2600, r7: 1100, r8: 2000, w7: 1900, w8: 2100,
    }).map(([id, value]) => [id, { value }]),
  ),
  picks: {},
};

/** buildPickCapital's output, cut to what the rating reads. */
const PICK_CAPITAL = {
  valueSource: { source: 'FantasyCalc' },
  marketUnavailable: null,
  teams: [
    { rosterId: 1, horizon: { value: 3000, picksHeld: 3, unpricedPicks: 0 } },
    { rosterId: 2, horizon: { value: 7400, picksHeld: 5, unpricedPicks: 0 } },
    { rosterId: 3, horizon: { value: 1800, picksHeld: 2, unpricedPicks: 1 } },
    { rosterId: 4, horizon: { value: 5100, picksHeld: 4, unpricedPicks: 0 } },
  ],
};

const INPUTS = { lineupWeeks: 4, shortWeekStarters: 2 };

function dynasty(overrides = {}) {
  return buildStrength({
    formatType: 'dynasty',
    preset: 'balanced',
    weights: DEFAULT_RANKINGS.strength.dynasty,
    inputs: INPUTS,
    teams: TEAMS,
    players: PLAYERS,
    slots: SLOTS,
    weeks: { settled: WEEKS, unavailable: null },
    market: MARKET,
    pickCapital: PICK_CAPITAL,
    ...overrides,
  });
}

const ratings = (strength) => Object.fromEntries(strength.teams.map((team) => [team.team, team.rating]));

/* -------------------------------------------------------- the computation */

test('a Sleeper dynasty league: every team rated 0-100 from all five components, each with a value and a league rank', () => {
  const strength = dynasty();
  assert.deepEqual(strength.unavailable, []);
  assert.equal(strength.note, undefined);
  assert.deepEqual(Object.keys(strength.components), STRENGTH_COMPONENTS_BY_FORMAT.dynasty);
  for (const team of strength.teams) {
    assert.ok(Number.isInteger(team.rating) && team.rating >= 0 && team.rating <= 100, `${team.team}: ${team.rating}`);
    assert.ok(Number.isInteger(team.rank) && team.rank >= 1 && team.rank <= TEAMS.length);
    assert.deepEqual(Object.keys(team.components), STRENGTH_COMPONENTS_BY_FORMAT.dynasty);
    for (const [component, entry] of Object.entries(team.components)) {
      assert.equal(typeof entry.value, 'number', `${team.team} ${component}`);
      assert.ok(Number.isInteger(entry.rank) && entry.rank >= 1 && entry.rank <= TEAMS.length);
      assert.ok(entry.score >= 0 && entry.score <= 100);
    }
    assert.equal(team.unavailable, undefined);
  }
  assert.deepEqual(strength.window, { weeks: [1, 2], lineupWeeks: 4, shortWeekStarters: 2 });
  assert.equal(strength.valueSource.source, 'FantasyCalc');
});

test("lineup and depth are the solver's: best lineup points, and what the bench supplies in a short week", () => {
  const blues = dynasty().teams.find((team) => team.rosterId === 1);
  // Week 1: best is q1 20, r1 15, w1 12, FLEX r2 10 = 57. The short week loses
  // q1 and r1; refilled from r2, w1, w2 it is RB r2 10, WR w1 12, FLEX w2 8 = 30,
  // of which w1 and r2 (22) were already starting: the bench supplied 8.
  // Week 2: best is q1 22, r1 18, w1 9, FLEX w2 14 = 63. Losing q1 and r1, the
  // refill is RB r2 4, WR w2 14, FLEX w1 9 = 27 against 23 kept: 4.
  assert.equal(blues.components.lineup.value, 60);
  assert.equal(blues.components.lineup.weeks, 2);
  assert.equal(blues.components.depth.value, 6);
});

test('market value is the roster today at FantasyCalc prices; draft capital is the priced picks held', () => {
  const blues = dynasty().teams.find((team) => team.rosterId === 1);
  // 6000 + 5000 + 900 + 4000 + 2500; Lowered Expectations' 20800 is first.
  assert.deepEqual(blues.components.market_value, {
    value: 18400,
    pricedPlayers: 5,
    unpricedPlayers: 0,
    rank: 2,
    score: 66.7,
  });
  assert.equal(blues.components.draft_capital.value, 3000);
  assert.equal(blues.components.draft_capital.rank, 3);
});

test('age window: starters against the league average at their position, weighted by points; younger ranks first', () => {
  const strength = dynasty();
  const byName = Object.fromEntries(strength.teams.map((team) => [team.team, team.components.age_window]));
  // Lowered Expectations started the youngest skill players; Punt Intended the oldest QB.
  assert.ok(byName['Lowered Expectations'].value < 0);
  assert.ok(byName['Punt Intended'].value > 0);
  assert.equal(strength.components.age_window.better, 'lower');
  // League QB mean 4377/155 = 28.24; Bye Week Blues' 24-year-old QB scored 42
  // of its 120 starter points, which carries it to the youngest window.
  assert.deepEqual(
    Object.fromEntries(Object.entries(byName).map(([name, entry]) => [name, [entry.value, entry.rank]])),
    {
      'Bye Week Blues': [-2.04, 1],
      'Punt Intended': [3.26, 4],
      'Lowered Expectations': [-1.75, 2],
      'Sunday Scaries': [1.2, 3],
    },
  );
});

test("one league's ratings, pinned: the same saved data always gives the same rating", () => {
  const first = dynasty();
  // Bye Week Blues: lineup 1st (100) x 0.35, depth tied 3rd (16.7) x 0.10,
  // market 2nd (66.7) x 0.25, age 1st (100) x 0.15, picks 3rd (33.3) x 0.15
  // = 35 + 1.7 + 16.7 + 15 + 5 = 73.
  assert.deepEqual(ratings(first), {
    'Bye Week Blues': 73,
    'Punt Intended': 45,
    'Lowered Expectations': 65,
    'Sunday Scaries': 17,
  });
  const depth = Object.fromEntries(first.teams.map((team) => [team.team, team.components.depth]));
  // Bye Week Blues and Sunday Scaries tie on 6: both rank 3rd and share the score of 3rd and 4th.
  assert.deepEqual([depth['Bye Week Blues'].rank, depth['Bye Week Blues'].score], [3, 16.7]);
  assert.deepEqual([depth['Sunday Scaries'].rank, depth['Sunday Scaries'].score], [3, 16.7]);
  assert.deepEqual(
    first.teams.map((team) => team.rank),
    [1, 3, 2, 4],
  );
  // Pure: the same inputs, even a copy read back from JSON, give the same object.
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const again = buildStrength({
    formatType: 'dynasty',
    preset: 'balanced',
    weights: copy(DEFAULT_RANKINGS.strength.dynasty),
    inputs: copy(INPUTS),
    teams: copy(TEAMS),
    players: copy(PLAYERS),
    slots: copy(SLOTS),
    weeks: { settled: copy(WEEKS).reverse(), unavailable: null },
    market: copy(MARKET),
    pickCapital: copy(PICK_CAPITAL),
  });
  assert.deepEqual(again, first);
});

test('only the last lineup_weeks settled weeks are read', () => {
  const strength = dynasty({ inputs: { lineupWeeks: 1, shortWeekStarters: 2 } });
  assert.deepEqual(strength.window.weeks, [2]);
  const blues = strength.teams.find((team) => team.rosterId === 1);
  assert.equal(blues.components.lineup.value, 63);
  assert.equal(blues.components.lineup.weeks, 1);
});

test('a redraft league is rated on lineup, depth and market value only', () => {
  const strength = dynasty({
    formatType: 'redraft',
    weights: DEFAULT_RANKINGS.strength.redraft,
    pickCapital: null,
    draftCapitalUnavailable: 'a redraft league holds no future draft picks',
  });
  assert.deepEqual(Object.keys(strength.components), ['lineup', 'depth', 'market_value']);
  assert.deepEqual(strength.unavailable, []);
  for (const team of strength.teams) {
    assert.deepEqual(Object.keys(team.components), ['lineup', 'depth', 'market_value']);
    assert.ok(team.rating >= 0 && team.rating <= 100);
  }
});

test('a preseason (no settled weeks): lineup, depth and age window are unavailable, named, and the rest rescaled', () => {
  const strength = dynasty({
    weeks: { settled: [], unavailable: "a preseason ranking reads none of this season's results" },
  });
  assert.deepEqual(
    strength.unavailable.map((entry) => entry.component),
    ['lineup', 'depth', 'age_window'],
  );
  for (const entry of strength.unavailable) assert.match(entry.reason, /preseason/);
  // market_value 0.25 and draft_capital 0.15, scaled back up to 1.0.
  assert.deepEqual(strength.weightsUsed, { market_value: 0.625, draft_capital: 0.375 });
  assert.match(strength.note, /lineup, depth, age_window/);
  assert.match(strength.note, /scaled back up to 1\.0/);
  for (const team of strength.teams) {
    // Missing is absent, never a 0.
    assert.deepEqual(Object.keys(team.components), ['market_value', 'draft_capital']);
    assert.ok(Number.isInteger(team.rating));
  }
  assert.deepEqual(strength.window.weeks, []);
});

test('an ESPN dynasty league (no draft capital): draft_capital is unavailable with the capability reason', () => {
  const espn = getProvider('espn');
  const reason = capabilityGap('futurePicks', { capabilities: espn.capabilities, provider: espn.displayName });
  assert.ok(reason);
  const strength = dynasty({ pickCapital: null, draftCapitalUnavailable: reason });
  assert.deepEqual(strength.unavailable, [{ component: 'draft_capital', reason }]);
  assert.deepEqual(Object.keys(strength.weightsUsed), ['lineup', 'depth', 'market_value', 'age_window']);
  for (const team of strength.teams) assert.equal(team.components.draft_capital, undefined);
});

test('a market that could not be read leaves market value out, quoting why; pick values too', () => {
  const strength = dynasty({
    market: { unavailable: 'FantasyCalc returned HTTP 503' },
    pickCapital: { ...PICK_CAPITAL, valueSource: null, marketUnavailable: 'FantasyCalc returned HTTP 503' },
  });
  assert.deepEqual(
    strength.unavailable.map((entry) => entry.component),
    ['market_value', 'draft_capital'],
  );
  assert.match(strength.unavailable[0].reason, /HTTP 503/);
  assert.equal(strength.valueSource, null);
});

test('a team the league cannot price is rated on the rest, with its own unavailable entry and weights', () => {
  const unpriced = new Set(TEAMS[3].playerIds);
  const market = { ...MARKET, players: Object.fromEntries(Object.entries(MARKET.players).filter(([id]) => !unpriced.has(id))) };
  const strength = dynasty({ market });
  assert.deepEqual(strength.unavailable, []);
  const scaries = strength.teams.find((team) => team.rosterId === 4);
  assert.deepEqual(scaries.unavailable, [{ component: 'market_value', reason: 'FantasyCalc prices no player on this roster' }]);
  assert.equal(scaries.components.market_value, undefined);
  assert.ok(Math.abs(sum(scaries.weightsUsed) - 1) < 0.02);
  // The other three are ranked among themselves on market value.
  const ranked = strength.teams.filter((team) => team.components.market_value).map((team) => team.components.market_value.rank);
  assert.deepEqual(ranked.sort(), [1, 2, 3]);
});

test('a week whose best lineup cannot be known is not counted for that team', () => {
  const weeks = structuredClone(WEEKS);
  weeks[1].rosters[0].noPointsIds = ['w2'];
  const blues = dynasty({ weeks: { settled: weeks, unavailable: null } }).teams.find((team) => team.rosterId === 1);
  assert.equal(blues.components.lineup.weeks, 1);
  assert.equal(blues.components.lineup.unknownWeeks, 1);
  assert.equal(blues.components.lineup.value, 57);
});

test('the strength module imports nothing from node:', () => {
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'analysis', 'strength.mjs'), 'utf8');
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.ok(Object.keys(STRENGTH_COMPONENTS).length === 5);
});

/* ----------------------------------------------------------- the settings */

test('the shipped strength weights are the built-in ones, and every set sums to 1.0', () => {
  assert.deepEqual(DEFAULT_RANKINGS.strength, SHIPPED.strength);
  assert.deepEqual(DEFAULT_RANKINGS.strength_inputs, SHIPPED.strength_inputs);
  for (const [format, set] of Object.entries(SHIPPED.strength)) {
    assert.ok(Math.abs(sum(set) - 1) < 1e-9, `strength.${format}`);
    assert.deepEqual(Object.keys(set), STRENGTH_COMPONENTS_BY_FORMAT[format]);
  }
  for (const [name, preset] of Object.entries(SHIPPED.presets)) {
    // A preset carries strength weights for every rated format it ranks.
    const rated = Object.keys(preset.weights).filter((format) => format in STRENGTH_COMPONENTS_BY_FORMAT);
    assert.deepEqual(Object.keys(preset.strength).sort(), rated.sort(), name);
    for (const [format, set] of Object.entries(preset.strength)) {
      assert.ok(Math.abs(sum(set) - 1) < 1e-9, `presets.${name}.strength.${format}`);
      assert.deepEqual(Object.keys(set), STRENGTH_COMPONENTS_BY_FORMAT[format]);
    }
  }
});

test('the preset chooses the strength weights; guillotine leagues get no strength rating', () => {
  const { rankings } = resolveSettings({ defaults: { rankings: SHIPPED } });
  assert.deepEqual(resolveStrengthChoice(rankings, 'dynasty').weights, SHIPPED.strength.dynasty);
  assert.equal(resolveStrengthChoice(rankings, 'dynasty').preset, 'balanced');
  assert.deepEqual(resolveStrengthChoice(rankings, 'dynasty').inputs, { lineupWeeks: 4, shortWeekStarters: 2 });
  assert.equal(resolveStrengthChoice(rankings, 'guillotine'), null);

  const rebuild = resolveSettings({ defaults: { rankings: SHIPPED }, league: { rankings: { preset: 'rebuild' } } }).rankings;
  assert.deepEqual(resolveStrengthChoice(rebuild, 'dynasty'), {
    preset: 'rebuild',
    weights: SHIPPED.presets.rebuild.strength.dynasty,
    inputs: { lineupWeeks: 4, shortWeekStarters: 2 },
  });
  assert.throws(() => resolveStrengthChoice(rebuild, 'redraft'), /not a preset a redraft league has/);

  const winNow = resolveSettings({ defaults: { rankings: SHIPPED }, league: { rankings: { preset: 'win-now' } } }).rankings;
  assert.deepEqual(resolveStrengthChoice(winNow, 'redraft').weights, SHIPPED.presets['win-now'].strength.redraft);
});

test('strength weights are validated like the ranking weights', () => {
  const load = (rankings) => resolveSettings({ defaults: { rankings: SHIPPED }, league: { rankings } });
  assert.throws(() => load({ strength: { redraft: { lineup: 0.5, depth: 0.2, market_value: 0.2 } } }), /strength\.redraft sums to/);
  assert.throws(
    () => load({ strength: { redraft: { lineup: 0.6, depth: 0.2, age_window: 0.2 } } }),
    /strength\.redraft\.age_window .* not a strength component a redraft league has/,
  );
  assert.throws(() => load({ strength: { guillotine: { lineup: 1 } } }), /guillotine leagues get no strength rating/);
  assert.throws(
    () => load({ presets: { 'win-now': { strength: { dynasty: { lineup: 1.2, depth: -0.2 } } } } }),
    /presets\.win-now\.strength\.dynasty\.lineup .* not a weight from 0 to 1/,
  );
  assert.throws(() => load({ strength_inputs: { lineup_weeks: 0 } }), /strength_inputs\.lineup_weeks/);
  assert.throws(() => load({ strength_inputs: { short_week: 2 } }), /does not read/);
  // A partial set replaces the shipped one wholesale, so it must be complete.
  const own = load({ strength: { redraft: { lineup: 1 } } }).rankings;
  assert.deepEqual(resolveStrengthChoice(own, 'redraft'), {
    preset: null,
    weights: { lineup: 1 },
    inputs: { lineupWeeks: 4, shortWeekStarters: 2 },
  });
});

test('a preset beside the league’s own strength weights is refused, naming both', () => {
  const { rankings } = resolveSettings({
    defaults: { rankings: SHIPPED },
    league: { rankings: { preset: 'win-now', strength: { dynasty: SHIPPED.strength.dynasty } } },
  });
  assert.throws(() => resolveStrengthChoice(rankings, 'dynasty'), /preset: win-now and its own strength\.dynasty/);
});

/* ------------------------------------------------------- through readStrength */

test('readStrength for an ESPN league has no draft capital, with the reason; a guillotine league has no rating', () => {
  const config = { rankings: resolveSettings({ defaults: { rankings: SHIPPED } }).rankings };
  const espnLeague = { provider: 'espn', season: '2026', format: { type: 'dynasty' }, startingSlots: SLOTS };
  const strength = readStrength({
    store: createMemoryStore(),
    league: espnLeague,
    teams: TEAMS,
    players: PLAYERS,
    config,
    throughWeek: 1,
    market: MARKET,
    preseason: true,
  });
  const draft = strength.unavailable.find((entry) => entry.component === 'draft_capital');
  assert.match(draft.reason, /ESPN traded picks are not read/);
  assert.ok(strength.teams.every((team) => Number.isInteger(team.rating)));

  const guillotine = { provider: 'sleeper', season: '2026', format: { type: 'guillotine' }, startingSlots: SLOTS };
  assert.equal(
    readStrength({ store: createMemoryStore(), league: guillotine, teams: TEAMS, players: PLAYERS, config, throughWeek: 1 }),
    null,
  );
});

/* ------------------------------------------------- through prepareEdition */

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** FantasyCalc's list for the fake Sleeper league's players and picks. */
const FAKE_MARKET = [
  ...Object.entries({ qb1: 5000, qb2: 6200, rb1: 4100, rb2: 1500, wr1: 3300, wr2: 1200, te1: 2000, fa1: 900, fa2: 700 }).map(
    ([sleeperId, value]) => ({ player: { name: sleeperId, position: 'RB', sleeperId }, value }),
  ),
  { player: { name: '2027 1st', position: 'PICK' }, value: 3000 },
  { player: { name: '2027 2nd', position: 'PICK' }, value: 1000 },
  { player: { name: '2027 3rd', position: 'PICK' }, value: 300 },
];

async function build(task, options) {
  return (await buildEdition(task, options)).context;
}

async function buildEdition(task, { format = 'dynasty', week = 1 } = {}) {
  await import('./fixtures/fake-sleeper-api-fetch.mjs');
  if (!globalThis.fetch.answersMarket) {
    const sleeper = globalThis.fetch;
    globalThis.fetch = async (url) =>
      new URL(url).host === 'api.fantasycalc.com'
        ? new Response(JSON.stringify(FAKE_MARKET), { status: 200, headers: { 'content-type': 'application/json' } })
        : sleeper(url);
    globalThis.fetch.answersMarket = true;
  }
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-strength-')));
  folders.push(root);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=${format}\n`);
  const config = loadConfig({ workspaceRoot: root });
  const store = createMemoryStore();
  const run = (name) =>
    prepareEdition({
      task: name,
      week,
      settings: { ...config, playerCache: createMemoryPlayerCache() },
      store,
      assets: loadDiskAssets({ promptsDir: config.promptsDir }),
      log: { say() {}, warn() {} },
    });
  return run(task);
}

test('each ranking prompt explains the strength block that its context carries', async () => {
  const editions = {
    rankings: 'weekly-power-rankings',
    'preseason-rankings': 'preseason-power-rankings',
    postseason: 'postseason-power-rankings',
    'future-stock': 'future-stock',
  };
  for (const [task, file] of Object.entries(editions)) {
    const { context, prompt } = await buildEdition(task);
    assert.ok(context.strength, task);
    assert.match(prompt, /"strength": \{/, `${task}: the block is in the context`);
    assert.match(prompt, /## Team strength/, `${task} (${file})`);
    assert.match(prompt, /evidence,\s+not\s+the\s+ranking/, task);
    assert.match(prompt, /Never\s+rank\s+a\s+team\s+on\s+its\s+rating\s+alone/, task);
    assert.match(prompt, /strength\.unavailable/, task);
    assert.match(prompt, /Never guess its\s+value/, task);
  }
});

test('the weekly, preseason and postseason rankings and the future stock contexts carry the rating', async () => {
  for (const task of ['rankings', 'postseason', 'future-stock']) {
    const context = await build(task);
    assert.ok(context.strength, task);
    assert.match(context.strength.scale, /relative to this league/);
    assert.deepEqual(context.strength.window.weeks, [1], task);
    for (const team of context.strength.teams) {
      assert.equal(team.rosterId, undefined);
      if (team.rating !== null) assert.ok(team.rating >= 0 && team.rating <= 100);
    }
    // The values came from FantasyCalc, so a post quoting one owes the credit.
    assert.ok(context.marketCredit, task);
  }
  const preseason = await build('preseason-rankings');
  assert.deepEqual(
    preseason.strength.unavailable.map((entry) => entry.component),
    ['lineup', 'depth', 'age_window'],
  );
  assert.match(preseason.strength.note, /scaled back up to 1\.0/);
});

test('a redraft league’s rankings carry a rating with no age window and no draft capital', async () => {
  const context = await build('rankings', { format: 'redraft' });
  assert.deepEqual(Object.keys(context.strength.weights), ['lineup', 'depth', 'market_value']);
  assert.deepEqual(context.strength.unavailable, []);
});

test('window.missingWeeks lists the weeks inside the window with no settled data', () => {
  const settled = [WEEKS[0], { ...WEEKS[1], week: 4 }];
  const strength = dynasty({ weeks: { settled, unavailable: null, throughWeek: 5 } });
  assert.deepEqual(strength.window.weeks, [1, 4]);
  assert.deepEqual(strength.window.missingWeeks, [2, 3, 5]);
});

test('with every week saved through the through week, window carries no missingWeeks', () => {
  const strength = dynasty({ weeks: { settled: WEEKS, unavailable: null, throughWeek: 2 } });
  assert.equal('missingWeeks' in strength.window, false);
});

test('editions that rank nobody carry no rating', async () => {
  for (const task of ['recap', 'preview']) {
    const context = await build(task, { week: task === 'preview' ? 2 : 1 });
    assert.equal(context.strength, undefined, task);
  }
});
