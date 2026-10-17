/**
 * The five-year plan edition (src/fiveYearPlan.mjs, prompts/five-year-plan.md):
 * one dynasty team's outlook over five seasons, chosen with --team. Built
 * through prepareEdition in memory on the fake Sleeper league
 * (tests/fixtures/fake-sleeper-api-fetch.mjs), declared dynasty. The facts
 * themselves are tests/five-year-plan.test.mjs's; these tests pin down the
 * edition around them: what reaches the context, the prompt, and the
 * refusals.
 *
 * Every team, player and value here is invented.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { PACKAGE_ROOT, loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import {
  FIVE_YEAR_PLAN_TASK,
  refuseFiveYearPlan,
  refuseWithoutTeam,
  resolvePlanTeam,
} from '../src/fiveYearPlan.mjs';
import { EDITIONS, OPTIONS, editionNamed, weeklyEditions } from '../src/options.mjs';
import { buildPrompt, TASKS } from '../src/promptContext.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { createTeamIdentity } from '../src/teamIdentity.mjs';

// Importing the fake installs it as the global fetch. Kept so a test can put
// it back after swapping in one that answers FantasyCalc, or one that fails.
const SLEEPER_FETCH = globalThis.fetch;

/** FantasyCalc's list for the fake league's players and picks. */
const FAKE_MARKET = [
  ...Object.entries({ qb1: 5000, qb2: 6200, rb1: 4100, rb2: 1500, wr1: 3300, wr2: 1200, te1: 2000, fa1: 900, fa2: 700 }).map(
    ([sleeperId, value]) => ({ player: { name: sleeperId, position: 'RB', sleeperId }, value }),
  ),
  { player: { name: '2027 1st', position: 'PICK' }, value: 3000 },
  { player: { name: '2027 2nd', position: 'PICK' }, value: 1000 },
  { player: { name: '2027 3rd', position: 'PICK' }, value: 300 },
];

const withMarket = async (url) =>
  new URL(url).host === 'api.fantasycalc.com'
    ? new Response(JSON.stringify(FAKE_MARKET), { status: 200, headers: { 'content-type': 'application/json' } })
    : SLEEPER_FETCH(url);

/** A fetch that fails the test if anything is asked for. */
const NO_NETWORK = async (url) => {
  throw new Error(`contacted ${url}`);
};

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

