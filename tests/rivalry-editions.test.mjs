/**
 * Declared rivalries in the editions (docs/plans/football-settings-rivalries-five-year-plan.md,
 * section 5): a preview and a recap mark a matchup between rivals with a
 * `rivalry` block, and a trade report marks a trade between them. Built through
 * prepareEdition on the fake Sleeper league and on the ESPN fixture league.
 *
 * Every team, name, note and score here is invented. No real rivalry belongs in
 * the repository.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import { NO_MEETING_SAVED } from '../src/analysis/rivalry.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { PUBLIC_LEAGUE_ID, SCORED_WEEK, SEASON } from './fixtures/mock-espn-league.mjs';

// Importing the fake Sleeper API installs it as the global fetch; kept so each
// test can put it back after swapping in the ESPN one.
const SLEEPER_FETCH = globalThis.fetch;

const NAME = 'The Invented Cup';
const NOTE = 'Started over an invented waiver claim.';

/** Bye Week Blues and Punt Intended, named and with a note; Bye Week Blues and Lowered Expectations, bare. */
const RIVALRIES_YML = [
  'rivalries:',
  '  - teams:',
  '      - Bye Week Blues',
  '      - Punt Intended',
  `    name: ${NAME}`,
  `    note: ${NOTE}`,
  '  - teams:',
  '      - Bye Week Blues',
  '      - Lowered Expectations',
  '',
].join('\n');

const ENV_KEYS = ['SLEEPER_LEAGUE_ID', 'ESPN_LEAGUE_ID', 'ESPN_ROUTE', 'LEAGUE_PROVIDER', 'LEAGUE_SEASON', 'LEAGUE_FORMAT', 'FANTASY_WEEK', 'DATA_DIR', 'OUTPUT_DIR'];

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

function leagueFolder(envLines, rivalriesYml) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-rivalry-editions-')));
  folders.push(root);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, '.env'), `${envLines.join('\n')}\n`);
  if (rivalriesYml !== null) writeFileSync(join(root, 'config', 'rivalries.yml'), rivalriesYml);
  return root;
}

/** loadConfig for a folder, with no league key taken from this shell. */
function configFor(root) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    return loadConfig({ workspaceRoot: root, envPath: join(root, '.env') });
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  }
}

const PROVIDERS = {
  sleeper: {
    env: [`SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}`, 'LEAGUE_FORMAT=redraft'],
    fetch: () => SLEEPER_FETCH,
    recapWeek: 1,
    previewWeek: 2,
  },
  espn: {
    env: ['LEAGUE_PROVIDER=espn', `ESPN_LEAGUE_ID=${PUBLIC_LEAGUE_ID}`, `LEAGUE_SEASON=${SEASON}`, 'LEAGUE_FORMAT=redraft', 'ESPN_ROUTE=fetch'],
    fetch: () => createFakeEspnFetch(),
    recapWeek: SCORED_WEEK,
    previewWeek: SCORED_WEEK + 1,
  },
};

/** Builds `task` for `week` in a fresh league folder of `provider`, with `rivalriesYml` (null for no file). */
async function build(provider, task, week, { rivalriesYml = RIVALRIES_YML, store = createMemoryStore() } = {}) {
  const { env, fetch } = PROVIDERS[provider];
  const config = configFor(leagueFolder(env, rivalriesYml));
  globalThis.fetch = fetch();
  try {
    return await prepareEdition({
      task,
      week,
      settings: { ...config, playerCache: createMemoryPlayerCache() },
      store,
      assets: loadDiskAssets({ promptsDir: config.promptsDir }),
      // The ESPN fixture is read on the fetch route, which only the command line may use.
      surface: 'cli',
      log: { say() {}, warn() {} },
    });
  } finally {
    globalThis.fetch = SLEEPER_FETCH;
  }
}

const hasTeams = (entry, a, b) => {
  const names = (entry.teams ?? []).map((side) => side.team ?? side);
  return names.includes(a) && names.includes(b);
};

