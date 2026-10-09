import test from 'node:test';
import assert from 'node:assert/strict';

import { ageBandsFor, buildRosterWindow, summarizeAges } from '../src/analysis/rosterWindow.mjs';
import { readRosterWindow } from '../src/pipeline.mjs';

const players = {
  qb: { position: 'QB', age: 34 },
  rb1: { position: 'RB', age: 23 },
  rb2: { position: 'RB', age: 29 },
  benchRb: { position: 'RB', age: 21 },
  te: { position: 'TE', age: 27 },
  noAge: { position: 'WR', age: null },
  BUF: { position: 'DEF', age: null },
};

const teams = [
  {
    rosterId: 1,
    name: 'Old Guard',
    playerIds: ['qb', 'rb1', 'rb2', 'benchRb', 'te', 'noAge', 'BUF'],
    starterIds: ['qb', 'rb1', 'rb2', 'te', '0', 'BUF'],
  },
  { rosterId: 2, name: 'Empty', playerIds: [], starterIds: [] },
];

const weeks = [
  {
    week: 1,
    rosters: [
      {
        rosterId: 1,
        starterIds: ['qb', 'rb1', 'te'],
        playerPoints: { qb: 20, rb1: 10, te: 10, benchRb: 99 },
      },
    ],
  },
  {
    week: 2,
    rosters: [
      {
        rosterId: 1,
        starterIds: ['qb', 'rb2', 'BUF', 'noAge'],
        playerPoints: { qb: 10, rb2: 10, BUF: 5, noAge: 5 },
      },
    ],
  },
];

test('summarizeAges keeps unknown ages out of the statistics', () => {
  assert.deepEqual(summarizeAges([22, 30, null]), {
    count: 3,
    unknownAge: 1,
    meanAge: 26,
    medianAge: 26,
    youngest: 22,
    oldest: 30,
  });
  assert.equal(summarizeAges([]).meanAge, null);
});

test('ageBandsFor labels bands and rejects bad edges', () => {
  assert.deepEqual(ageBandsFor([25, 29]).map((b) => b.label), ['<25', '25-28', '29+']);
  assert.throws(() => ageBandsFor([29, 25]), /strictly increasing/);
  assert.throws(() => ageBandsFor([]), /strictly increasing/);
});

test('ages are summarized per position, with starters apart from the whole position', () => {
  const [team] = buildRosterWindow({ teams, players, weeks }).teams;
  assert.deepEqual(Object.keys(team.positions), ['QB', 'RB', 'TE', 'WR']);
  assert.equal(team.positions.RB.count, 3);
  assert.equal(team.positions.RB.meanAge, 24.3);
  assert.equal(team.positions.RB.oldest, 29);
  assert.equal(team.positions.RB.starters.count, 2);
  assert.equal(team.positions.RB.starters.meanAge, 26);
  assert.equal(team.positions.WR.unknownAge, 1);
  assert.equal(team.positions.DEF, undefined);
});

test('the starting lineup is summarized on its own and weighted by points', () => {
  const [team] = buildRosterWindow({ teams, players, weeks }).teams;
  // qb, rb1, rb2, te and the DEF; the empty "0" slot is not a player.
  assert.equal(team.starters.count, 5);
  assert.equal(team.starters.unknownAge, 1);
  assert.equal(team.starters.meanAge, 28.3);
  // 30 pts @34, 10 @23, 10 @27, 10 @29 => 1810 / 60. Players with no age carry no weight.
  assert.equal(team.starters.pointsWeightedMeanAge, 30.2);
});

test('production splits starters points by age band; bench points never count', () => {
  const [team] = buildRosterWindow({ teams, players, weeks }).teams;
  const band = Object.fromEntries(team.production.bands.map((b) => [b.label, b]));
  assert.equal(team.production.totalPoints, 70);
  assert.equal(band['<25'].points, 10);
  assert.equal(band['25-28'].points, 10);
  assert.equal(band['29+'].points, 40);
  assert.equal(band.unknown.points, 10);
  assert.equal(band['29+'].share, 0.57);
});

test('a team with no data reports nulls rather than zeros', () => {
  const team = buildRosterWindow({ teams, players, weeks }).teams[1];
  assert.equal(team.starters.meanAge, null);
  assert.equal(team.starters.pointsWeightedMeanAge, null);
  assert.equal(team.production.bands[0].share, null);
});

test('custom band edges are honoured', () => {
  const result = buildRosterWindow({ teams, players, weeks, ageBandEdges: [30] });
  assert.deepEqual(result.bands, ['<30', '30+']);
  assert.equal(result.teams[0].production.bands.find((b) => b.label === '30+').points, 30);
});

test('readRosterWindow is null in a redraft league and reads stored weeks in a dynasty one', () => {
  const store = {
    loadRawThrough: () => [
      { week: 1, matchups: [{ roster_id: 1, starters: ['qb'], players: ['qb'], players_points: { qb: 12 } }] },
    ],
  };
  const base = { store, teams, players, throughWeek: 1 };
  assert.equal(readRosterWindow({ ...base, league: { season: '2026', format: { type: 'redraft' } } }), null);
  const result = readRosterWindow({ ...base, league: { season: '2026', format: { type: 'dynasty' } } });
  assert.equal(result.teams[0].production.totalPoints, 12);
  assert.deepEqual(result.weeksCovered, [1]);
});