function configFor(format) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-five-year-plan-')));
  folders.push(root);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n${format ? `LEAGUE_FORMAT=${format}\n` : ''}`);
  return loadConfig({ workspaceRoot: root });
}

/** prepareEdition for a five-year plan in memory, with `fetch` as the network. */
async function build({ team, format = 'dynasty', fetch = SLEEPER_FETCH, store = createMemoryStore(), week = 1 } = {}) {
  const config = configFor(format);
  const said = [];
  globalThis.fetch = fetch;
  try {
    const prepared = await prepareEdition({
      task: FIVE_YEAR_PLAN_TASK,
      week,
      options: team === undefined ? {} : { team },
      settings: { ...config, playerCache: createMemoryPlayerCache() },
      store,
      assets: loadDiskAssets({ promptsDir: config.promptsDir }),
      log: { say: (line) => said.push(line), warn: (line) => said.push(line) },
    });
    return { ...prepared, said, store };
  } finally {
    globalThis.fetch = SLEEPER_FETCH;
  }
}

const fields = (context) => context.unavailable.map((entry) => entry.field);

/* ------------------------------------------------------- the descriptors */

test('EDITIONS lists the five-year plan: dynasty only, not recordable, not forward-looking, not weekly', () => {
  const edition = editionNamed(FIVE_YEAR_PLAN_TASK);
  assert.ok(edition);
  assert.equal(edition.command, FIVE_YEAR_PLAN_TASK);
  assert.equal(edition.group, 'dynasty');
  assert.deepEqual(edition.formats, ['dynasty']);
  assert.equal(edition.recordable, false);
  assert.equal(edition.forwardLooking, false);
  assert.ok(TASKS.includes(FIVE_YEAR_PLAN_TASK));
  for (const formatType of [null, 'dynasty', 'redraft', 'guillotine']) {
    assert.ok(!weeklyEditions(formatType).some(({ task }) => task === FIVE_YEAR_PLAN_TASK), String(formatType));
  }
});

test('OPTIONS adds --team, a text option that changes the five-year plan only', () => {
  const team = OPTIONS.find((option) => option.name === 'team');
  assert.equal(team.flag, '--team');
  assert.equal(team.kind, 'text');
  assert.deepEqual(team.editions, [FIVE_YEAR_PLAN_TASK]);
  assert.equal(team.cliOnly, null, 'the website renders it, as a team picker');
});

test('the core entry carries the edition and --team through EDITIONS and OPTIONS', async () => {
  const core = await import('../src/core/index.mjs');
  assert.ok(core.EDITIONS.some((edition) => edition.name === FIVE_YEAR_PLAN_TASK));
  assert.ok(core.OPTIONS.some((option) => option.flag === '--team'));
  assert.equal(core.EDITIONS, EDITIONS);
});

/* ------------------------------------------------- in memory, end to end */

test('prepareEdition in memory builds the plan for an invented team, named by its name', async () => {
  const prepared = await build({ team: 'Bye Week Blues', fetch: withMarket });
  assert.equal(prepared.built, true);
  assert.equal(prepared.recordsBlock, false);
  assert.equal(prepared.fileStem, '2026-week01-five-year-plan-team1');
  assert.ok(prepared.said.includes("Planning Bye Week Blues's seasons 2026 to 2030."), prepared.said.join('\n'));

  const { context, prompt } = prepared;
  const plan = context.fiveYearPlan;
  assert.equal(plan.team, 'Bye Week Blues');
  assert.deepEqual(plan.seasons, ['2026', '2027', '2028', '2029', '2030']);
  // Today's starters, one line each across the five seasons, staged on the
  // shipped curves (QB peak 26, RB decline 27).
  assert.ok(
    plan.starters.includes('QB Case Holt: 2026 age 24 rising; 2027 age 25 rising; 2028 age 26 peak; 2029 age 27 peak; 2030 age 28 peak'),
    plan.starters.join('\n'),
  );
  assert.ok(plan.starters.some((line) => line.startsWith('RB Rex Carter: 2026 age 23 peak;')), plan.starters.join('\n'));
  assert.ok(plan.bench.some((line) => line.startsWith('WR Wade Pike: 2026 age 30')), plan.bench.join('\n'));
  assert.match(plan.ageCurves.RB, /^rising before \d+, peak \d+-\d+, declining \d+-\d+, cliff from \d+$/);
  assert.equal(plan.bySeason.length, 5);
  assert.deepEqual(plan.starterProduction.weeksCovered, [1]);
  for (const season of plan.bySeason) assert.match(season.rosterByAgeBand, /^[^:]+: \d+(, [^:]+: \d+)*$/);

  // The 2026 draft has been held or not; either way no later season is ever
  // silently empty: issued picks list the team's own, the rest say why not.
  for (const { season, picks } of plan.bySeason) {
    assert.ok(picks.unavailable || Array.isArray(picks.picks), season);
    if (picks.picks) {
      for (const pick of picks.picks) assert.ok(!('originalRosterId' in pick), 'no roster ids in the context');
    }
  }
  assert.ok(plan.bySeason.some(({ picks }) => picks.picks?.some((pick) => pick.originalTeam === 'Bye Week Blues (own)')));

  // Today, for this team: strength, standing and market value.
  assert.equal(typeof plan.strength.rating, 'number');
  assert.equal(plan.standing.of, 4);
  assert.equal(plan.marketValue.of > 0, true);
  assert.ok(context.marketCredit, 'the plan quotes FantasyCalc values, so the credit travels');

  // One team only: no league-wide teams, standings, strength or transactions.
  for (const key of ['teams', 'standings', 'strength', 'transactions', 'previousRankings']) {
    assert.ok(!(key in context), key);
  }
  // Punt Intended's players appear nowhere.
  for (const name of ['Quinn Arms', 'Dale Moss', 'Wes Lane']) assert.doesNotMatch(prompt, new RegExp(name), name);

  assert.ok(fields(context).includes('futureSeasons'));
  assert.ok(fields(context).includes('otherRosters'));
  assert.ok(!fields(context).includes('starterProduction'), 'week 1 is on file');
  assert.ok(!fields(context).includes('transactions'), 'its options are trades; "do not mention trades" would forbid them');
  assert.match(prompt, /^# Five-Year Plan$/m);
  assert.match(prompt, /"fiveYearPlan": \{/);
});

test('--team takes a roster id or a manager username, as config/rivalries.yml does', async () => {
  const byId = await build({ team: '2' });
  assert.equal(byId.context.fiveYearPlan.team, 'Punt Intended');
  assert.equal(byId.fileStem, '2026-week01-five-year-plan-team2');
  const byManager = await build({ team: 'manager3' });
  assert.equal(byManager.context.fiveYearPlan.team, 'Lowered Expectations');
});

test('without a market, nothing is priced and the edition is told not to invent a value', async () => {
  const { context, said } = await build({ team: 'Bye Week Blues' });
  assert.ok(said.some((line) => /Trade values could not be fetched/.test(line)), said.join('\n'));
  assert.ok(fields(context).includes('pickValues'));
  assert.ok(context.fiveYearPlan.marketValue.unavailable);
  assert.ok(!context.marketCredit);
});

/* -------------------------------------------------------------- refusals */

for (const format of ['redraft', 'guillotine']) {
  test(`a declared ${format} league is refused before Sleeper is contacted, naming why`, async () => {
    await assert.rejects(build({ team: 'Bye Week Blues', format, fetch: NO_NETWORK }), (error) => {
      assert.match(error.message, /^`five-year-plan` is a dynasty edition: /);
      assert.match(error.message, new RegExp(`this is a ${format} league`));
      return true;
    });
  });
}

test('a league whose format is only detected is refused once it is open, by the resolved format', () => {
  assert.doesNotThrow(() => refuseFiveYearPlan({ formatType: null }));
  assert.doesNotThrow(() => refuseFiveYearPlan({ formatType: 'dynasty' }));
  assert.throws(() => refuseFiveYearPlan({ formatType: 'redraft' }), /no player or pick carries over/);
});

test('buildPrompt refuses a plan for a caller that skips prepareEdition', () => {
  const context = { league: { format: { type: 'dynasty' } } };
  assert.throws(() => buildPrompt({ task: FIVE_YEAR_PLAN_TASK, context, assets: {} }), /the plan is not in the context/);
  context.league.format.type = 'redraft';
  assert.throws(() => buildPrompt({ task: FIVE_YEAR_PLAN_TASK, context, assets: {} }), /is a dynasty edition/);
});

test('an ESPN league is refused before ESPN is contacted: its traded picks are not read', async () => {
  const settings = { league: { provider: 'espn', route: 'import' }, leagueFormat: 'dynasty' };
  globalThis.fetch = NO_NETWORK;
  try {
    await assert.rejects(
      prepareEdition({ task: FIVE_YEAR_PLAN_TASK, options: { team: '1' }, settings, store: createMemoryStore() }),
      /^Error: `five-year-plan` cannot be built for this ESPN league: ESPN traded picks are not read in this version/,
    );
  } finally {
    globalThis.fetch = SLEEPER_FETCH;
  }
});

test('a missing or blank --team is refused before Sleeper is contacted, naming the flag', async () => {
  for (const team of [undefined, '', '   ']) {
    await assert.rejects(build({ team, fetch: NO_NETWORK }), (error) => {
      assert.match(error.message, /is about one team: name it with --team, by its name or its roster id/);
      assert.match(error.message, /five-year-plan --team 3/);
      return true;
    });
  }
  assert.throws(() => refuseWithoutTeam('x'.repeat(101)), /--team is longer than 100 characters/);
});

test('an unknown --team is refused, listing the teams, and nothing is captured', async () => {
  const store = createMemoryStore();
  await assert.rejects(build({ team: 'Invented Nobody', store }), (error) => {
    assert.match(error.message, /^--team "Invented Nobody" is not a team in this league\. Its teams are: /);
    assert.match(error.message, /Bye Week Blues \(roster 1\)/);
    return true;
  });
  assert.equal(store.loadSnapshot('2026', 1), null, 'the week was not captured for a team that does not exist');
  await assert.rejects(build({ team: '99' }), /--team "99" is not a team in this league/);
});

test('an ambiguous --team is refused, asking for the roster id', () => {
  const teams = [
    { rosterId: 1, name: 'Bye Week Blues', manager: 'manager1' },
    { rosterId: 2, name: 'Punt Intended', manager: 'manager2' },
  ];
  // Both rosters have gone by the same invented name.
  const history = [
    { week: 1, rosterId: 1, name: 'Invented Old Name' },
    { week: 2, rosterId: 2, name: 'Invented Old Name' },
  ];
  const identity = createTeamIdentity({ teams, history });
  assert.throws(
    () => resolvePlanTeam('Invented Old Name', identity),
    /^Error: --team "Invented Old Name" has meant more than one team in this league, so the plan cannot tell which\. Use the roster id instead: Bye Week Blues \(roster 1\), Punt Intended \(roster 2\)\.$/,
  );
  assert.equal(resolvePlanTeam(' 2 ', identity).name, 'Punt Intended');
});

/* ----------------------------------------------------------------- prompt */

test('the prompt frames a window and the options season by season, and never projects', () => {
  const text = readFileSync(join(PACKAGE_ROOT, 'prompts', 'five-year-plan.md'), 'utf8');
  assert.match(text, /\*\*The contention window\.\*\*/);
  assert.match(text, /\*\*The options, season by season\.\*\*/);
  assert.match(text, /Sell before the cliff/);
  assert.match(text, /The picks are the currency/);
  assert.match(text, /Tie every claim to a fact/);
  assert.match(text, /Never project points, a record, a playoff place, a finish or a title/);
  assert.match(text, /never invent the picks it will hold/);
  assert.match(text, /No JSON block at the end/);
});
