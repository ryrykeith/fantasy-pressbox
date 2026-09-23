import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { weekDanger, rollingFloor, buildDangerBoard } from '../src/analysis/danger.mjs';
import { buildEliminationLedger } from '../src/analysis/elimination.mjs';
import { captureWeek, readDangerBoard } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

/**
 * The chop-line math a guillotine week is actually about: who scored the
 * least, how close the next-lowest team came to joining them, and how each
 * survivor's floor has held up across the season. Fixtures mirror
 * tests/elimination-ledger.test.mjs's shapes, since this module reads the
 * same weekly-scores and ledger data that one already builds.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

function team(rosterId, name) {
  return { rosterId, name, ownerId: `owner-${rosterId}`, playerIds: ['qb', 'rb', 'wr'] };
}

function choppedTeam(rosterId, name) {
  return { rosterId, name, ownerId: null, playerIds: [] };
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

const FOUR_TEAMS = [
  team(1, 'Chopping Block'),
  team(2, 'Late Bloomers'),
  team(3, 'Faab Hoarders'),
  team(4, 'Bye Week Blues'),
];

/* --------------------------------------------------------------- weekDanger */

test('the chop line is the lowest score among contenders, and survival margin is the gap above it', () => {
  const result = weekDanger({
    week: 1,
    scores: [
      { rosterId: 1, points: 95.5 },
      { rosterId: 2, points: 120 },
      { rosterId: 3, points: 88 },
      { rosterId: 4, points: 91 },
    ],
    teams: FOUR_TEAMS,
  });

  assert.equal(result.chopLine, 88);
  assert.equal(result.survivalMargin, 3); // 91 - 88
});

test('the scoring order is ranked highest first, each entry carrying its distance above the chop line', () => {
  const result = weekDanger({
    week: 1,
    scores: [
      { rosterId: 1, points: 95.5 },
      { rosterId: 2, points: 120 },
      { rosterId: 3, points: 88 },
      { rosterId: 4, points: 91 },
    ],
    teams: FOUR_TEAMS,
  });

  assert.deepEqual(
    result.teams.map((entry) => ({ rank: entry.rank, team: entry.team, marginAboveChopLine: entry.marginAboveChopLine })),
    [
      { rank: 1, team: 'Late Bloomers', marginAboveChopLine: 32 },
      { rank: 2, team: 'Chopping Block', marginAboveChopLine: 7.5 },
      { rank: 3, team: 'Bye Week Blues', marginAboveChopLine: 3 },
      { rank: 4, team: 'Faab Hoarders', marginAboveChopLine: 0 },
    ],
  );
});

test('a tie for the chop line reports a survival margin of zero rather than picking a winner', () => {
  const result = weekDanger({
    week: 1,
    scores: [
      { rosterId: 1, points: 100 },
      { rosterId: 2, points: 80 },
      { rosterId: 3, points: 80 },
    ],
    teams: FOUR_TEAMS,
  });

  assert.equal(result.chopLine, 80);
  assert.equal(result.survivalMargin, 0);
});

test('a team already eliminated in an earlier week is not a contender for this one', () => {
  const ledger = buildEliminationLedger({
    teams: FOUR_TEAMS,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 95.5, 2: 120, 3: 88, 4: 91 })],
  });
  // Roster 3 (Faab Hoarders) was the low scorer in week 1 and now looks
  // chopped in Sleeper (no owner, no players) — buildEliminationLedger's
  // derivation confirms it.
  const eliminatedRoster3 = [...FOUR_TEAMS];
  eliminatedRoster3[2] = choppedTeam(3, 'Faab Hoarders');
  const week1Ledger = buildEliminationLedger({
    teams: eliminatedRoster3,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 95.5, 2: 120, 3: 88, 4: 91 })],
  });
  assert.deepEqual(week1Ledger.survivors.map((entry) => entry.rosterId), [1, 2, 4]);

  const result = weekDanger({
    week: 2,
    scores: [
      { rosterId: 1, points: 70 },
      { rosterId: 2, points: 100 },
      { rosterId: 3, points: 200 }, // Sleeper still returns a row for the chopped roster
      { rosterId: 4, points: 75 },
    ],
    teams: eliminatedRoster3,
    ledger: week1Ledger,
  });

  assert.equal(result.chopLine, 70, 'roster 3 is out, so its 200 must not set the chop line');
  assert.deepEqual(result.teams.map((entry) => entry.rosterId), [2, 4, 1]);
});

test('with no ledger supplied, every team in the roster is treated as a contender', () => {
  const result = weekDanger({
    week: 5,
    scores: [
      { rosterId: 1, points: 60 },
      { rosterId: 2, points: 65 },
    ],
    teams: FOUR_TEAMS,
  });

  assert.equal(result.chopLine, 60);
  assert.equal(result.survivalMargin, 5);
});

test('fewer than two contenders means no chop to describe: null line and margin, an empty scoring order', () => {
  const decided = weekDanger({
    week: 10,
    scores: [{ rosterId: 2, points: 140 }],
    teams: FOUR_TEAMS,
  });

  assert.equal(decided.chopLine, null);
  assert.equal(decided.survivalMargin, null);
  assert.deepEqual(decided.teams, []);
});

test('a week with no scores at all for the contenders produces no chop line either', () => {
  const result = weekDanger({ week: 1, scores: [], teams: FOUR_TEAMS });
  assert.equal(result.chopLine, null);
  assert.deepEqual(result.teams, []);
});

/* -------------------------------------------------------------- rollingFloor */

