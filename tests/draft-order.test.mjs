import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { draftOrderMovement, projectDraftOrder } from '../src/analysis/draftOrder.mjs';
import { futurePickOwnership, normalizeFutureDraftCapital } from '../src/sleeper/normalize.mjs';
import { captureWeek } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';

/**
 * The projected rookie draft order.
 *
 * The fixture is the operator's league as it stood on 2026-10-09, after week
 * 4: records, points-for and max points-for exactly as Sleeper reported them,
 * and the 2027 picks that had moved by then. The rule is the league's own:
 * the six teams that miss the playoffs pick 1-6, then the six playoff teams
 * pick 7-12, each group lowest max points-for first.
 */

const RULE = {
  groups: [
    { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
    { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
  ],
};

function team(rosterId, name, wins, pointsFor, maxPointsFor) {
  return {
    rosterId,
    name,
    record: { wins, losses: 4 - wins, ties: 0 },
    seasonPointsFor: pointsFor,
    seasonPotentialPoints: maxPointsFor,
  };
}

const BYE_WEEK_BLUES = 1;
const PUNT_INTENDED = 2;
const LOWERED_EXPECTATIONS = 3;
const SUNDAY_SCARIES = 4;
const PICK_SIX = 5;
const KICKOFF_KINGS = 6;
const REBUILD_SZN = 7;
const WAIVER_WIRE = 8;
const BENCH_MOB = 9;
const HAIL_MARY = 10;
const TACO_TUESDAY = 11;
const SACK_LUNCH = 12;

const TEAMS_2026_10_09 = [
  team(BYE_WEEK_BLUES, 'Bye Week Blues', 3, 587.57, 662.63),
  team(PUNT_INTENDED, 'Punt Intended', 3, 524.77, 632.91),
  team(LOWERED_EXPECTATIONS, 'Lowered Expectations', 2, 505.21, 637.69),
  team(SUNDAY_SCARIES, 'Sunday Scaries', 2, 507.11, 629.91),
  team(PICK_SIX, 'Pick Six Appeal', 3, 576.67, 673.79),
  team(KICKOFF_KINGS, 'Kickoff Kings', 1, 515.53, 593.69),
  team(REBUILD_SZN, 'Rebuild Szn', 1, 486.67, 597.05),
  team(WAIVER_WIRE, 'The Waiver Wire', 3, 582.97, 684.77),
  team(BENCH_MOB, 'Bench Mob', 2, 546.89, 640.49),
  team(HAIL_MARY, 'Hail Mary Heroes', 1, 532.33, 618.93),
  team(TACO_TUESDAY, 'Taco Tuesday', 2, 537.47, 594.37),
  team(SACK_LUNCH, 'Sack Lunch', 1, 513.05, 611.75),
];

const LEAGUE = {
  season: '2026',
  status: 'in_season',
  playoffTeams: 6,
  playoffWeekStart: 15,
  lastScoredWeek: 4,
  draftRounds: 5,
  format: { type: 'dynasty', source: 'detected' },
};

/** Sleeper's traded_picks as of 2026-10-09: only the picks that moved. */
const TRADED_PICKS = [
  { season: '2027', round: 1, roster_id: TACO_TUESDAY, owner_id: REBUILD_SZN, previous_owner_id: TACO_TUESDAY },
  { season: '2027', round: 2, roster_id: TACO_TUESDAY, owner_id: LOWERED_EXPECTATIONS, previous_owner_id: TACO_TUESDAY },
  { season: '2027', round: 3, roster_id: LOWERED_EXPECTATIONS, owner_id: TACO_TUESDAY, previous_owner_id: LOWERED_EXPECTATIONS },
  { season: '2027', round: 3, roster_id: REBUILD_SZN, owner_id: TACO_TUESDAY, previous_owner_id: REBUILD_SZN },
  { season: '2028', round: 2, roster_id: REBUILD_SZN, owner_id: TACO_TUESDAY, previous_owner_id: REBUILD_SZN },
  { season: '2028', round: 3, roster_id: TACO_TUESDAY, owner_id: REBUILD_SZN, previous_owner_id: TACO_TUESDAY },
];

const ROSTER_IDS = TEAMS_2026_10_09.map((t) => t.rosterId);

function picksFor(season = '2027') {
  return futurePickOwnership({ tradedPicks: TRADED_PICKS, rosterIds: ROSTER_IDS, roundsPerDraft: 5, season });
}

function project(overrides = {}) {
  return projectDraftOrder({
    league: LEAGUE,
    teams: TEAMS_2026_10_09,
    rule: RULE,
    picks: picksFor(),
    ...overrides,
  });
}

/* ------------------------------------------------------------ pick ownership */

test('every team starts owning its own pick in every round, and only moved picks change hands', () => {
  const picks = picksFor();
  assert.equal(picks.length, 12 * 5);
  const owner = (round, original) =>
    picks.find((pick) => pick.round === round && pick.originalRosterId === original).ownerRosterId;
  assert.equal(owner(1, TACO_TUESDAY), REBUILD_SZN);
  assert.equal(owner(1, REBUILD_SZN), REBUILD_SZN);
  assert.equal(owner(2, TACO_TUESDAY), LOWERED_EXPECTATIONS);
  assert.equal(owner(3, LOWERED_EXPECTATIONS), TACO_TUESDAY);
  assert.equal(owner(4, TACO_TUESDAY), TACO_TUESDAY);
  assert.ok(picks.every((pick) => pick.season === '2027'));
});

test('ownership only covers the season asked for', () => {
  const picks = picksFor('2028');
  const moved = picks.filter((pick) => pick.ownerRosterId !== pick.originalRosterId);
  assert.deepEqual(
    moved.map((pick) => [pick.round, pick.originalRosterId, pick.ownerRosterId]),
    [
      [2, REBUILD_SZN, TACO_TUESDAY],
      [3, TACO_TUESDAY, REBUILD_SZN],
    ],
  );
});

test('the future draft capital summary is unchanged by sharing the ownership walk', () => {
  const teamsByRosterId = new Map(TEAMS_2026_10_09.map((t) => [t.rosterId, t]));
  const capital = normalizeFutureDraftCapital({
    tradedPicks: TRADED_PICKS,
    league: LEAGUE,
    teamsByRosterId,
    roundsPerDraft: 5,
  });
  assert.deepEqual(capital.seasons, ['2027', '2028']);
  assert.deepEqual(capital.teams, [
    { team: 'Lowered Expectations', season: '2027', picksHeld: 5, baseline: 5, acquired: ['Taco Tuesday 2nd'], tradedAway: ['own 3rd to Taco Tuesday'] },
    { team: 'Rebuild Szn', season: '2027', picksHeld: 5, baseline: 5, acquired: ['Taco Tuesday 1st'], tradedAway: ['own 3rd to Taco Tuesday'] },
    { team: 'Taco Tuesday', season: '2027', picksHeld: 5, baseline: 5, acquired: ['Lowered Expectations 3rd', 'Rebuild Szn 3rd'], tradedAway: ['own 1st to Rebuild Szn', 'own 2nd to Lowered Expectations'] },
    { team: 'Rebuild Szn', season: '2028', picksHeld: 5, baseline: 5, acquired: ['Taco Tuesday 3rd'], tradedAway: ['own 2nd to Taco Tuesday'] },
    { team: 'Taco Tuesday', season: '2028', picksHeld: 5, baseline: 5, acquired: ['Rebuild Szn 2nd'], tradedAway: ['own 3rd to Rebuild Szn'] },
  ]);
});

/* --------------------------------------------------------- the 2026-10-09 order */

test('reproduces the 2026-10-09 order: non-playoff teams 1-6, playoff teams 7-12, lowest max points-for first', () => {
  const order = project();
  assert.equal(order.draftSeason, '2027');
  assert.equal(order.status, 'projected');
  assert.deepEqual(
    order.slots.map((slot) => [slot.pick, slot.originalTeam]),
    [
      ['1.01', 'Kickoff Kings'],
      ['1.02', 'Rebuild Szn'],
      ['1.03', 'Sack Lunch'],
      ['1.04', 'Hail Mary Heroes'],
      ['1.05', 'Sunday Scaries'],
      ['1.06', 'Lowered Expectations'],
      ['1.07', 'Taco Tuesday'],
      ['1.08', 'Punt Intended'],
      ['1.09', 'Bench Mob'],
      ['1.10', 'Bye Week Blues'],
      ['1.11', 'Pick Six Appeal'],
      ['1.12', 'The Waiver Wire'],
    ],
  );
  assert.deepEqual(order.slots.map((slot) => slot.group), [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(new Set(order.slots.slice(0, 6).map((slot) => slot.groupTeams)), new Set(['non_playoff']));
  assert.equal(order.slots[6].maxPointsFor, 594.37);
});

test('a traded pick reports its owner, not its original team', () => {
  const order = project();
  const jd = order.slots.find((slot) => slot.originalRosterId === TACO_TUESDAY);
  assert.equal(jd.pick, '1.07');
  assert.equal(jd.ownerRosterId, REBUILD_SZN);
  assert.equal(jd.owner, 'Rebuild Szn');
  assert.equal(jd.traded, true);

  const rebuildSzn = order.slots.find((slot) => slot.originalRosterId === REBUILD_SZN);
  assert.equal(rebuildSzn.owner, 'Rebuild Szn');
  assert.equal(rebuildSzn.traded, false);

  // Every round of the slot carries its own owner.
  assert.deepEqual(
    jd.rounds.map((round) => [round.round, round.owner]),
    [
      [1, 'Rebuild Szn'],
      [2, 'Lowered Expectations'],
      [3, 'Taco Tuesday'],
      [4, 'Taco Tuesday'],
      [5, 'Taco Tuesday'],
    ],
  );
  const loweredExpectations = order.slots.find((slot) => slot.originalRosterId === LOWERED_EXPECTATIONS);
  assert.equal(loweredExpectations.rounds[2].owner, 'Taco Tuesday');
  assert.equal(loweredExpectations.rounds[2].traded, true);
});

test('the gap to the slots either side is measured within a group, never across the playoff line', () => {
  const order = project();
  const [first, second] = order.slots;
  assert.equal(first.gapToPrevious, null);
  assert.equal(first.gapToNext, 3.36);
  assert.equal(second.gapToPrevious, 3.36);
  assert.equal(second.gapToNext, 14.7);
  // 1.06 and 1.07 sit in different groups: max points-for does not separate them.
  assert.equal(order.slots[5].gapToNext, null);
  assert.equal(order.slots[6].gapToPrevious, null);
  assert.equal(order.slots[11].gapToNext, null);
});

test('distance from the top-3 line', () => {
  const order = project();
  const line = (pick) => order.slots.find((slot) => slot.pick === pick).topLine;
  assert.deepEqual(line('1.01'), { line: 3, inside: true, slotsOutside: 0, margin: 25.24 });
  assert.deepEqual(line('1.03'), { line: 3, inside: true, slotsOutside: 0, margin: 7.18 });
  assert.deepEqual(line('1.04'), { line: 3, inside: false, slotsOutside: 1, margin: 7.18 });
  assert.deepEqual(line('1.06'), { line: 3, inside: false, slotsOutside: 3, margin: 25.94 });
  // A playoff team cannot reach the top three on max points-for alone.
  assert.deepEqual(line('1.07'), { line: 3, inside: false, slotsOutside: 4, margin: null });
});

/* ---------------------------------------------------------------- the cliff */

test('the cliff: Taco Tuesday missing the playoffs moves its pick from 1.07 to 1.02, and Rebuild Szn owns it', () => {
  const order = project();
  const jd = order.cliff.find((entry) => entry.originalRosterId === TACO_TUESDAY);
  assert.deepEqual(jd, {
    originalRosterId: TACO_TUESDAY,
    originalTeam: 'Taco Tuesday',
    ownerRosterId: REBUILD_SZN,
    owner: 'Rebuild Szn',
    traded: true,
    side: 'playoff',
    gamesFromLine: 0,
    pick: '1.07',
    slot: 7,
    slotIfCrossed: 2,
    pickIfCrossed: '1.02',
    slotsMoved: 5,
    swappedWith: {
      originalRosterId: SUNDAY_SCARIES,
      originalTeam: 'Sunday Scaries',
      ownerRosterId: SUNDAY_SCARIES,
      owner: 'Sunday Scaries',
      slot: 5,
      slotIfCrossed: 7,
    },
  });
});

test('the cliff covers the teams tied with the playoff line, on both sides', () => {
  const order = project();
  const byTeam = new Map(order.cliff.map((entry) => [entry.originalTeam, entry]));
  assert.deepEqual([...byTeam.keys()].sort(), ['Bench Mob', 'Lowered Expectations', 'Sunday Scaries', 'Taco Tuesday']);
  // A team that sneaks in moves its pick later.
  assert.equal(byTeam.get('Sunday Scaries').side, 'non_playoff');
  assert.equal(byTeam.get('Sunday Scaries').slotIfCrossed, 7);
  assert.equal(byTeam.get('Sunday Scaries').slotsMoved, -2);
  assert.equal(byTeam.get('Sunday Scaries').swappedWith.originalTeam, 'Taco Tuesday');
  assert.equal(byTeam.get('Sunday Scaries').swappedWith.owner, 'Rebuild Szn');
});

test('a wider bubble takes in teams a game away from the line', () => {
  const order = project({ bubbleGames: 1 });
  assert.equal(order.cliff.length, 12);
});

/* ------------------------------------------------------------- refusals */

test('refuses without a declared rule', () => {
  assert.throws(() => project({ rule: null }), /No rookie draft order is declared/);
});

test('refuses when the league does not report its playoff field', () => {
  assert.throws(() => project({ league: { ...LEAGUE, playoffTeams: null } }), /playoff/);
});

/* ------------------------------------------------------------- other sorts */

test('a descending record sort puts the best record first, then the higher points-for', () => {
  const order = project({ rule: { groups: [{ teams: 'all', sort: 'record', direction: 'descending' }] } });
  assert.deepEqual(
    order.slots.slice(0, 4).map((slot) => slot.originalTeam),
    ['Bye Week Blues', 'The Waiver Wire', 'Pick Six Appeal', 'Punt Intended'],
  );
  assert.equal(order.slots[0].gapToNext, 0);
  // Nothing in this rule depends on the playoff line, so there is no cliff.
  assert.deepEqual(order.cliff, []);
});

/* ------------------------------------------------------------- movement */

test('movement compares each pick with the previous week by its original team', () => {
  const now = project();
  const before = project({
    teams: TEAMS_2026_10_09.map((t) =>
      t.rosterId === TACO_TUESDAY ? { ...t, record: { wins: 1, losses: 3, ties: 0 }, seasonPointsFor: 400 } : t,
    ),
  });
  const movement = draftOrderMovement(now, before);
  const jd = movement.find((entry) => entry.originalRosterId === TACO_TUESDAY);
  assert.deepEqual(jd, {
    originalRosterId: TACO_TUESDAY,
    originalTeam: 'Taco Tuesday',
    ownerRosterId: REBUILD_SZN,
    owner: 'Rebuild Szn',
    slot: 7,
    previousSlot: 2,
    change: -5,
  });
});

test('movement is null without a previous projection for the same draft', () => {
  const now = project();
  assert.equal(draftOrderMovement(now, null), null);
  assert.equal(draftOrderMovement(now, { ...now, draftSeason: '2026' }), null);
});

/* ------------------------------------------------------------- the snapshot */

function fakeClient() {
  return { matchups: async () => [], transactions: async () => [] };
}

test('captureWeek records the projected draft order in the snapshot', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: { ...LEAGUE, startingSlots: [] },
    teams: TEAMS_2026_10_09.map((t) => ({ ...t, playerIds: [] })),
    players: {},
    week: 4,
    config: { rookieDraft: { order: RULE } },
    tradedPicks: TRADED_PICKS,
  });
  assert.equal(result.draftOrder.slots[6].owner, 'Rebuild Szn');
  const saved = store.loadSnapshot('2026', 4);
  assert.equal(saved.draftOrder.draftSeason, '2027');
  assert.equal(saved.draftOrder.slots[6].pick, '1.07');
  assert.equal(saved.draftOrder.cliff.find((e) => e.originalTeam === 'Taco Tuesday').pickIfCrossed, '1.02');
});

test('captureWeek leaves the draft order out when no rule is declared, or the format has no future picks', async () => {
  const run = (league, config) =>
    captureWeek({
      client: fakeClient(),
      store: createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) }),
      league: { ...league, startingSlots: [] },
      teams: TEAMS_2026_10_09.map((t) => ({ ...t, playerIds: [] })),
      players: {},
      week: 4,
      config,
      tradedPicks: TRADED_PICKS,
    });
  const undeclared = await run(LEAGUE, { rookieDraft: { order: null } });
  assert.equal('draftOrder' in undeclared, false);
  const redraft = await run({ ...LEAGUE, format: { type: 'redraft', source: 'declared' } }, { rookieDraft: { order: RULE } });
  assert.equal('draftOrder' in redraft, false);
  const lottery = await run(LEAGUE, {
    rookieDraft: { order: { groups: [{ teams: 'all', sort: 'lottery', direction: null }] } },
  });
  assert.equal('draftOrder' in lottery, false);
});
