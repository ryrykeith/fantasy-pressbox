import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT, WORKSPACE_ENV_VAR } from '../src/config.mjs';
import { createClient } from '../src/espn/client.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { espnImportLinks } from '../src/espn/urls.mjs';
import { captureWeek, isSettledSnapshot, openLeague, readMarketValues, readTransactions } from '../src/pipeline.mjs';
import { buildContext, buildPrompt, describePlayer } from '../src/promptContext.mjs';
import { createStore } from '../src/store.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { TEAMS_AFTER_WEEK_4 } from './fixtures/mock-dynasty-league.mjs';
import {
  FIXTURE_COOKIES,
  FIXTURE_WEEK,
  MULTI_WEEK_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  SCORED_WEEK,
  SEASON,
} from './fixtures/mock-espn-league.mjs';

// The weekly editions end to end on the ESPN fixture league
// (docs/plans/espn-football.md, task 5.2), through the CLI, on both routes:
//   - import (the default): the pages a person would save are imported, and
//     every command then runs with a fetch that throws, so it makes no request
//     of any kind;
//   - fetch: the CLI asks the fake ESPN API (tests/fixtures/fake-espn-fetch.mjs).
// Every name, ID and score is invented (tests/fixtures/mock-espn-league.mjs).
// Nothing here touches the network.

const CLI = join(PACKAGE_ROOT, 'src', 'cli.mjs');
const FAKE_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'fake-espn-fetch.mjs');
const THROWING_FETCH = join(PACKAGE_ROOT, 'tests', 'fixtures', 'throwing-fetch.mjs');
const UPCOMING_WEEK = SCORED_WEEK + 1;
const ENV_KEYS = [
  'SLEEPER_LEAGUE_ID',
  'SLEEPER_SEASON',
  'SLEEPER_POST_MAX_LENGTH',
  'POST_MAX_LENGTH',
  'ESPN_LEAGUE_ID',
  'ESPN_S2',
  'ESPN_SWID',
  'ESPN_ROUTE',
  'LEAGUE_PROVIDER',
  'LEAGUE_SEASON',
  'LEAGUE_FORMAT',
  'FANTASY_WEEK',
  'DATA_DIR',
  'OUTPUT_DIR',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  WORKSPACE_ENV_VAR,
];

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

function tempDir(prefix) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  folders.push(root);
  return root;
}

/** An ESPN league folder. The import route writes no ESPN_ROUTE line: it is the default. */
function leagueFolder(route, leagueId = PUBLIC_LEAGUE_ID) {
  const root = tempDir(`pressbox-espn-editions-${route}-`);
  const lines = ['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${leagueId}`, `LEAGUE_SEASON=${SEASON}`, 'LEAGUE_FORMAT=redraft'];
  if (route === 'fetch') lines.push('ESPN_ROUTE=fetch');
  writeFileSync(join(root, '.env'), `${lines.join('\n')}\n`);
  return root;
}

/**
 * Runs the CLI in `root` with no league taken from this shell. On the import
 * route the preloaded fetch throws and logs every URL asked for to
 * `network.log`; on the fetch route the fake ESPN API logs to the same file.
 */
function runCli(route, root, args) {
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  const log = join(root, 'network.log');
  Object.assign(env, route === 'import' ? { THROWING_FETCH_LOG: log } : { FAKE_ESPN_INSTALL: '1', FAKE_ESPN_LOG: log });
  const preload = route === 'import' ? THROWING_FETCH : FAKE_FETCH;
  const result = spawnSync(process.execPath, ['--import', preload, CLI, ...args, '--workspace', root], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  return { ...result, said: `${result.stdout}\n${result.stderr}` };
}

/** The FantasyCalc market is not ESPN: a trade or pick edition asks it for values on either route, and the fixtures refuse it. */
const isMarketUrl = (url) => new URL(url).host === 'api.fantasycalc.com';

/** Every address the CLI asked for, other than the trade-value market's. */
function requested(root) {
  const log = join(root, 'network.log');
  const urls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return urls.filter((url) => !isMarketUrl(url));
}

/** loadConfig for a folder, with no league key taken from this shell. */
function configFor(root) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return loadConfig({ workspaceRoot: root });
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  }
}

/** Saves the pages a person would save for `week` (the fake API's answers at the import addresses) and imports them. */
async function importWeek(root, week, { leagueId = PUBLIC_LEAGUE_ID, transform = (text) => text } = {}) {
  const fetch = createFakeEspnFetch();
  const links = espnImportLinks({ leagueId, season: SEASON, weeks: [week] });
  const files = [];
  for (const [kind, url] of [['league', links.league], ['matchups', links.weeks[0].matchups], ['transactions', links.weeks[0].transactions]]) {
    const path = join(root, `saved-${kind}-week${week}.json`);
    writeFileSync(path, transform(await (await fetch(url)).text(), kind));
    files.push(path);
  }
  const result = runCli('import', root, ['import-espn', '--week', String(week), ...files]);
  assert.equal(result.status, 0, result.said);
  return result;
}