test('a team\'s floor is its lowest and median score across the weeks it played', () => {
  const floors = rollingFloor({
    teams: FOUR_TEAMS,
    weeks: [
      week(1, { 1: 90, 2: 100 }),
      week(2, { 1: 70, 2: 110 }),
      week(3, { 1: 110, 2: 90 }),
    ],
  });

  const roster1 = floors.find((entry) => entry.rosterId === 1);
  assert.equal(roster1.lowest, 70);
  assert.equal(roster1.median, 90); // 70, 90, 110 -> middle value
  assert.equal(roster1.weeksPlayed, 3);
});

test('an even number of weeks averages the two middle scores for the median', () => {
  const floors = rollingFloor({
    teams: FOUR_TEAMS,
    weeks: [week(1, { 1: 80 }), week(2, { 1: 100 }), week(3, { 1: 60 }), week(4, { 1: 120 })],
  });

  const roster1 = floors.find((entry) => entry.rosterId === 1);
  // sorted: 60, 80, 100, 120 -> median of the middle two (80, 100)
  assert.equal(roster1.median, 90);
  assert.equal(roster1.lowest, 60);
});

test('a week that was not played contributes no score to any team\'s floor', () => {
  const floors = rollingFloor({
    teams: FOUR_TEAMS,
    weeks: [week(1, { 1: 90 }), week(2, {}, { played: false })],
  });

  const roster1 = floors.find((entry) => entry.rosterId === 1);
  assert.equal(roster1.weeksPlayed, 1);
});

test('floors are sorted worst-floor-first', () => {
  const floors = rollingFloor({
    teams: FOUR_TEAMS,
    weeks: [week(1, { 1: 90, 2: 60, 3: 75 })],
  });

  assert.deepEqual(floors.map((entry) => entry.rosterId), [2, 3, 1]);
});

/* ----------------------------------------------------------- buildDangerBoard */

test('the danger board reports one entry per played week with a real chop, plus every team\'s floor', () => {
  const board = buildDangerBoard({
    teams: FOUR_TEAMS,
    weeks: [
      week(1, { 1: 95.5, 2: 120, 3: 88, 4: 91 }),
      week(2, {}, { played: false }),
    ],
  });

  assert.equal(board.weeks.length, 1);
  assert.equal(board.weeks[0].week, 1);
  assert.equal(board.floors.length, 4);
});

test('a not-played week is left out of the danger board entirely', () => {
  const board = buildDangerBoard({
    teams: FOUR_TEAMS,
    weeks: [week(1, { 1: 50 }, { played: false })],
  });

  assert.deepEqual(board.weeks, []);
});

test('the danger board threads a real elimination ledger through, dropping chopped teams from later weeks', () => {
  const week1 = week(1, { 1: 95.5, 2: 120, 3: 88, 4: 91 });
  const eliminatedRoster3 = [...FOUR_TEAMS];
  eliminatedRoster3[2] = choppedTeam(3, 'Faab Hoarders');
  const ledger = buildEliminationLedger({
    teams: eliminatedRoster3,
    startingSlots: STARTING_SLOTS,
    weeks: [week1],
  });

  const board = buildDangerBoard({
    teams: eliminatedRoster3,
    weeks: [week1, week(2, { 1: 70, 2: 100, 3: 999, 4: 75 })],
    ledger,
  });

  const week2 = board.weeks.find((entry) => entry.week === 2);
  assert.equal(week2.chopLine, 70, 'the chopped roster\'s stray score must not become the chop line');
  assert.ok(!week2.teams.some((entry) => entry.rosterId === 3));
});

/* -------------------------------------------------- captureWeek / readDangerBoard */

const MATCHUPS = [
  { roster_id: 1, matchup_id: 1, points: 120, starters: ['qb'], starters_points: [120], players: ['qb'], players_points: { qb: 120 } },
  { roster_id: 2, matchup_id: 1, points: 90, starters: ['rb'], starters_points: [90], players: ['rb'], players_points: { rb: 90 } },
];

const PLAYERS = {
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL' },
};

function fakeClient() {
  return {
    matchups: async () => MATCHUPS,
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

test('captureWeek records the danger board in a guillotine snapshot', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block'), team(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('guillotine'),
    teams,
    players: PLAYERS,
    week: 1,
    config: { guillotine: { eliminations: [] } },
  });

  assert.equal(result.danger.weeks[0].chopLine, 90);
  assert.equal(result.danger.weeks[0].survivalMargin, 30);
  assert.deepEqual(result.danger.floors.map((entry) => entry.team), ['Late Bloomers', 'Chopping Block']);

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(written.danger.weeks[0].chopLine, 90);
});

test('a format with no eliminations gets no danger key at all, rather than a null one', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block'), team(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('dynasty'),
    teams,
    players: PLAYERS,
    week: 1,
  });

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(Object.hasOwn(written, 'danger'), false);
  assert.equal(Object.hasOwn(result, 'danger'), false);
});

test('readDangerBoard fetches nothing and rebuilds the board from weeks already on disk', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [team(1, 'Chopping Block'), team(2, 'Late Bloomers')];
  const league = leagueOf('guillotine');
  const config = { guillotine: { eliminations: [] } };

  await captureWeek({ client: fakeClient(), store, league, teams, players: PLAYERS, week: 1, config });

  // A client whose methods throw if called proves readDangerBoard fetches nothing.
  const noFetchClient = {
    matchups: async () => { throw new Error('should not fetch'); },
    transactions: async () => { throw new Error('should not fetch'); },
  };

  const board = readDangerBoard({ client: noFetchClient, store, league, teams, config, throughWeek: 1 });
  assert.equal(board.weeks[0].chopLine, 90);
  assert.equal(board.weeks[0].survivalMargin, 30);
  assert.equal(board.floors.length, 2);
});
