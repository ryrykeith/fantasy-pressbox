import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { refuseEditionForProvider } from '../src/cli.mjs';
import { PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { createClient } from '../src/espn/client.mjs';
import { normalizeLeague } from '../src/espn/normalize.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { EDITION_CAPABILITIES, refuseEditionWithoutCapability } from '../src/format.mjs';
import { captureWeek, readTransactions } from '../src/pipeline.mjs';
import { buildContext, buildPrompt, describePlayer } from '../src/promptContext.mjs';
import { getProvider } from '../src/providers.mjs';
import { normalizePlayers as sleeperPlayers, normalizeTeams as sleeperTeams } from '../src/sleeper/normalize.mjs';
import { sleeperProvider } from '../src/sleeper/provider.mjs';
import { createStore } from '../src/store.mjs';
import { assets } from './fixtures/assets.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  LEAGUE_BY_ID,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  SCORED_WEEK,
  SEASON,
  UNKNOWN_LEAGUE_ID,
} from './fixtures/mock-espn-league.mjs';
import { leagueOf, RAW_PLAYERS, RAW_ROSTERS, RAW_USERS, RAW_WEEKS } from './fixtures/week-data-league.mjs';

// Provider capability gates (docs/plans/espn-football.md, task 5.1): an ESPN
// league is refused the editions ESPN cannot support, with the reason, and
// every context fact ESPN cannot supply is an `unavailable` entry telling the
// model what not to say. A Sleeper league is unchanged. Everything runs on the
// invented fixtures; nothing is a real league.
//
// The third refusal, a matchup period spanning more than one NFL week, is
// tested in tests/espn-multi-week.test.mjs.

const ESPN = getProvider('espn');
const SLEEPER = getProvider('sleeper');

const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 1,
    ranking_emoji: '',
    output: { sleeper_max_chars: 900, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: {
    weights: {
      dynasty: { starting_lineup: 0.5, dynasty_value: 0.3, future_draft_capital: 0.2 },
      redraft: { starting_lineup: 1 },
    },
    weekly: {},
  },
  rookieDraft: { order: null },
};