/** The JSON context at the end of a prompt file. */
function contextOf(path) {
  const text = readFileSync(path, 'utf8');
  return JSON.parse(text.slice(text.lastIndexOf('```json') + '```json'.length, text.lastIndexOf('```')));
}

// --- What no ESPN context may carry ------------------------------------------------

/** ESPN's own field names and enum values, as the fixture (and docs/espn-data.md) spell them. */
const RAW_ESPN = [
  'lineupSlotId', 'lineupSlotCounts', 'playerPoolEntry', 'rosterForCurrentScoringPeriod', 'scoringPeriodId',
  'matchupPeriodId', 'matchupPeriods', 'appliedTotal', 'statSourceId', 'statId', 'proTeamId',
  'defaultPositionId', 'eligibleSlots', 'acquisitionType', 'acquisitionBudget', 'playoffSeedingRule',
  'playoffTierType', 'totalPoints', 'teamId', 'fromTeamId', 'toTeamId', 'bidAmount', 'fullName', 'displayName',
  'WAIVERS_TRADITIONAL', 'WAIVERS_CONTINUOUS', 'H2H_POINTS', 'H2H_RECORD', 'TRADE_ACCEPT', 'FREEAGENT',
  'WAIVER_ERROR', 'EXECUTED', 'UNDECIDED', 'espn_s2', 'SWID',
];

/** Sleeper's field names and the facts only Sleeper supplies (potential points-for, taxi, traded picks). */
const SLEEPER_ONLY = [
  'maxPointsFor', 'ppts', 'fpts', 'roster_id', 'owner_id', 'user_id', 'player_id', 'full_name', 'taxiSquad',
  'futureDraftCapital', 'draftCapital', 'tradedPicks', 'tankWatch', 'sleeperId',
];

/**
 * The facts in a context: everything but its `unavailable` entries (whose
 * reasons may name what a fact is called on Sleeper, to say it is missing)
 * and the two post-format settings below.
 *
 * `outputFormat: "sleeper"` and `editorial.sleeperMaxChars` name the chat a
 * post is formatted for (`--format`, POST_MAX_LENGTH), not anything about the
 * league. Decision 10 (plan §2) has prompts say "league chat"; that rename is
 * not part of this task.
 */
function factsOf(context) {
  const { unavailable, outputFormat, editorial, ...rest } = context;
  const { sleeperMaxChars, ...editorialRest } = editorial ?? {};
  return JSON.stringify({ ...rest, editorial: editorialRest });
}

/** Asserts a context carries no Sleeper-only fact, no raw ESPN field, code, ID or member, and no cookie. */
function assertNoForeignFacts(context, label) {
  const facts = factsOf(context);
  for (const name of RAW_ESPN) assert.ok(!facts.includes(name), `${label}: raw ESPN "${name}"`);
  for (const name of SLEEPER_ONLY) assert.ok(!facts.includes(`"${name}"`), `${label}: Sleeper-only "${name}"`);
  assert.doesNotMatch(facts, /sleeper/i, `${label}: names Sleeper`);
  assert.ok(!facts.includes('"manager"'), `${label}: a manager field`);
  // The fixture's invented member records: display names, first and last names, member IDs.
  assert.doesNotMatch(facts, /fixture_manager|Firstname|Lastname|FIXTURE-MEMBER/, label);
  // ESPN player IDs (the fixture's are 9,000,000 and up), and the stand-in that prints one.
  assert.doesNotMatch(facts, /\b9\d{6}\b/, `${label}: an ESPN player ID`);
  assert.doesNotMatch(facts, /Unknown player/, `${label}: an unknown player printed by ID`);
  // A numeric pro-team code or slot ID where a team code or slot name belongs.
  assert.doesNotMatch(facts, /\((\d+|[^)]*, \d+)\)/, `${label}: a numeric NFL team`);
  for (const value of Object.values(FIXTURE_COOKIES)) assert.ok(!JSON.stringify(context).includes(value), `${label}: a cookie`);

  // Every slot and position is a name, never one of ESPN's numbers.
  for (const slot of [...context.league.startingSlots]) assert.match(slot, /^[A-Z_/]+$/, label);
  for (const setting of context.league.format.scoring?.nonDefault ?? []) assert.doesNotMatch(String(setting.key), /^\d+$/, label);
  // A season total ESPN is not known to report is absent, not null or zero.
  for (const team of context.teams ?? []) assert.ok(!('potentialPoints' in team), `${label}: ${team.team}`);
}

