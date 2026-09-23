import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_WEEK_COUNT,
  byeWeekFor,
  byeWeekTableSource,
  parseByeWeekTable,
  upcomingByeExposure,
} from '../src/analysis/byeExposure.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { loadByeWeekTable } from '../src/config.mjs';
import { captureWeek, readByeExposure } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

/**
 * A bye is not a Sleeper field — src/analysis/byeExposure.mjs reads the
 * committed config/bye-weeks.<season>.yml table scripts/fetch-bye-weeks.mjs
 * derives from the real NFL schedule (guarded separately by
 * tests/bye-weeks.test.mjs) and turns it into starter-level exposure.
 *
 * Fixtures for the loader/parser use a synthetic 32-team table so these tests
 * do not depend on any particular season's real schedule. Fixtures for the
 * pipeline-level tests reuse the real, permanently-committed
 * config/bye-weeks.2026.yml the way tests/danger-board.test.mjs and
 * tests/faab-market.test.mjs reuse season '2026' for their own fixtures —
 * BUF's real 2026 bye is week 7, DAL's is week 14.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];
const TEAM_CODES = Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

/** A minimal, structurally valid 32-team table, corruptible per test via overrides. */
function validTable({ season = 2099, aliases = { OAK: 'T01' } } = {}) {
  const bye_weeks = Object.fromEntries(TEAM_CODES.map((code, index) => [code, (index % 14) + 1]));
  return { season, bye_weeks, aliases };
}

function renderYaml({ season, byeWeeks, aliases = {} }) {
  const rows = Object.entries(byeWeeks).map(([team, week]) => `  ${team}: ${week}`).join('\n');
  const aliasRows = Object.entries(aliases).map(([from, to]) => `  ${from}: ${to}`).join('\n') || '  {}';
  return `season: ${season}\n\nbye_weeks:\n${rows}\n\naliases:\n${aliasRows}\n`;
}

function team(rosterId, name, { starterIds = [], ownerId = `owner-${rosterId}`, playerIds } = {}) {
  return { rosterId, name, ownerId, playerIds: playerIds ?? starterIds, starterIds };
}

function choppedTeam(rosterId, name) {
  return { rosterId, name, ownerId: null, playerIds: [], starterIds: [] };
}

function week(number, scores, { played = true } = {}) {
  return {
    week: number,
    played,
    scores: Object.entries(scores).map(([rosterId, points]) => ({
      rosterId: Number.parseInt(rosterId, 10),
      points,
    })),
  };
}

/* --------------------------------------------------------- parseByeWeekTable */

test('a valid table resolves into one team -> week lookup, with every alias folded in', () => {
  const resolved = parseByeWeekTable(validTable(), { season: 2099 });
  assert.equal(resolved.get('T01'), 1);
  assert.equal(resolved.get('OAK'), resolved.get('T01'), 'an alias must resolve to the identical week as its target');
  assert.equal(resolved.size, 33); // 32 real teams + 1 alias
});

test('a table that is not a map is refused', () => {
  assert.throws(() => parseByeWeekTable(null, { season: 2099 }), /could not be read as a map/);
  assert.throws(() => parseByeWeekTable([1, 2, 3], { season: 2099 }), /could not be read as a map/);
});

test('a season that does not match the caller\'s expectation is refused, naming both', () => {
  assert.throws(
    () => parseByeWeekTable(validTable({ season: 2099 }), { season: 2100 }),
    (error) => {
      assert.match(error.message, /declares season 2099/);
      assert.match(error.message, /not 2100/);
      assert.match(error.message, /fetch-bye-weeks\.mjs 2100/);
      return true;
    },
  );
});

test('a missing "bye_weeks" map is refused', () => {
  assert.throws(() => parseByeWeekTable({ season: 2099 }, { season: 2099 }), /no "bye_weeks" map/);
});

test('a table with fewer than 32 teams is refused rather than reporting a partial one', () => {
  const table = validTable();
  delete table.bye_weeks.T32;
  assert.throws(() => parseByeWeekTable(table, { season: 2099 }), /lists 31 teams, expected 32/);
});

test('a bye week outside 1-18 is refused', () => {
  const table = validTable();
  table.bye_weeks.T01 = 19;
  assert.throws(() => parseByeWeekTable(table, { season: 2099 }), /"T01" has bye week "19"/);
});

test('a non-integer bye week is refused', () => {
  const table = validTable();
  table.bye_weeks.T01 = 'soon';
  assert.throws(() => parseByeWeekTable(table, { season: 2099 }), /"T01" has bye week "soon"/);
});

test('an alias pointing at a team with no bye week listed is refused', () => {
  const table = validTable({ aliases: { OAK: 'NOPE' } });
  assert.throws(() => parseByeWeekTable(table, { season: 2099 }), /alias "OAK" points to "NOPE"/);
});