for (const provider of Object.keys(PROVIDERS)) {
  const { recapWeek, previewWeek } = PROVIDERS[provider];

  test(`${provider}: a recap marks the game between rivals with their name, note and head-to-head record`, async () => {
    const { context, prompt } = await build(provider, 'recap', recapWeek);
    const game = context.thisWeek.games.find((entry) => hasTeams(entry, 'Bye Week Blues', 'Punt Intended'));
    assert.ok(game, 'the fixture has the pair meeting this week');
    const { rivalry } = game;
    assert.ok(rivalry, 'the game carries a rivalry block');
    assert.deepEqual(rivalry.teams, ['Bye Week Blues', 'Punt Intended']);
    assert.equal(rivalry.name, NAME);
    assert.equal(rivalry.note, NOTE);
    // The recap's record counts the game it is about: one meeting, this one.
    const record = rivalry.headToHead;
    assert.equal(record.unavailable, undefined);
    assert.equal(record.meetings, 1);
    assert.equal(record.lastMeeting.week, recapWeek);
    assert.equal(record.lastMeeting.winner, game.winner);
    assert.equal(record.streak.team, game.winner);
    assert.equal(record.streak.won, 1);
    assert.equal(record.wins.reduce((total, side) => total + side.wins, 0) + record.ties, 1);
    assert.equal(record.through, `${context.league.season} week ${recapWeek}`);
    assert.equal(record.throughWeekCounted, true);
    assert.ok(record.covered.some((line) => line.startsWith(`${context.league.season}: week`)));
    // No roster ids and no managers in the block.
    assert.doesNotMatch(JSON.stringify(rivalry), /rosterId|manager/);
    // Only a game between rivals carries one.
    for (const other of context.thisWeek.games.filter((entry) => entry !== game)) {
      if (!hasTeams(other, 'Bye Week Blues', 'Lowered Expectations')) assert.equal(other.rivalry, undefined);
    }
    assert.match(prompt, /"rivalry": \{/);
    assert.match(prompt, /## Rivalry matchups/);
  });

  test(`${provider}: a preview marks the matchup between rivals; with no saved meeting the record is unavailable, never 0-0`, async () => {
    const { context, prompt } = await build(provider, 'preview', previewWeek);
    const matchup = context.upcomingMatchups.find((entry) => hasTeams(entry, 'Bye Week Blues', 'Lowered Expectations'));
    assert.ok(matchup, 'the fixture pairs the bare rivals this week');
    const { rivalry } = matchup;
    assert.ok(rivalry, 'the matchup carries a rivalry block');
    assert.deepEqual(rivalry.teams, ['Bye Week Blues', 'Lowered Expectations']);
    assert.equal('name' in rivalry, false, 'no name was declared');
    assert.equal('note' in rivalry, false, 'no note was declared');
    assert.equal(rivalry.headToHead.unavailable, NO_MEETING_SAVED);
    assert.equal(rivalry.headToHead.meetings, undefined);
    assert.equal(rivalry.headToHead.wins, undefined);
    // A preview reads only the weeks before its own.
    assert.equal(rivalry.headToHead.through, `${context.league.season} week ${previewWeek - 1}`);
    for (const other of context.upcomingMatchups.filter((entry) => entry !== matchup)) {
      if (!hasTeams(other, 'Bye Week Blues', 'Punt Intended')) assert.equal(other.rivalry, undefined);
    }
    assert.match(prompt, /"rivalry": \{/);
    assert.match(prompt, /## Rivalry matchups/);
  });

  test(`${provider}: with no rivalries file, no matchup carries a rivalry`, async () => {
    for (const [task, week] of [['recap', recapWeek], ['preview', previewWeek]]) {
      const { context, prompt } = await build(provider, task, week, { rivalriesYml: null });
      const games = task === 'recap' ? context.thisWeek.games : context.upcomingMatchups;
      assert.ok(games.length, task);
      for (const game of games) assert.equal(game.rivalry, undefined, task);
      assert.doesNotMatch(prompt, /"rivalry"/, task);
    }
  });
}

test('sleeper: a trade between rivals is flagged in the trade report, and the prompt says what to do with it', async () => {
  // The fixture's one completed week 1 trade is Bye Week Blues and Punt Intended's.
  const { context, prompt } = await build('sleeper', 'trade-report', 1);
  assert.equal(context.trades.length, 1);
  const [trade] = context.trades;
  assert.deepEqual(trade.rivalries.map((rivalry) => rivalry.teams), [['Bye Week Blues', 'Punt Intended']]);
  assert.equal(trade.rivalries[0].name, NAME);
  assert.equal(trade.rivalries[0].note, NOTE);
  // The week 1 game between them is saved, and this report reads through week 1.
  assert.equal(trade.rivalries[0].headToHead.meetings, 1);
  assert.match(prompt, /"rivalries": \[/);
  assert.match(prompt, /## Trades between rivals/);

  // Rivals elsewhere in the league do not flag a trade they are not both in.
  const elsewhere = 'rivalries:\n  - teams:\n      - Bye Week Blues\n      - Lowered Expectations\n';
  for (const rivalriesYml of [elsewhere, null]) {
    const plain = await build('sleeper', 'trade-report', 1, { rivalriesYml });
    assert.equal(plain.context.trades[0].rivalries, undefined);
  }
});

test('sleeper: a recap built before its week is settled says the record does not count this game yet', async () => {
  // The fake league has scored week 1 only, so week 2 is played but not settled.
  const { context, prompt } = await build('sleeper', 'recap', 2);
  const game = context.thisWeek.games.find((entry) => hasTeams(entry, 'Bye Week Blues', 'Lowered Expectations'));
  assert.ok(game?.rivalry, 'the bare rivals meet in week 2');
  assert.equal(game.rivalry.headToHead.through, `${context.league.season} week 2`);
  assert.equal(game.rivalry.headToHead.throughWeekCounted, false);
  assert.match(prompt, /When it\s+is `false`, this week's game is not in it yet/);
});

test('the preview and recap prompts turn the intensity up for rivals only, on the note and the record alone', async () => {
  for (const [task, week] of [['preview', 2], ['recap', 1]]) {
    const { prompt } = await build('sleeper', task, week);
    assert.match(prompt, /one step\*\* above `editorial\.roastIntensity`/, task);
    assert.match(prompt, /`medium` becomes `scorched`/, task);
    assert.match(prompt, /Every other post keeps `editorial\.roastIntensity` exactly/, task);
    assert.match(prompt, /It is not a fact about either manager/, task);
    assert.match(prompt, /only history you may cite is `rivalry\.headToHead`/, task);
  }
});

test('the head-to-head record reaches back into earlier saved seasons', async () => {
  const store = createMemoryStore();
  // An invented 2025 meeting, saved as an analysed, settled week.
  const side = (rosterId, team, points) => ({ rosterId, team, points });
  store.saveSnapshot('2025', 9, {
    week: 9,
    settled: true,
    played: true,
    analysis: {
      teamWeeks: [side(1, 'Bye Week Blues', 101.5), side(2, 'Punt Intended', 140.25)],
      games: [{ teams: [side(1, 'Bye Week Blues', 101.5), side(2, 'Punt Intended', 140.25)] }],
    },
  });
  const { context } = await build('sleeper', 'recap', 1, { store });
  const { headToHead } = context.thisWeek.games.find((entry) => entry.rivalry?.name === NAME).rivalry;
  assert.equal(headToHead.meetings, 2);
  assert.deepEqual(headToHead.wins.map((side) => [side.team, side.wins]), [['Bye Week Blues', 0], ['Punt Intended', 2]]);
  assert.deepEqual(headToHead.streak, { team: 'Punt Intended', won: 2 });
  assert.equal(headToHead.biggestMargin.season, '2025');
  assert.equal(headToHead.biggestMargin.margin, 38.75);
  assert.match(headToHead.biggestMargin.score, /^Bye Week Blues 101\.5, Punt Intended 140\.25$/);
  assert.deepEqual(headToHead.covered, ['2025: week 9', '2026: week 1']);
});