const fields = (context) => context.unavailable.map((entry) => entry.field);

/** The entries every ESPN context carries: the facts ESPN cannot supply (task 5.1). */
const ESPN_GAPS = ['seasonPotentialPoints', 'taxiSquad', 'playerAge', 'managerNames', 'scoringDefaults'];

function assertUnavailable(context, expected, label) {
  for (const field of [...ESPN_GAPS, ...expected]) {
    const entry = context.unavailable.find((item) => item.field === field);
    assert.ok(entry, `${label}: expected an unavailable entry for ${field}; got ${fields(context).join(', ')}`);
    assert.ok(entry.why.length > 0 && entry.instruction.length > 0, `${label}: ${field}`);
  }
  // A FAAB league reports its bids, and its seeding rule is wins then points for.
  for (const field of ['waiverBids', 'playoffField', 'keeperDesignations']) {
    assert.ok(!fields(context).includes(field), `${label}: ${field}`);
  }
}

// --- The run: every command, once per route -------------------------------------------

const team = (index) => TEAMS_AFTER_WEEK_4[index].name;

/** A preview pasted back from a chat: two posts and a prediction for every week-4 game, home team to win. */
const PREVIEW_REPLY = [
  'Week 4 preview, post one.',
  '%%%',
  'Week 4 preview, post two.',
  '%%%',
  '```json',
  JSON.stringify(
    FIXTURE_WEEK.pairs.map(([home, away]) => ({ week: SCORED_WEEK, team_a: team(home), team_b: team(away), predicted_winner: team(home) })),
    null,
    2,
  ),
  '```',
  '',
].join('\n');

/** A ranking pasted back: every team, in the fixture's order. */
const RANKINGS_REPLY = [
  'Week 4 power rankings.',
  '%%%',
  '```json',
  JSON.stringify(TEAMS_AFTER_WEEK_4.map((t, i) => ({ rank: i + 1, team: t.name })), null, 2),
  '```',
  '',
].join('\n');

/** How many home teams won week 4: the fixture's scores, so the grade is checked against them. */
const HOME_WINS = FIXTURE_WEEK.pairs.filter(([home, away]) => FIXTURE_WEEK.starterTotal(home) > FIXTURE_WEEK.starterTotal(away)).length;

const EDITIONS = {
  preview: { args: ['preview', '--week', String(UPCOMING_WEEK)], prompt: `${SEASON}-week05-preview-prompt.md` },
  recap: { args: ['recap', '--week', String(SCORED_WEEK)], prompt: `${SEASON}-week04-recap-prompt.md` },
  rankings: { args: ['rankings', '--week', String(SCORED_WEEK)], prompt: `${SEASON}-week04-rankings-prompt.md` },
  'preseason-rankings': { args: ['preseason-rankings'], prompt: `${SEASON}-preseason-rankings-prompt.md` },
  transactions: { args: ['transactions', '--week', String(SCORED_WEEK)], prompt: `${SEASON}-week04-trade-report-prompt.md` },
};

const runs = {};

/** Runs every command on one route, in a working order, once; tests read the results. */
function runRoute(route) {
  runs[route] ??= (async () => {
    const root = leagueFolder(route);
    if (route === 'import') {
      await importWeek(root, SCORED_WEEK);
      await importWeek(root, UPCOMING_WEEK);
    }
    const snapshotPath = (week) => join(root, 'data', 'snapshots', String(SEASON), `week-${week}.json`);
    const results = {};
    const replyPaths = {
      preview: join(root, 'pasted-preview.txt'),
      rankings: join(root, 'pasted-rankings.txt'),
    };
    writeFileSync(replyPaths.preview, PREVIEW_REPLY);
    writeFileSync(replyPaths.rankings, RANKINGS_REPLY);

    // The preview captures week 5 and, for last week's results, week 4.
    results.preview = runCli(route, root, EDITIONS.preview.args);
    const settledWeek4 = existsSync(snapshotPath(SCORED_WEEK)) ? readFileSync(snapshotPath(SCORED_WEEK), 'utf8') : null;
    results.recordPreview = runCli(route, root, ['record', replyPaths.preview, '--task', 'preview', '--week', String(SCORED_WEEK)]);
    // The recap grades the predictions just recorded.
    results.recap = runCli(route, root, EDITIONS.recap.args);
    results.rankings = runCli(route, root, EDITIONS.rankings.args);
    results.recordRankings = runCli(route, root, ['record', replyPaths.rankings, '--task', 'rankings', '--week', String(SCORED_WEEK)]);
    results['preseason-rankings'] = runCli(route, root, EDITIONS['preseason-rankings'].args);
    results.transactions = runCli(route, root, EDITIONS.transactions.args);
    results.grade = runCli(route, root, ['grade', '--week', String(SCORED_WEEK)]);
    results.check = runCli(route, root, ['check', replyPaths.preview]);
    return { root, results, settledWeek4, snapshotPath, output: join(root, 'output') };
  })();
  return runs[route];
}

