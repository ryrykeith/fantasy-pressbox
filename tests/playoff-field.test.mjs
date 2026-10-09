import test from 'node:test';
import assert from 'node:assert/strict';

import { projectPlayoffField, isRegularSeasonOver } from '../src/analysis/playoffField.mjs';

/**
 * 2026-10-09-shaped standings after week 4: four 3-1 teams, four 2-2, four
 * 1-3, in a 12-team league where 6 make the playoffs.
 */
function team(rosterId, wins, pointsFor) {
  return {
    rosterId,
    name: `Team ${rosterId}`,
    record: { wins, losses: 4 - wins, ties: 0 },
    seasonPointsFor: pointsFor,
  };
}

const TEAMS = [
  team(1, 3, 500), team(2, 3, 480), team(3, 3, 470), team(4, 3, 460),
  team(5, 2, 450), team(6, 2, 430), team(7, 2, 445), team(8, 2, 400),
  team(9, 1, 600), team(10, 1, 390), team(11, 1, 380), team(12, 1, 370),
];
const MIDSEASON = { playoffTeams: 6, playoffWeekStart: 15, lastScoredWeek: 4 };

test('the field is the 3-1 teams plus the two 2-2 teams with the most points-for', () => {
  const result = projectPlayoffField({ league: MIDSEASON, teams: TEAMS });
  assert.deepEqual(result.field.map((t) => t.rosterId), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(result.field.map((t) => t.seed), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(result.out.map((t) => t.rosterId), [6, 8, 9, 10, 11, 12]);
});

test('wins outrank points-for: a 1-3 team with the league high score is still out', () => {
  const result = projectPlayoffField({ league: MIDSEASON, teams: TEAMS });
  assert.ok(result.out.some((t) => t.rosterId === 9));
});

test('the bubble is the 6th seed against the 7th, with what separates them', () => {
  const { bubble } = projectPlayoffField({ league: MIDSEASON, teams: TEAMS });
  assert.equal(bubble.lastIn.seed, 6);
  assert.equal(bubble.lastIn.rosterId, 7);
  assert.equal(bubble.firstOut.seed, 7);
  assert.equal(bubble.firstOut.rosterId, 6);
  assert.equal(bubble.gamesApart, 0);
  assert.equal(bubble.pointsForApart, 15);
  assert.equal(bubble.decidedBy, 'points_for');
});

test('a bubble separated by wins is decided by record', () => {
  const teams = [team(1, 3, 100), team(2, 2, 900)];
  const { bubble } = projectPlayoffField({ league: { playoffTeams: 1 }, teams });
  assert.equal(bubble.gamesApart, 1);
  assert.equal(bubble.pointsForApart, -800);
  assert.equal(bubble.decidedBy, 'record');
});

test('a tie counts as half a win', () => {
  const teams = [
    { ...team(1, 2, 100), record: { wins: 2, losses: 1, ties: 1 } },
    team(2, 2, 900),
  ];
  const { field, bubble } = projectPlayoffField({ league: { playoffTeams: 1 }, teams });
  assert.equal(field[0].rosterId, 1);
  assert.equal(bubble.gamesApart, 0.5);
});

test('mid-season the field is labelled a projection', () => {
  assert.equal(projectPlayoffField({ league: MIDSEASON, teams: TEAMS }).status, 'projected');
});

test('once the regular season is over the same field is labelled actual', () => {
  // The regular season ends the week before playoffWeekStart.
  const league = { ...MIDSEASON, lastScoredWeek: 14 };
  assert.equal(projectPlayoffField({ league, teams: TEAMS }).status, 'actual');
  assert.equal(isRegularSeasonOver({ ...MIDSEASON, lastScoredWeek: 13 }), false);
  assert.equal(isRegularSeasonOver({ ...MIDSEASON, lastScoredWeek: 14 }), true);
});

test('with the weeks unknown, it stays a projection rather than claiming to be final', () => {
  assert.equal(isRegularSeasonOver({ playoffTeams: 6, playoffWeekStart: null, lastScoredWeek: 20 }), false);
  assert.equal(isRegularSeasonOver({ playoffTeams: 6, playoffWeekStart: 15, lastScoredWeek: null }), false);
});

test('there is no bubble when everyone makes the playoffs', () => {
  const result = projectPlayoffField({ league: { playoffTeams: 12 }, teams: TEAMS });
  assert.equal(result.bubble, null);
  assert.equal(result.out.length, 0);
});

test('an unknown playoff size is refused, not guessed', () => {
  assert.throws(() => projectPlayoffField({ league: { playoffTeams: null }, teams: TEAMS }), /how many teams make the playoffs/);
});

test('the input teams are not reordered', () => {
  const before = TEAMS.map((t) => t.rosterId);
  projectPlayoffField({ league: MIDSEASON, teams: TEAMS });
  assert.deepEqual(TEAMS.map((t) => t.rosterId), before);
});
