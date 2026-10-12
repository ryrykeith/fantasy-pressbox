import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.mjs';
import { hasEliminations, hasFutureDraftCapital } from '../src/format.mjs';
import { captureWeek, readRosterWindow, readTransactions, resolveWeek } from '../src/pipeline.mjs';
import { getProvider, PROVIDER_NAMES, providerOf } from '../src/providers.mjs';
import { createStore } from '../src/store.mjs';
import { normalizePlayers, normalizeTeams } from '../src/sleeper/normalize.mjs';
import {
  RAW_PLAYERS,
  RAW_ROSTERS,
  RAW_USERS,
  WEEK_1_MATCHUPS,
  WEEK_1_TRANSACTIONS,
  leagueOf,
} from './fixtures/week-data-league.mjs';

/**
 * The league provider (src/providers.mjs): which platform a league folder is
 * on, read from .env, and the saved weeks read through it. Every league ID and
 * season here is made up.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Every key this file sets in a .env. Cleared from the real environment for
// each test, which would otherwise win over the file.
const KEYS = [
  'LEAGUE_PROVIDER',
  'SLEEPER_LEAGUE_ID',
  'ESPN_LEAGUE_ID',
  'LEAGUE_SEASON',
  'SLEEPER_SEASON',
  'POST_MAX_LENGTH',
  'SLEEPER_POST_MAX_LENGTH',
];

/** loadConfig for a league folder whose .env holds `lines`, with none of KEYS in the real environment. */
function configWith(lines) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-provider-')));
  writeFileSync(join(folder, '.env'), `${lines.join('\n')}\n`);
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  try {
    return loadConfig({ workspaceRoot: folder });
  } finally {
    for (const [key, value] of Object.entries(saved)) if (value !== undefined) process.env[key] = value;
  }
}

/* ------------------------------------------------------------------- config */

test('a folder with only SLEEPER_LEAGUE_ID is a Sleeper league, as it always was', () => {
  const config = configWith(['SLEEPER_LEAGUE_ID=1111111111']);
  assert.deepEqual(config.league, { provider: 'sleeper', id: '1111111111', season: null, secrets: {} });
  assert.equal(config.leagueId, '1111111111');
  assert.equal(config.season, null);
  assert.equal(config.editorial.output.sleeper_max_chars, 900);
});

test('a misspelled LEAGUE_PROVIDER is refused at load, listing the valid values', () => {
  assert.throws(
    () => configWith(['LEAGUE_PROVIDER=slepper', 'SLEEPER_LEAGUE_ID=1111111111']),
    (error) => {
      assert.match(error.message, /LEAGUE_PROVIDER in \.env is "slepper"/);
      assert.match(error.message, /Set LEAGUE_PROVIDER to one of:\n {2}sleeper/);
      assert.match(error.message, /remove the line/);
      return true;
    },
  );
});

test('LEAGUE_PROVIDER is read case-insensitively, and an empty one means Sleeper', () => {
  assert.equal(configWith(['LEAGUE_PROVIDER=Sleeper', 'SLEEPER_LEAGUE_ID=1']).league.provider, 'sleeper');
  assert.equal(configWith(['LEAGUE_PROVIDER=', 'SLEEPER_LEAGUE_ID=1']).league.provider, 'sleeper');
});

test('both league IDs without LEAGUE_PROVIDER are refused, naming the key to add', () => {
  assert.throws(
    () => configWith(['SLEEPER_LEAGUE_ID=1111111111', 'ESPN_LEAGUE_ID=2222222']),
    (error) => {
      assert.match(error.message, /both SLEEPER_LEAGUE_ID and ESPN_LEAGUE_ID/);
      assert.match(error.message, /Add LEAGUE_PROVIDER to \.env/);
      assert.match(error.message, /LEAGUE_PROVIDER=sleeper or LEAGUE_PROVIDER=espn/);
      return true;
    },
  );
});

test('with LEAGUE_PROVIDER set, both league IDs are fine and the provider picks one', () => {
  const config = configWith(['LEAGUE_PROVIDER=sleeper', 'SLEEPER_LEAGUE_ID=1111111111', 'ESPN_LEAGUE_ID=2222222']);
  assert.equal(config.league.id, '1111111111');
});

test('LEAGUE_SEASON wins over SLEEPER_SEASON, which is still read', () => {
  assert.equal(configWith(['SLEEPER_LEAGUE_ID=1', 'SLEEPER_SEASON=2025']).league.season, '2025');
  const both = configWith(['SLEEPER_LEAGUE_ID=1', 'SLEEPER_SEASON=2025', 'LEAGUE_SEASON=2026']);
  assert.equal(both.league.season, '2026');
  assert.equal(both.season, '2026');
});

test('POST_MAX_LENGTH wins over SLEEPER_POST_MAX_LENGTH, which is still read', () => {
  assert.equal(configWith(['SLEEPER_LEAGUE_ID=1', 'SLEEPER_POST_MAX_LENGTH=700']).editorial.output.sleeper_max_chars, 700);
  const both = configWith(['SLEEPER_LEAGUE_ID=1', 'SLEEPER_POST_MAX_LENGTH=700', 'POST_MAX_LENGTH=500']);
  assert.equal(both.editorial.output.sleeper_max_chars, 500);
});

/* ----------------------------------------------------------------- registry */