test('a code listed as both a team and an alias is refused', () => {
  const table = validTable({ aliases: { T01: 'T02' } });
  assert.throws(() => parseByeWeekTable(table, { season: 2099 }), /"T01" is listed as both a team and an alias/);
});

test('byeWeekTableSource names the config file for a season', () => {
  assert.equal(byeWeekTableSource(2099), 'config/bye-weeks.2099.yml');
});

/* --------------------------------------------------------------- byeWeekFor */

const BYE_WEEKS = new Map([['BUF', 7], ['DAL', 14]]);

test('a null NFL team (free agent, or a player with none on record) has no bye week, and is not looked up', () => {
  assert.equal(byeWeekFor(BYE_WEEKS, null), null);
});

test('a known team resolves to its bye week', () => {
  assert.equal(byeWeekFor(BYE_WEEKS, 'BUF'), 7);
});

test('an NFL team not in the table is refused rather than treated as "no bye"', () => {
  assert.throws(
    () => byeWeekFor(BYE_WEEKS, 'ZZZ', { source: 'config/bye-weeks.2099.yml' }),
    (error) => {
      assert.match(error.message, /config\/bye-weeks\.2099\.yml/);
      assert.match(error.message, /"ZZZ"/);
      return true;
    },
  );
});

/* ------------------------------------------------------- upcomingByeExposure */

const PLAYERS = {
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL' },
  fa: { full_name: 'Free Agent', position: 'WR', team: null },
};

test('a starter is counted in the week its NFL team is on a bye, and no other week', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'Chopping Block', { starterIds: ['qb'] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 6,
    weekCount: 3,
  });

  assert.deepEqual(
    entry.weeks.map((w) => [w.week, w.startersOnBye]),
    [[6, 0], [7, 1], [8, 0]],
  );
  assert.deepEqual(entry.weeks[1].playerIds, ['qb']);
});

test('a roster with multiple starters on different byes reports each in its own week', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'Chopping Block', { starterIds: ['qb', 'rb'] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 7,
    weekCount: 8,
  });

  const week7 = entry.weeks.find((w) => w.week === 7);
  const week14 = entry.weeks.find((w) => w.week === 14);
  assert.equal(week7.startersOnBye, 1);
  assert.equal(week14.startersOnBye, 1);
});

test('the "0" placeholder for an empty starting slot is not a starter', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'Chopping Block', { starterIds: ['qb', '0', '', null] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 7,
    weekCount: 1,
  });

  assert.equal(entry.weeks[0].startersOnBye, 1);
});

test('a starter with no NFL team on record contributes nothing, and is never looked up', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'Chopping Block', { starterIds: ['fa'] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 7,
    weekCount: 1,
  });

  assert.equal(entry.weeks[0].startersOnBye, 0);
});

test('an NFL team not in the table is refused, not silently read as no bye', () => {
  const players = { mystery: { full_name: 'Mystery Player', position: 'WR', team: 'ZZZ' } };
  assert.throws(
    () =>
      upcomingByeExposure({
        teams: [team(1, 'Chopping Block', { starterIds: ['mystery'] })],
        players,
        byeWeeks: BYE_WEEKS,
        fromWeek: 1,
        weekCount: 1,
        source: 'config/bye-weeks.2099.yml',
      }),
    /"ZZZ"/,
  );
});

test('an eliminated team is excluded from the report entirely', () => {
  // A full-size roster (3 players, matching STARTING_SLOTS) so chopSignature
  // reads roster 1 as untouched — only roster 2 (explicitly emptied by
  // choppedTeam) should derive as eliminated here.
  const fullRoster = { starterIds: ['qb'], playerIds: ['qb', 'bench1', 'bench2'] };
  const ledger = buildEliminationLedger({
    teams: [team(1, 'Chopping Block', fullRoster), choppedTeam(2, 'Late Bloomers')],
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 80 })],
    throughWeek: 1,
  });

  const result = upcomingByeExposure({
    teams: [team(1, 'Chopping Block', fullRoster), team(2, 'Late Bloomers', { starterIds: ['rb'] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 7,
    ledger,
  });

  assert.deepEqual(result.map((entry) => entry.team), ['Chopping Block']);
});

test('with no ledger supplied, every team is treated as alive', () => {
  const result = upcomingByeExposure({
    teams: [team(1, 'A', { starterIds: [] }), team(2, 'B', { starterIds: [] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 1,
  });
  assert.equal(result.length, 2);
});

test('the default lookahead window is DEFAULT_WEEK_COUNT weeks', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'A', { starterIds: [] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 1,
  });
  assert.equal(entry.weeks.length, DEFAULT_WEEK_COUNT);
});

test('a lookahead window is clipped at week 18 rather than running past the season', () => {
  const [entry] = upcomingByeExposure({
    teams: [team(1, 'A', { starterIds: [] })],
    players: PLAYERS,
    byeWeeks: BYE_WEEKS,
    fromWeek: 17,
    weekCount: 4,
  });
  assert.deepEqual(entry.weeks.map((w) => w.week), [17, 18]);
});

/* ------------------------------------------------------- config.mjs loader */

test('loadByeWeekTable refuses a missing season table, naming the generator that produces it', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'pressbox-bye-config-'));
  assert.throws(
    () => loadByeWeekTable({ season: 2099, configDir }),
    (error) => {
      assert.match(error.message, /No bye-week table for season 2099/);
      assert.match(error.message, /config\/bye-weeks\.2099\.yml/);
      assert.match(error.message, /fetch-bye-weeks\.mjs 2099/);
      return true;
    },
  );
});