function tempDir(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** An opened ESPN fixture league with week 4 captured, as commandEdition has it. */
async function espnWeek(t, { leagueId = PUBLIC_LEAGUE_ID, leagueFormat = null } = {}) {
  const dataDir = tempDir('pressbox-espn-gates-');
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const client = createClient({ leagueId, season: SEASON, dataDir, fetch: createFakeEspnFetch() });
  const provider = espnProvider.forClient(client, { config: { leagueFormat } });
  const opened = await provider.openLeague();
  const store = createStore({ dataDir });
  const captured = await captureWeek({ provider, store, ...opened, week: SCORED_WEEK });
  const transactions = readTransactions({ store, ...opened, describePlayer, week: SCORED_WEEK });
  return { ...opened, captured, transactions };
}

/** The context for `task` from an ESPN week. `league` overrides the opened league. */
function espnContext(task, week, overrides = {}) {
  const { league, teams, players, captured, transactions } = { ...week, ...overrides };
  return buildContext({
    task,
    config: CONFIG,
    league,
    teams,
    players,
    week: SCORED_WEEK,
    weekAnalysis: task === 'preview' || task === 'trade-report' || task === 'waiver-report' ? null : captured.analysis,
    upcomingAnalysis: task === 'preview' ? captured.analysis : null,
    transactions: captured.transactions,
    enrichedTransactions: transactions,
  });
}

const entry = (context, field) => context.unavailable.find((item) => item.field === field);

/** The entry for `field`, asserting it is there and its `why` names `reason`. */
function assertEntry(context, field, reason) {
  const found = entry(context, field);
  assert.ok(found, `expected an unavailable entry for ${field}; got ${context.unavailable.map((i) => i.field).join(', ')}`);
  assert.match(found.why, reason);
  assert.ok(found.instruction.length > 0);
  return found;
}

// --- Refusals -------------------------------------------------------------------

for (const task of ['tank-watch', 'future-stock', 'five-year-plan']) {
  test(`${task} is refused on ESPN: its traded picks are not read in this version`, () => {
    for (const formatType of [null, 'dynasty', 'redraft']) {
      assert.throws(
        () => refuseEditionWithoutCapability(task, { capabilities: ESPN.capabilities, provider: 'ESPN', formatType }),
        (error) => {
          assert.match(error.message, new RegExp(`^\`${task}\` cannot be built for this ESPN league`));
          assert.match(error.message, /ESPN traded picks are not read in this version/);
          // The sources do not settle that ESPN has none (open question 25).
          assert.doesNotMatch(error.message, /has no (traded|future)/i);
          return true;
        },
      );
    }
  });
}

for (const task of ['survival-preview', 'chop-recap', 'survival-rankings']) {
  test(`${task} is refused on ESPN: guillotine is not supported on ESPN in v1`, () => {
    assert.throws(
      () => refuseEditionWithoutCapability(task, { capabilities: ESPN.capabilities, provider: 'ESPN' }),
      new RegExp(
        `\`${task}\` cannot be built for this ESPN league: guillotine leagues are not supported on ESPN in this version \\(v1\\)\\.$`,
      ),
    );
  });
}

test('a declared guillotine on ESPN refuses every edition, naming the reason', () => {
  for (const task of ['preview', 'recap', 'rankings', 'trade-report']) {
    assert.throws(
      () => refuseEditionForProvider({ league: { provider: 'espn' }, leagueFormat: 'guillotine' }, task),
      /guillotine leagues are not supported on ESPN in this version \(v1\)/,
    );
  }
  // An ESPN league that declares nothing, or redraft, gets its ordinary editions.
  for (const leagueFormat of [null, 'redraft', 'dynasty']) {
    assert.doesNotThrow(() => refuseEditionForProvider({ league: { provider: 'espn' }, leagueFormat }, 'preview'));
  }
});

test('a Sleeper league is refused none of the capability-gated editions', () => {
  assert.deepEqual(Object.keys(EDITION_CAPABILITIES).sort(), [
    'chop-recap',
    'five-year-plan',
    'future-stock',
    'survival-preview',
    'survival-rankings',
    'tank-watch',
  ]);
  for (const task of Object.keys(EDITION_CAPABILITIES)) {
    for (const leagueFormat of [null, 'dynasty', 'guillotine']) {
      assert.doesNotThrow(() => refuseEditionForProvider({ league: { provider: 'sleeper' }, leagueFormat }, task));
    }
  }
});

test('the opened ESPN league is refused again when a context is built for a refused edition', async (t) => {
  const week = await espnWeek(t, { leagueFormat: 'dynasty' });
  assert.throws(() => espnContext('tank-watch', week), /ESPN traded picks are not read in this version/);
  assert.throws(() => espnContext('future-stock', week), /ESPN traded picks are not read in this version/);
  assert.throws(() => espnContext('five-year-plan', week), /ESPN traded picks are not read in this version/);
  assert.throws(() => espnContext('chop-recap', week), /guillotine leagues are not supported on ESPN/);
});

/* --------------------------------------------- refusals through the CLI, before ESPN is contacted */

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');

/** Runs the CLI on an ESPN folder, logging any ESPN request to `log`, with no league taken from this shell. */
function runCli(args, root, log) {
  const env = { ...process.env, FAKE_ESPN_INSTALL: '1', FAKE_ESPN_LOG: log };
  for (const key of [
    'SLEEPER_LEAGUE_ID',
    'SLEEPER_SEASON',
    'ESPN_LEAGUE_ID',
    'ESPN_S2',
    'ESPN_SWID',
    'ESPN_ROUTE',
    'LEAGUE_PROVIDER',
    'LEAGUE_SEASON',
    'LEAGUE_FORMAT',
    'DATA_DIR',
    'OUTPUT_DIR',
    'ANTHROPIC_API_KEY',
    WORKSPACE_ENV_VAR,
  ]) {
    delete env[key];
  }
  return spawnSync(process.execPath, ['--import', FAKE_FETCH, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

const CLI_REFUSALS = [
  { command: 'tank-watch', format: 'dynasty', reason: /ESPN traded picks are not read in this version/ },
  { command: 'future-stock', format: 'dynasty', reason: /ESPN traded picks are not read in this version/ },
  // Refused for ESPN ahead of the missing --team: the provider gap is the reason.
  { command: 'five-year-plan', format: 'dynasty', reason: /ESPN traded picks are not read in this version/ },
  // Undeclared: told ESPN cannot run one, not to declare LEAGUE_FORMAT=guillotine.
  { command: 'survival-preview', format: null, reason: /guillotine leagues are not supported on ESPN in this version/ },
  { command: 'chop-recap', format: null, reason: /guillotine leagues are not supported on ESPN in this version/ },
  { command: 'survival-rankings', format: 'guillotine', reason: /guillotine leagues are not supported on ESPN in this version/ },
];

for (const { command, format, reason } of CLI_REFUSALS) {
  test(`${command} on an ESPN league${format ? ` declared ${format}` : ''} is refused before ESPN is contacted`, () => {
    const root = tempDir('pressbox-espn-gates-cli-');
    try {
      // The unknown league would fail differently if it were ever asked for.
      const lines = ['LEAGUE_PROVIDER=espn', 'ESPN_ROUTE=fetch', `ESPN_LEAGUE_ID=${UNKNOWN_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`];
      if (format) lines.push(`LEAGUE_FORMAT=${format}`);
      writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
      const log = join(root, 'espn-requests.log');
      const result = runCli([command], root, log);
      const said = `${result.stdout}\n${result.stderr}`;
      assert.notEqual(result.status, 0, said);
      assert.match(said, reason);
      assert.doesNotMatch(said, /LEAGUE_FORMAT=guillotine in \.env/);
      assert.equal(existsSync(log), false, 'ESPN was contacted');
      const output = join(root, 'output');
      assert.deepEqual(existsSync(output) ? readdirSync(output, { recursive: true }) : [], []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

// --- Unavailable entries ----------------------------------------------------------

test('seasonPotentialPoints: unavailable on ESPN, and no team carries a null in its place', async (t) => {
  const week = await espnWeek(t);
  const rankings = espnContext('rankings', week);
  assertEntry(rankings, 'seasonPotentialPoints', /ESPN is not known to report a team's season potential points/);
  for (const team of rankings.teams) assert.ok(!('potentialPoints' in team), team.team);

  const trades = espnContext('trade-report', week);
  assertEntry(trades, 'seasonPotentialPoints', /ESPN is not known to report/);
  for (const side of trades.trades[0].sides) assert.ok(!('maxPointsFor' in side.standing), side.team);
});

test('taxiSquad: unavailable on ESPN, and no team has a taxi squad', async (t) => {
  const rankings = espnContext('rankings', await espnWeek(t));
  assertEntry(rankings, 'taxiSquad', /ESPN leagues have no taxi squad that this version reads/);
  for (const team of rankings.teams) assert.ok(!('taxiSquad' in team), team.team);
});

test('keeperDesignations: unavailable in an ESPN keeper league, and absent in any other', async (t) => {
  const views = structuredClone(LEAGUE_BY_ID[PUBLIC_LEAGUE_ID].league.views);
  views.mSettings.settings.draftSettings.keeperCount = 2;
  const keeper = normalizeLeague({ mSettings: views.mSettings, mDraftDetail: views.mDraftDetail }, { leagueId: PUBLIC_LEAGUE_ID });
  assert.equal(keeper.format.keeper, true);

  const week = await espnWeek(t);
  const context = espnContext('rankings', week, { league: keeper });
  const found = assertEntry(context, 'keeperDesignations', /keeper league.*which players each team has kept or will keep is not read/);
  assert.match(found.instruction, /Do not say which players any team kept/);
  assert.equal(entry(espnContext('rankings', week), 'keeperDesignations'), undefined);
});

test('waiverBids: unavailable under rolling waivers, and absent in a FAAB league', async (t) => {
  const rolling = await espnWeek(t, { leagueId: ROLLING_LEAGUE_ID });
  for (const task of ['waiver-report', 'recap']) {
    const found = assertEntry(espnContext(task, rolling), 'waiverBids', /rolling waivers, not a FAAB budget/);
    assert.match(found.instruction, /Do not mention bids, FAAB, budgets/);
  }
  assert.equal(entry(espnContext('waiver-report', await espnWeek(t)), 'waiverBids'), undefined);
});

test('futureDraftCapital: a declared-dynasty ESPN ranking marks the factor unavailable and is given no picks', async (t) => {
  const week = await espnWeek(t, { leagueFormat: 'dynasty' });
  assert.equal(week.league.format.type, 'dynasty');
  const context = buildContext({
    task: 'rankings',
    config: CONFIG,
    league: week.league,
    teams: week.teams,
    players: week.players,
    week: SCORED_WEEK,
    weekAnalysis: week.captured.analysis,
    // Even handed some, the context does not carry them.
    futureDraftCapital: { rounds: 4, teams: [{ team: 'Invented', picks: ['2027 R1'] }] },
  });
  assert.ok(!('futureDraftCapital' in context));
  assert.ok(context.editorial.rankingWeights.future_draft_capital > 0);
  const found = assertEntry(context, 'futureDraftCapital', /ESPN traded picks are not read in this version/);
  assert.match(found.why, /future_draft_capital factor/);
  assert.match(found.instruction, /no weight/);
  assert.doesNotMatch(`${found.why} ${found.instruction}`, /No picks have been traded|holds its own future picks/);
});

test('draftPicks: an ESPN dynasty trade report does not claim the trade had no picks', async (t) => {
  const context = espnContext('trade-report', await espnWeek(t, { leagueFormat: 'dynasty' }));
  const found = assertEntry(context, 'draftPicks', /ESPN traded picks are not read in this version/);
  assert.match(found.instruction, /Do not say whether any trade included draft picks/);
  for (const side of context.trades[0].sides) assert.ok(!('picks' in side.received), side.team);
});

test('playerAge: unavailable on ESPN, which supplies no age', async (t) => {
  const week = await espnWeek(t);
  assert.ok(Object.values(week.players).every((player) => !('age' in player)));
  const found = assertEntry(espnContext('rankings', week), 'playerAge', /ESPN does not supply players' ages or birth dates/);
  assert.match(found.instruction, /Do not state or imply any player's age/);
});

test('playoffField: unavailable when the league does not seed on wins then points for, and seeds are left out', async (t) => {
  const week = await espnWeek(t);
  // The fixture seeds on head-to-head record: seeds stay, and there is no entry.
  const byRecord = espnContext('trade-report', week);
  assert.equal(entry(byRecord, 'playoffField'), undefined);
  assert.ok(byRecord.trades[0].sides.every((side) => Number.isInteger(side.standing.currentSeed)));

  const byPoints = espnContext('trade-report', week, { league: { ...week.league, playoffSeeding: 'total_points_scored' } });
  const found = assertEntry(byPoints, 'playoffField', /seeds its playoffs by total points scored, not by wins then points for/);
  assert.match(found.instruction, /Do not state any team's playoff seed/);
  assert.ok(byPoints.trades[0].sides.every((side) => !('currentSeed' in side.standing)));

  const unknown = espnContext('recap', week, { league: { ...week.league, playoffSeeding: null } });
  assertEntry(unknown, 'playoffField', /ESPN did not report how this league seeds its playoffs/);
});

test('managerNames: unavailable on ESPN, and no displayName reaches the context', async (t) => {
  const week = await espnWeek(t);
  // The normalizer still carries the fixture's placeholder display names.
  assert.equal(week.teams[0].manager, 'fixture_manager_1');
  for (const task of ['preview', 'recap', 'rankings', 'trade-report', 'waiver-report']) {
    const context = espnContext(task, week);
    const found = assertEntry(context, 'managerNames', /ESPN member display names are not confirmed as a source of manager names/);
    assert.match(found.instruction, /Refer to every team by its team name/);
    const text = JSON.stringify(context);
    assert.ok(!text.includes('fixture_manager'), task);
    assert.ok(!text.includes('"manager"'), task);
  }
  // The analysis the context was built from is left as it was.
  assert.equal(week.captured.analysis.games[0].teams[0].manager, 'fixture_manager_' + week.captured.analysis.games[0].teams[0].rosterId);
});

test('scoringDefaults: unavailable on ESPN, which has no defaults table', async (t) => {
  const context = espnContext('rankings', await espnWeek(t));
  const found = assertEntry(context, 'scoringDefaults', /ESPN publishes no table of default scoring/);
  assert.match(found.instruction, /Do not call any scoring setting standard, default, ordinary or unusual/);
});

test('tradeContents: a trade ESPN sent with no items is a trade by the teams named, never a trade of nothing', async (t) => {
  const week = await espnWeek(t);
  const trade = { ...week.captured.transactions.find((txn) => txn.type === 'trade') };
  const empty = {
    type: 'trade',
    week: SCORED_WEEK,
    teams: [trade.teams[0]],
    bid: null,
    moves: [],
    id: 'invented-empty-trade',
    completedAt: trade.completedAt,
    rosterIds: [trade.rosterIds[0]],
    sides: [],
    contentsUnknown: true,
  };

  // The colour every other edition gets.
  const recap = espnContext('recap', week, { captured: { ...week.captured, transactions: [empty] } });
  assert.deepEqual(recap.transactions, [{ type: 'trade', week: SCORED_WEEK, teams: [trade.teams[0]], contentsUnknown: true }]);
  const found = assertEntry(recap, 'tradeContents', new RegExp(`without its contents .*made by ${trade.teams[0]}`));
  assert.match(found.why, /What moved is unknown/);
  assert.match(found.instruction, /never describe it as a trade of nothing/);

  // A trade report.
  const report = espnContext('trade-report', week, { transactions: [{ ...empty, playerHistory: [], scoring: null }] });
  assert.deepEqual(report.trades, [
    { week: SCORED_WEEK, completedAt: trade.completedAt, teams: [trade.teams[0]], contentsUnknown: true },
  ]);
  assertEntry(report, 'tradeContents', /ESPN sent a completed trade without its contents/);
  // Its only trade has nothing to grade, so no trade report is built from it.
  assert.throws(
    () => buildPrompt({ task: 'trade-report', context: report, assets }),
    /Cannot build a trade-report: the only trade in the context arrived without its contents/,
  );
  // (A week with a known trade beside it still builds: tests/espn-editions.test.mjs, through the CLI.)

  // A trade whose items arrived has no such entry.
  assert.equal(entry(espnContext('trade-report', week), 'tradeContents'), undefined);
});

test('the injury entry names ESPN on an ESPN league, not Sleeper', async (t) => {
  const context = espnContext('trade-report', await espnWeek(t));
  assert.match(entry(context, 'injuryDetail').why, /^Only ESPN injury designations/);
});

test('no ESPN context carries a Sleeper-only fact: potential points, taxi or traded picks', async (t) => {
  const redraft = await espnWeek(t);
  const dynasty = await espnWeek(t, { leagueFormat: 'dynasty' });
  for (const week of [redraft, dynasty]) {
    for (const task of ['preview', 'recap', 'rankings', 'preseason-rankings', 'postseason', 'trade-report', 'waiver-report']) {
      const context = espnContext(task, week);
      const facts = JSON.stringify({ ...context, unavailable: undefined });
      for (const key of ['"taxiSquad"', '"futureDraftCapital"', '"draftCapital"', '"maxPointsFor"', '"tankWatch"', '"picks"']) {
        assert.ok(!facts.includes(key), `${week.league.format.type} ${task}: ${key}`);
      }
      for (const team of context.teams ?? []) assert.ok(!('potentialPoints' in team), `${task}: ${team.team}`);
      assert.ok(!facts.includes('null,"roster"'), task);
    }
  }
});

// --- Sleeper is unchanged ----------------------------------------------------------

const PROVIDER_GAP_FIELDS = [
  'seasonPotentialPoints',
  'taxiSquad',
  'keeperDesignations',
  'waiverBids',
  'playerAge',
  'playoffField',
  'managerNames',
  'scoringDefaults',
  'tradeContents',
];

/** A Sleeper fixture week, captured and read the way commandEdition does. */
async function sleeperWeek(t, week, type = 'dynasty') {
  const dataDir = tempDir('pressbox-sleeper-gates-');
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const client = {
    matchups: async (n) => RAW_WEEKS[n].matchups,
    transactions: async (n) => RAW_WEEKS[n].transactions,
  };
  const league = leagueOf(type);
  const teams = sleeperTeams({ rosters: RAW_ROSTERS, users: RAW_USERS });
  const players = sleeperPlayers(RAW_PLAYERS);
  const store = createStore({ dataDir });
  const provider = sleeperProvider.forClient(client);
  const captured = await captureWeek({ provider, store, league, teams, players, week });
  const transactions = readTransactions({ store, league, teams, players, describePlayer, week });
  return { league, teams, players, captured, transactions };
}

test('Sleeper editions get none of the provider-gap entries, and keep potential points, managers and seeds', async (t) => {
  const tradeWeek = await sleeperWeek(t, 1);
  const waiverWeek = await sleeperWeek(t, 2);
  const cases = [
    ['preview', tradeWeek],
    ['recap', tradeWeek],
    ['rankings', tradeWeek],
    ['preseason-rankings', tradeWeek],
    ['postseason', tradeWeek],
    ['trade-report', tradeWeek],
    ['waiver-report', waiverWeek],
  ];
  for (const [task, week] of cases) {
    const context = buildContext({
      task,
      config: CONFIG,
      league: week.league,
      teams: week.teams,
      players: week.players,
      week: week.captured.week ?? 1,
      weekAnalysis: ['preview', 'trade-report', 'waiver-report'].includes(task) ? null : week.captured.analysis,
      upcomingAnalysis: task === 'preview' ? week.captured.analysis : null,
      transactions: week.captured.transactions,
      enrichedTransactions: week.transactions,
    });
    const fields = context.unavailable.map((item) => item.field);
    for (const field of PROVIDER_GAP_FIELDS) assert.ok(!fields.includes(field), `${task}: ${field}`);
    // The checks below are not vacuous.
    if (task.includes('rankings') || task === 'postseason') assert.ok(context.teams.length > 0, task);
    if (task === 'trade-report') assert.ok(context.trades.length > 0);
    if (task === 'waiver-report') assert.ok(context.pickups.length > 0);
    const injury = entry(context, 'injuryDetail');
    if (injury) assert.match(injury.why, /^Only Sleeper injury designations/);

    for (const team of context.teams ?? []) {
      assert.equal(typeof team.potentialPoints, 'number', `${task}: ${team.team}`);
      assert.equal(typeof team.manager, 'string', `${task}: ${team.team}`);
    }
    for (const side of [...(context.trades ?? []).flatMap((trade) => trade.sides), ...(context.pickups ?? [])]) {
      assert.equal(typeof side.manager, 'string', task);
      assert.ok(Number.isInteger(side.standing.currentSeed), task);
      assert.equal(typeof side.standing.maxPointsFor, 'number', task);
    }
  }
  assert.ok(SLEEPER.capabilities.managerNames && SLEEPER.capabilities.futurePicks);
});

test('a Sleeper dynasty ranking still gets its future draft capital and the "nothing traded" entry', async (t) => {
  const week = await sleeperWeek(t, 1);
  const capital = { rounds: 3, teams: [{ team: 'Invented', picks: ['2027 R1'] }] };
  const withCapital = buildContext({
    task: 'rankings',
    config: CONFIG,
    league: week.league,
    teams: week.teams,
    players: week.players,
    week: 1,
    weekAnalysis: week.captured.analysis,
    futureDraftCapital: capital,
  });
  assert.deepEqual(withCapital.futureDraftCapital, capital);

  const without = buildContext({
    task: 'rankings',
    config: CONFIG,
    league: week.league,
    teams: week.teams,
    players: week.players,
    week: 1,
    weekAnalysis: week.captured.analysis,
  });
  assert.match(entry(without, 'futureDraftCapital').why, /^No picks have been traded/);
});