test('the registry knows Sleeper, with every capability', () => {
  assert.deepEqual(PROVIDER_NAMES, ['sleeper', 'espn']);
  const sleeper = getProvider('sleeper');
  assert.equal(sleeper.displayName, 'Sleeper');
  assert.equal(sleeper.experimental, false);
  assert.equal(sleeper.playerIdSpace, 'sleeper');
  assert.deepEqual({ ...sleeper.capabilities }, { futurePicks: true, taxi: true, guillotine: true, lastScoredWeek: true });
  // A League from before leagues were tagged is Sleeper's.
  assert.equal(providerOf({}).name, 'sleeper');
  assert.throws(() => getProvider('nope'), /Known providers: sleeper, espn/);
});

test('the registry knows ESPN: experimental, with no future picks, taxi or guillotine', () => {
  const espn = getProvider('espn');
  assert.equal(espn.displayName, 'ESPN');
  assert.equal(espn.experimental, true);
  assert.equal(espn.playerIdSpace, 'espn');
  assert.deepEqual({ ...espn.capabilities }, { futurePicks: false, taxi: false, guillotine: false, lastScoredWeek: true });
  assert.equal(providerOf({ provider: 'espn' }).name, 'espn');
  for (const method of ['fromConfig', 'forClient', 'lookupLeague', 'normalizeWeek']) {
    assert.equal(typeof espn[method], 'function', method);
  }
});

test('LEAGUE_PROVIDER=espn is accepted at config load', () => {
  const config = configWith(['LEAGUE_PROVIDER=espn', 'ESPN_LEAGUE_ID=1000001', 'LEAGUE_SEASON=2026']);
  assert.equal(config.league.provider, 'espn');
  assert.equal(config.league.id, '1000001');
});

test("the format gates also take a provider's capabilities", () => {
  const guillotine = { type: 'guillotine' };
  const dynasty = { type: 'dynasty' };
  const all = getProvider('sleeper').capabilities;
  assert.equal(hasEliminations(guillotine, all), true);
  assert.equal(hasFutureDraftCapital(dynasty, all), true);
  assert.equal(hasEliminations(guillotine, { ...all, guillotine: false }), false);
  assert.equal(hasFutureDraftCapital(dynasty, { ...all, futurePicks: false }), false);
  // The format still decides when the provider can.
  assert.equal(hasFutureDraftCapital({ type: 'redraft' }, all), false);
});

/* ---------------------------------------------------------------- pipeline */

const players = normalizePlayers(RAW_PLAYERS);
const teams = normalizeTeams({ rosters: RAW_ROSTERS, users: RAW_USERS });
const newStore = () => createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-provider-')) });

test("resolveWeek's sources name the provider", async () => {
  const league = { ...leagueOf('dynasty'), lastScoredWeek: 4, currentWeek: 5 };
  const config = { week: null };
  assert.deepEqual(await resolveWeek({ client: {}, league, config, offset: -1 }), {
    week: 4,
    source: 'Sleeper (last completed week)',
  });
  assert.deepEqual(await resolveWeek({ client: {}, league, config }), { week: 5, source: 'Sleeper (current week)' });
  const state = { state: async () => ({ week: 7 }) };
  assert.deepEqual(await resolveWeek({ client: state, league: { ...league, currentWeek: null }, config }), {
    week: 7,
    source: 'Sleeper (current week)',
  });
});

test('a saved bundle tagged with another provider is refused, naming both and the fix', () => {
  const store = newStore();
  const league = leagueOf('dynasty');
  store.saveRaw(league.season, 1, {
    provider: 'espn',
    week: 1,
    matchups: WEEK_1_MATCHUPS,
    transactions: WEEK_1_TRANSACTIONS,
  });
  const path = store.rawPath(league.season, 1);
  for (const read of [
    () => readTransactions({ store, league, teams, players, week: 1 }),
    () => readRosterWindow({ store, league, teams, players, throughWeek: 1 }),
  ]) {
    assert.throws(read, (error) => {
      assert.ok(error.message.includes(`${path} was saved from ESPN, but this league is on Sleeper`), error.message);
      assert.match(error.message, /set LEAGUE_PROVIDER=espn in its \.env/);
      assert.ok(error.message.includes(`Otherwise move ${path} out of this folder`));
      return true;
    });
  }
});

test('a settled week whose saved bundle is tagged with another provider is refused too', async () => {
  const store = newStore();
  const league = { ...leagueOf('dynasty'), lastScoredWeek: 1 };
  const client = { matchups: async () => WEEK_1_MATCHUPS, transactions: async () => WEEK_1_TRANSACTIONS };
  await captureWeek({ client, store, league, teams, players, week: 1 });
  const saved = store.loadRaw(league.season, 1);
  store.saveRaw(league.season, 1, { ...saved, provider: 'espn' });
  await assert.rejects(captureWeek({ client, store, league, teams, players, week: 1 }), /set LEAGUE_PROVIDER=espn/);
});

test('an untagged and a Sleeper-tagged bundle read the same', () => {
  const league = leagueOf('dynasty');
  const reads = ['sleeper', undefined].map((provider) => {
    const store = newStore();
    store.saveRaw(league.season, 1, {
      ...(provider ? { provider } : {}),
      week: 1,
      matchups: WEEK_1_MATCHUPS,
      transactions: WEEK_1_TRANSACTIONS,
    });
    return readTransactions({ store, league, teams, players, week: 1 });
  });
  assert.deepEqual(reads[0], reads[1]);
});

/* -------------------------------------------------------------------- guard */

test('src/pipeline.mjs imports no src/sleeper/ module', () => {
  const source = readFileSync(join(ROOT, 'src/pipeline.mjs'), 'utf8');
  assert.doesNotMatch(source, /from '\.\/sleeper\//);
});