test('loadByeWeekTable refuses a malformed season table', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'pressbox-bye-config-'));
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'bye-weeks.2099.yml'), 'season: 2099\nbye_weeks:\n  T01: 1\n');
  assert.throws(() => loadByeWeekTable({ season: 2099, configDir }), /lists 1 team, expected 32/);
});

test('loadByeWeekTable reads and resolves a valid season table', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'pressbox-bye-config-'));
  const table = validTable({ season: 2099 });
  writeFileSync(
    join(configDir, 'bye-weeks.2099.yml'),
    renderYaml({ season: 2099, byeWeeks: table.bye_weeks, aliases: table.aliases }),
  );

  const resolved = loadByeWeekTable({ season: 2099, configDir });
  assert.equal(resolved.get('T01'), 1);
  assert.equal(resolved.get('OAK'), resolved.get('T01'));
});

/* --------------------------------------------------- captureWeek / readByeExposure */

const CURRENT_MATCHUPS = [
  { roster_id: 1, matchup_id: 1, points: 120, starters: ['qb'], starters_points: [120], players: ['qb'], players_points: { qb: 120 } },
  { roster_id: 2, matchup_id: 1, points: 90, starters: ['rb'], starters_points: [90], players: ['rb'], players_points: { rb: 90 } },
];

function fakeClient() {
  return {
    matchups: async () => CURRENT_MATCHUPS,
    transactions: async () => [],
  };
}

function leagueOf(formatType) {
  return {
    id: '123',
    season: '2026',
    startingSlots: STARTING_SLOTS,
    format: { type: formatType, source: 'declared' },
  };
}

// starterIds use 'qb'/'rb' to match CURRENT_MATCHUPS/PLAYERS above. playerIds
// pads each roster to STARTING_SLOTS.length so chopSignature reads neither
// roster as already emptied — the same convention
// tests/danger-board.test.mjs and tests/faab-market.test.mjs's own team()
// helpers use, for the same reason.
function guillotineTeams() {
  return [
    team(1, 'Chopping Block', { starterIds: ['qb'], playerIds: ['qb', 'bench1', 'bench2'] }),
    team(2, 'Late Bloomers', { starterIds: ['rb'], playerIds: ['rb', 'bench3', 'bench4'] }),
  ];
}

test('captureWeek records bye exposure in a guillotine snapshot, using the real committed 2026 table', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });

  // BUF's real 2026 bye is week 7 (config/bye-weeks.2026.yml) — captureWeek
  // is asked for week 7, so team 1 (starter on BUF) should show exposure in
  // week 7 and team 2 (starter on DAL, bye week 14) should show none yet.
  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('guillotine'),
    teams: guillotineTeams(),
    players: PLAYERS,
    week: 7,
    config: { guillotine: { eliminations: [] } },
  });

  const team1 = result.byeExposure.find((entry) => entry.rosterId === 1);
  const team2 = result.byeExposure.find((entry) => entry.rosterId === 2);
  assert.equal(team1.weeks.find((w) => w.week === 7).startersOnBye, 1);
  assert.equal(team2.weeks.find((w) => w.week === 7).startersOnBye, 0);

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(written.byeExposure.find((entry) => entry.rosterId === 1).weeks[0].startersOnBye, 1);
});

test('a format with no eliminations gets no byeExposure key at all, rather than a null one', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('dynasty'),
    teams: guillotineTeams(),
    players: PLAYERS,
    week: 7,
  });

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(Object.hasOwn(written, 'byeExposure'), false);
  assert.equal(Object.hasOwn(result, 'byeExposure'), false);
});

test('readByeExposure rebuilds the report from weeks already on disk, fetching nothing', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const league = leagueOf('guillotine');
  const config = { guillotine: { eliminations: [] } };
  const teams = guillotineTeams();

  await captureWeek({ client: fakeClient(), store, league, teams, players: PLAYERS, week: 7, config });

  const report = readByeExposure({ store, league, teams, players: PLAYERS, config, throughWeek: 7 });
  const team1 = report.find((entry) => entry.rosterId === 1);
  assert.equal(team1.weeks.find((w) => w.week === 7).startersOnBye, 1);
});