for (const route of ['import', 'fetch']) {
  for (const [name, edition] of Object.entries(EDITIONS)) {
    test(`${route} route: ${name} builds a prompt on the ESPN fixture league`, async () => {
      const { results, output } = await runRoute(route);
      const result = results[name];
      assert.equal(result.status, 0, result.said);
      const path = join(output, edition.prompt);
      assert.ok(existsSync(path), `no prompt at ${path}:\n${result.said}`);
      assert.match(result.stdout, new RegExp(`Prompt written to ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.doesNotMatch(result.said, /a request was made to (?!https:\/\/api\.fantasycalc\.com)/);
    });
  }

  test(`${route} route: no context carries a Sleeper-only fact or a raw ESPN field, code or ID`, async () => {
    const { output } = await runRoute(route);
    for (const [name, edition] of Object.entries(EDITIONS)) assertNoForeignFacts(contextOf(join(output, edition.prompt)), `${route} ${name}`);
  });

  test(`${route} route: each context has the expected unavailable entries`, async () => {
    const { output } = await runRoute(route);
    const context = (name) => contextOf(join(output, EDITIONS[name].prompt));

    const preview = context('preview');
    assertUnavailable(preview, [], `${route} preview`);
    // The preview is about week 5's pairings, with week 4's results beside them.
    assert.equal(preview.upcomingMatchups.length, 6);
    assert.deepEqual(preview.upcomingMatchups[0].teams.map((t) => t.team), [team(0), team(2)]);
    assert.equal(preview.previousWeek.week, SCORED_WEEK);
    for (const game of preview.previousWeek.games) {
      for (const side of game.teams) {
        // A best possible lineup can never be worth less than the lineup played.
        if ('potentialPoints' in side) assert.ok(side.potentialPoints >= side.points, `${side.team}: ${side.potentialPoints} < ${side.points}`);
        if (typeof side.lineupEfficiency === 'number') assert.ok(side.lineupEfficiency <= 100, side.team);
      }
    }

    const recap = context('recap');
    assertUnavailable(recap, [], `${route} recap`);
    // The predictions recorded before the recap are graded in it.
    assert.ok(!fields(recap).includes('previousPredictions'));
    assert.equal(recap.thisWeek.games.length, 6);
    for (const game of recap.thisWeek.games) {
      for (const side of game.teams) {
        assert.equal(typeof side.lineupEfficiency, 'number', side.team);
        assert.ok(side.lineupEfficiency <= 100 && side.potentialPoints >= side.points, side.team);
      }
    }

    const rankings = context('rankings');
    assertUnavailable(rankings, ['futureDraftCapital'], `${route} rankings`);
    assert.equal(rankings.teams.length, 12);

    const preseason = context('preseason-rankings');
    assertUnavailable(preseason, ['futureDraftCapital'], `${route} preseason-rankings`);
    assert.ok(!('thisWeek' in preseason), 'the preseason edition reads no week');

    const trades = context('transactions');
    assertUnavailable(trades, ['marketValues', 'draftPicks', 'injuryDetail'], `${route} transactions`);
    assert.match(trades.unavailable.find((e) => e.field === 'marketValues').why, /Could not reach FantasyCalc/);
    assert.match(trades.unavailable.find((e) => e.field === 'injuryDetail').why, /^Only ESPN injury designations/);
    assert.ok(!('marketValues' in trades));
    assert.deepEqual(trades.trades[0].sides.map((side) => side.team).sort(), [team(6), team(10)].sort());
  });

  test(`${route} route: record files the pasted preview and ranking, grade scores them, check counts the posts`, async () => {
    const { results, root } = await runRoute(route);
    assert.equal(results.recordPreview.status, 0, results.recordPreview.said);
    assert.match(results.recordPreview.stdout, /Recorded 6 predictions/);
    assert.equal(results.recordRankings.status, 0, results.recordRankings.said);
    assert.match(results.recordRankings.stdout, /Recorded 12 rankings/);
    assert.ok(existsSync(join(root, 'data')));

    assert.equal(results.grade.status, 0, results.grade.said);
    assert.match(results.grade.stdout, new RegExp(`Week ${SCORED_WEEK} predictions: ${HOME_WINS}/6 correct`));
    assert.doesNotMatch(results.grade.said, /still being played/);

    assert.equal(results.check.status, 0, results.check.said);
    assert.match(results.check.stdout, /2 post\(s\), limit \d+ characters/);

    for (const name of ['recordPreview', 'recordRankings', 'grade', 'check']) {
      assert.doesNotMatch(results[name].said, /\b9\d{6}\b|Unknown player|fixture_manager/, name);
    }
  });

  test(`${route} route: the settled week-4 snapshot is not rewritten by later runs; week 5 is not settled`, async () => {
    const { settledWeek4, snapshotPath } = await runRoute(route);
    assert.ok(settledWeek4, 'the preview did not capture week 4');
    const week4 = JSON.parse(settledWeek4);
    assert.equal(week4.settled, true);
    // recap, rankings, transactions and grade all captured week 4 again after the preview.
    assert.equal(readFileSync(snapshotPath(SCORED_WEEK), 'utf8'), settledWeek4);
    // ESPN's rule: the league is at scoring period 5, so week 4 is its last scored week and week 5 is not.
    const week5 = JSON.parse(readFileSync(snapshotPath(UPCOMING_WEEK), 'utf8'));
    assert.equal(week5.settled, false);
    assert.equal(week5.played, false);
  });
}

test('import route: no command made a request of any kind; the fetch route asked only the fake ESPN API', async () => {
  const imported = await runRoute('import');
  assert.deepEqual(requested(imported.root), []);
  const fetched = await runRoute('fetch');
  const urls = requested(fetched.root);
  assert.ok(urls.length > 0, 'the fetch route asked for nothing');
  for (const url of urls) assert.equal(new URL(url).host, 'lm-api-reads.fantasy.espn.com', url);
});

// --- The waiver report: no command builds one yet, so it is built in process -------------

for (const route of ['import', 'fetch']) {
  test(`${route} route: a waiver report builds from the ESPN week, with the same guards`, async (t) => {
    const { root } = await runRoute(route);
    const real = globalThis.fetch;
    const asked = [];
    // The import route must ask nothing; the fetch route may ask only the fake ESPN API.
    const fake = createFakeEspnFetch({ log: (url) => asked.push(url) });
    globalThis.fetch = route === 'import'
      ? async (url) => {
          asked.push(String(url));
          throw new Error(`a request was made to ${url}`);
        }
      : fake;
    t.after(() => {
      globalThis.fetch = real;
    });

    const config = configFor(root);
    const ctx = await openLeague(config);
    const captured = await captureWeek({ ...ctx, week: SCORED_WEEK });
    assert.equal(captured.kept, true, 'week 4 is settled and read back');
    const enriched = readTransactions({ ...ctx, describePlayer, week: SCORED_WEEK });
    const marketValues = await readMarketValues({ ...ctx, week: SCORED_WEEK });
    const context = buildContext({
      task: 'waiver-report',
      config,
      league: ctx.league,
      teams: ctx.teams,
      players: ctx.players,
      week: SCORED_WEEK,
      transactions: captured.transactions,
      enrichedTransactions: enriched,
      marketValues,
    });
    const prompt = buildPrompt({ task: 'waiver-report', context, promptsDir: config.promptsDir });
    assert.ok(prompt.includes('"task": "waiver-report"'));

    // The FAAB claim, the free-agent add and the drop; the failed claim is a lost bid, not a move.
    assert.deepEqual(context.pickups.map((p) => p.team).sort(), [team(2), team(4), team(11)].sort());
    const claim = context.pickups.find((p) => p.type === 'waiver');
    assert.equal(claim.team, team(2));
    // The free agent he claimed is on no roster. The fetch route has his name
    // from the player list; the import route has no player list, and says so
    // rather than printing his ESPN ID.
    assert.equal(
      claim.added[0].player,
      route === 'fetch' ? 'Pickup Marchbanks (WR, DEN)' : 'Name unavailable (not in the league data on file)',
    );
    assertNoForeignFacts(context, `${route} waiver-report`);
    assertUnavailable(context, ['injuryDetail'], `${route} waiver-report`);
    // The market is FantasyCalc's, not ESPN's, and the fakes refuse it.
    const espnAsked = asked.filter((url) => !isMarketUrl(url));
    if (route === 'import') assert.deepEqual(espnAsked, []);
    else assert.ok(espnAsked.every((url) => new URL(url).host === 'lm-api-reads.fantasy.espn.com'), asked.join('\n'));
  });
}

// --- Market values are looked up by the ESPN ID -------------------------------------------

const espnLeague = (format = { type: 'redraft', scoring: {} }) => ({ provider: 'espn', season: String(SEASON), format });

/** FantasyCalc's shape. The names are invented: one player has both IDs, one only a Sleeper ID, one only an ESPN ID. */
const MARKET_FIXTURE = [
  { value: 7000, overallRank: 1, positionRank: 1, player: { name: 'Rival Runner', position: 'RB', sleeperId: '111', espnId: '9000011', maybeAge: 24.04 } },
  { value: 3000, overallRank: 2, positionRank: 1, player: { name: 'Sleeperonly Receiver', position: 'WR', sleeperId: '222' } },
  { value: 2000, overallRank: 3, positionRank: 2, player: { name: 'Espnonly Receiver', position: 'WR', espnId: '9000033' } },
];

function fakeMarket() {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => MARKET_FIXTURE };
  };
  return { impl, calls };
}

const marketArgs = (store, league, impl) => ({ store, league, teams: TEAMS_AFTER_WEEK_4, week: SCORED_WEEK, fetchImpl: impl });

test('an ESPN league is priced by espnId: a player with no espnId is unpriced, never matched by name', async () => {
  const store = createStore({ dataDir: tempDir('pressbox-espn-market-') });
  const market = fakeMarket();
  const result = await readMarketValues(marketArgs(store, espnLeague(), market.impl));
  assert.equal(result.idSpace, 'espn');
  assert.deepEqual(Object.keys(result.players).sort(), ['9000011', '9000033']);
  assert.equal(result.players['9000011'].value, 7000);
  // Sleeperonly Receiver has no ESPN ID: he is not keyed by his Sleeper ID, and not found by name.
  assert.ok(!('222' in result.players));
  assert.ok(!Object.values(result.players).some((p) => p.name === 'Sleeperonly Receiver'));
  assert.equal(store.loadMarketValues(String(SEASON), SCORED_WEEK).idSpace, 'espn');
});

test('a saved market with no idSpace reads as Sleeper, so an ESPN league fetches it again, never reads it', async () => {
  const store = createStore({ dataDir: tempDir('pressbox-espn-market-') });
  // An ESPN ID looked up in a Sleeper-keyed market could name another player.
  store.saveMarketValues(String(SEASON), SCORED_WEEK, { source: 'FantasyCalc', players: { 9000011: { value: 9999 } }, picks: {} });
  const market = fakeMarket();
  const result = await readMarketValues(marketArgs(store, espnLeague(), market.impl));
  assert.equal(market.calls.length, 1);
  assert.equal(result.players['9000011'].value, 7000);
  // The new snapshot replaced it and is read back without another fetch.
  await readMarketValues(marketArgs(store, espnLeague(), market.impl));
  assert.equal(market.calls.length, 1);
});

test('a saved ESPN market is fetched again for a Sleeper league', async () => {
  const store = createStore({ dataDir: tempDir('pressbox-espn-market-') });
  store.saveMarketValues(String(SEASON), SCORED_WEEK, { source: 'FantasyCalc', idSpace: 'espn', players: { 111: { value: 1 } }, picks: {} });
  const market = fakeMarket();
  const sleeper = { provider: 'sleeper', season: String(SEASON), format: { type: 'redraft', scoring: {} } };
  const result = await readMarketValues(marketArgs(store, sleeper, market.impl));
  assert.equal(market.calls.length, 1);
  assert.deepEqual(Object.keys(result.players).sort(), ['111', '222']);
});

test('an ESPN keeper league is priced as redraft and a declared-dynasty one as dynasty', async () => {
  for (const [type, isDynasty] of [['redraft', false], ['dynasty', true]]) {
    const store = createStore({ dataDir: tempDir('pressbox-espn-market-') });
    const market = fakeMarket();
    await readMarketValues(marketArgs(store, espnLeague({ type, keeper: type === 'redraft', scoring: {} }), market.impl));
    assert.equal(new URL(market.calls[0]).searchParams.get('isDynasty'), String(isDynasty), type);
  }
});

// --- A settled week is kept, even when ESPN later reports it differently ------------------

test('fetch route: a settled ESPN week is read back, not re-fetched, when ESPN later reports other scores', async (t) => {
  const dataDir = tempDir('pressbox-espn-settled-');
  const store = createStore({ dataDir });
  const opened = async (fetch) => {
    const client = createClient({ leagueId: PUBLIC_LEAGUE_ID, season: SEASON, dataDir, fetch });
    const provider = espnProvider.forClient(client, { config: { leagueFormat: 'redraft' } });
    return { provider, ...(await provider.openLeague()) };
  };

  const first = await opened(createFakeEspnFetch());
  // ESPN's rule: lastScoredWeek is the scoring period before the current one.
  assert.equal(first.league.lastScoredWeek, SCORED_WEEK);
  const captured = await captureWeek({ ...first, store, week: SCORED_WEEK });
  assert.ok(!captured.kept, 'the first capture is written');
  const saved = readFileSync(store.snapshotPath(String(SEASON), SCORED_WEEK), 'utf8');
  assert.equal(isSettledSnapshot(JSON.parse(saved), first.league), true);

  // ESPN now reports every week-4 score 10 points higher.
  const fake = createFakeEspnFetch();
  const asked = [];
  const changed = async (url, init) => {
    asked.push(String(url));
    const response = await fake(url, init);
    if (!String(url).includes(`scoringPeriodId=${SCORED_WEEK}`)) return response;
    const body = await response.json();
    for (const m of body.schedule ?? []) for (const side of [m.home, m.away]) if (side) side.totalPoints += 10;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const again = await opened(changed);
  asked.length = 0;
  const reread = await captureWeek({ ...again, store, week: SCORED_WEEK });
  assert.equal(reread.kept, true);
  // As saved: the analysis written first, through JSON, not one with the new scores.
  assert.deepEqual(reread.analysis, JSON.parse(JSON.stringify(captured.analysis)));
  assert.equal(readFileSync(store.snapshotPath(String(SEASON), SCORED_WEEK), 'utf8'), saved);
  // Its transactions come from the raw bundle on disk: the settled week asks ESPN nothing.
  assert.deepEqual(asked, []);

  // The week in progress is captured again each time.
  const upcoming = await captureWeek({ ...again, store, week: UPCOMING_WEEK });
  assert.ok(!upcoming.kept);
  assert.equal(isSettledSnapshot(store.loadSnapshot(String(SEASON), UPCOMING_WEEK), again.league), false);
  t.diagnostic(`week 5 snapshot: ${store.snapshotPath(String(SEASON), UPCOMING_WEEK)}`);
});

test('import route: re-importing a settled week with other scores leaves its snapshot and its recap as they were', async () => {
  const root = leagueFolder('import');
  await importWeek(root, SCORED_WEEK);
  const first = runCli('import', root, ['recap', '--week', String(SCORED_WEEK)]);
  assert.equal(first.status, 0, first.said);
  const snapshot = join(root, 'data', 'snapshots', String(SEASON), `week-${SCORED_WEEK}.json`);
  const saved = readFileSync(snapshot, 'utf8');
  assert.equal(JSON.parse(saved).settled, true);
  const prompt = join(root, 'output', `${SEASON}-week04-recap-prompt.md`);
  const before = contextOf(prompt).thisWeek.games;

  await importWeek(root, SCORED_WEEK, {
    transform: (text, kind) => {
      if (kind !== 'matchups') return text;
      const body = JSON.parse(text);
      for (const m of body.schedule) for (const side of [m.home, m.away]) side.totalPoints += 10;
      return JSON.stringify(body);
    },
  });
  const second = runCli('import', root, ['recap', '--week', String(SCORED_WEEK)]);
  assert.equal(second.status, 0, second.said);
  assert.equal(readFileSync(snapshot, 'utf8'), saved);
  assert.deepEqual(contextOf(prompt).thisWeek.games, before);
  assert.deepEqual(requested(root), []);
});

// --- A multi-week matchup period is refused on the import route too -----------------------
// (The fetch route's refusals are in tests/espn-multi-week.test.mjs.)

for (const command of ['preview', 'recap', 'rankings', 'grade']) {
  test(`import route: ${command} refuses a week whose matchup period spans two NFL weeks`, async () => {
    const root = leagueFolder('import', MULTI_WEEK_LEAGUE_ID);
    await importWeek(root, SCORED_WEEK, { leagueId: MULTI_WEEK_LEAGUE_ID });
    const result = runCli('import', root, [command, '--week', String(SCORED_WEEK)]);
    assert.notEqual(result.status, 0, result.said);
    assert.match(result.said, /matchup period 4/);
    assert.match(result.said, /weeks 4 and 5/);
    assert.match(result.said, /more than one NFL week/);
    const output = join(root, 'output');
    assert.deepEqual(existsSync(output) ? readdirSync(output) : [], []);
    assert.deepEqual(requested(root), []);
  });
}

// --- A trade ESPN sent without its contents is never graded --------------------------------
// ESPN often sends a trade's items only to the account that made it
// (docs/espn-data.md, open question 6). Both cases go through the CLI on pages
// saved from the fake ESPN API, with a trade's items removed.

/** Rewrites the saved transactions page's trade; every other page is left as served. */
function withTrades(rewrite) {
  return (text, kind) => {
    if (kind !== 'transactions') return text;
    const body = JSON.parse(text);
    const trade = body.transactions.find((txn) => txn.type === 'TRADE_ACCEPT');
    body.transactions = [...body.transactions.filter((txn) => txn !== trade), ...rewrite(trade)];
    return JSON.stringify(body);
  };
}

test("import route: transactions builds no trade report when the week's only trade arrived without its contents", async () => {
  const root = leagueFolder('import');
  await importWeek(root, SCORED_WEEK, { transform: withTrades((trade) => [{ ...trade, items: [] }]) });
  const result = runCli('import', root, ['transactions', '--week', String(SCORED_WEEK)]);
  assert.equal(result.status, 0, result.said);
  assert.match(result.stdout, /ESPN sent the trade without its contents/);
  assert.match(result.stdout, /nothing to grade/);
  assert.match(result.stdout, /No edition was built/);
  const output = join(root, 'output');
  assert.deepEqual(existsSync(output) ? readdirSync(output) : [], []);
  assert.deepEqual(requested(root), []);
});

test('import route: transactions still grades a known trade, and carries one without its contents as made, not graded', async () => {
  const root = leagueFolder('import');
  const unknownTeamId = 3;
  await importWeek(root, SCORED_WEEK, {
    transform: withTrades((trade) => [
      trade,
      { ...trade, id: 'invented-trade-without-items', teamId: unknownTeamId, processDate: trade.processDate + 1000, items: [] },
    ]),
  });
  const result = runCli('import', root, ['transactions', '--week', String(SCORED_WEEK)]);
  assert.equal(result.status, 0, result.said);
  const path = join(root, 'output', EDITIONS.transactions.prompt);
  assert.ok(existsSync(path), `no prompt at ${path}:\n${result.said}`);

  const context = contextOf(path);
  assert.equal(context.trades.length, 2);
  const known = context.trades.find((trade) => !trade.contentsUnknown);
  const unknown = context.trades.find((trade) => trade.contentsUnknown);
  assert.equal(known.sides.length, 2);
  // Made by its team, contents unknown: no sides, so nothing in it reads as gradeable.
  assert.deepEqual(Object.keys(unknown).sort(), ['completedAt', 'contentsUnknown', 'teams', 'week']);
  assert.equal(unknown.teams.length, 1);
  assert.ok(!known.sides.some((side) => unknown.teams.includes(side.team)), 'the fixture trade does not involve team 3');

  const entry = context.unavailable.find((item) => item.field === 'tradeContents');
  assert.ok(entry, 'expected a tradeContents unavailable entry');
  assert.ok(entry.why.includes(`made by ${unknown.teams[0]}`), entry.why);
  assert.match(entry.instruction, /do not grade it/);
  // And the edition's own instructions say the same.
  const prompt = readFileSync(path, 'utf8');
  assert.match(prompt, /A trade marked `contentsUnknown` has no sides[^]*Do\s+not grade it/);
  assert.deepEqual(requested(root), []);
});

// --- A preview is never built for a week with no pairings ----------------------------------
// A week past the schedule, or a playoff period ESPN does not list, has no
// matchup entries. The prompt would ask for a post per game and list none.

/** The fixture's schedule ends before this week, so the fetch route gets no entries for it. */
const UNSCHEDULED_WEEK = 9;

test('fetch route: preview refuses a week with no schedule entries and writes no prompt', async () => {
  const root = leagueFolder('fetch');
  const result = runCli('fetch', root, ['preview', '--week', String(UNSCHEDULED_WEEK)]);
  assert.notEqual(result.status, 0, result.said);
  assert.match(result.said, new RegExp(`Cannot build a preview for week ${UNSCHEDULED_WEEK}`));
  assert.match(result.said, /no matchups/);
  const output = join(root, 'output');
  assert.deepEqual(existsSync(output) ? readdirSync(output) : [], []);
});

test('buildPrompt refuses a head-to-head preview whose context has no upcoming matchups, naming the week', async () => {
  const root = leagueFolder('import');
  await importWeek(root, SCORED_WEEK);
  const ok = runCli('import', root, ['rankings', '--week', String(SCORED_WEEK)]);
  assert.equal(ok.status, 0, ok.said);
  const context = contextOf(join(root, 'output', EDITIONS.rankings.prompt));
  for (const upcomingMatchups of [[], undefined]) {
    assert.throws(
      () => buildPrompt({ task: 'preview', context: { ...context, week: 9, upcomingMatchups } }),
      /Cannot build a preview for week 9/,
    );
  }
});
