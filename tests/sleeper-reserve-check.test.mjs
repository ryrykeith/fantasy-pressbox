import test from 'node:test';
import assert from 'node:assert/strict';

import { checkSleeperReserve, formatReport } from '../scripts/sleeperReserveCheck.mjs';

// Invented league: two rosters, slots QB + RB + FLEX, scored through week 2.
const league = { season: '2026', format: { type: 'dynasty' }, startingSlots: ['QB', 'RB', 'FLEX'], lastScoredWeek: 2 };
const players = {
  p1: { name: 'Zorblax Quillfeather', position: 'QB' },
  p2: { name: 'Mintoo Vance', position: 'RB' },
  p3: { name: 'Orla Thistlewood', position: 'WR' },
  p4: { name: 'Bram Okonkwo-Reyes', position: 'RB' }, // reserve on roster 1
  p5: { name: 'Ivy Prendergast', position: 'WR' },
  p6: { name: 'Dax Holloway', position: 'RB' },
  p7: { name: 'Quin Aldermere', position: 'RB' }, // taxi on roster 2
  p8: { name: 'Sable Winterbourne', position: 'QB' },
};
const teams = [
  { rosterId: 1, name: 'Fictional Foxes', manager: 'Mgr Alpha', reserveIds: ['p4'], taxiIds: [], seasonPotentialPoints: 0 },
  { rosterId: 2, name: 'Imaginary Owls', manager: 'Mgr Beta', reserveIds: [], taxiIds: ['p7'], seasonPotentialPoints: 0 },
];
const roster = (rosterId, ids, pts) => ({
  rosterId,
  playerIds: ids,
  starterIds: ids.slice(0, 3),
  starterPoints: ids.slice(0, 3).map((id) => pts[id]),
  playerPoints: pts,
  points: ids.slice(0, 3).reduce((s, id) => s + pts[id], 0),
  pairingKey: 1,
});
const weeks = [
  {
    week: 1,
    rosters: [
      roster(1, ['p1', 'p2', 'p3', 'p4'], { p1: 20, p2: 10, p3: 8, p4: 31.5 }),
      roster(2, ['p8', 'p6', 'p5', 'p7'], { p8: 15, p6: 12, p5: 9, p7: 25.25 }),
    ],
  },
  {
    week: 2,
    rosters: [
      roster(1, ['p1', 'p2', 'p3', 'p4'], { p1: 18, p2: 11, p3: 7, p4: 40.75 }),
      roster(2, ['p8', 'p6', 'p5', 'p7'], { p8: 14, p6: 13, p5: 6, p7: 3 }),
    ],
  },
];
// Optimal lineups (QB, RB, FLEX over RB/WR/TE):
//   roster 1 as today:   wk1 20+31.5+10 = 61.5,  wk2 18+40.75+11 = 69.75 -> 131.25
//   roster 1 w/o reserve: wk1 20+10+8   = 38,    wk2 18+11+7     = 36    -> 74
//   roster 2 as today:   wk1 15+25.25+12 = 52.25, wk2 14+13+6    = 33    -> 85.25
//   roster 2 w/o taxi:   wk1 15+12+9    = 36,    wk2 14+13+6     = 33    -> 69
const withPpts = (a, b) => teams.map((t, i) => ({ ...t, seasonPotentialPoints: [a, b][i] }));

test('counts reserve and taxi entries in the latest saved matchup', () => {
  const { question1 } = checkSleeperReserve({ league, teams, players, weeks });
  assert.deepEqual(question1, {
    rostersChecked: 2,
    rostersWithReserveToday: 1,
    rostersWithTaxiToday: 1,
    reserveInMatchup: 1,
    taxiInMatchup: 1,
  });
});

test('a matchup list that already leaves them out reads as 0 and 0', () => {
  const trimmed = weeks.map((w) => ({
    ...w,
    rosters: w.rosters.map((r) => ({ ...r, playerIds: r.playerIds.filter((id) => id !== 'p4' && id !== 'p7') })),
  }));
  const result = checkSleeperReserve({ league, teams, players, weeks: trimmed });
  assert.equal(result.question1.reserveInMatchup + result.question1.taxiInMatchup, 0);
  assert.match(formatReport(result).join('\n'), /already leaves them out/);
});

test('ppts matches the as-today sum when the solver counts everyone', () => {
  const { question2 } = checkSleeperReserve({ league, teams: withPpts(131.25, 85.25), players, weeks });
  assert.equal(question2.comparable, true);
  assert.equal(question2.weeksSummed, 2);
  assert.equal(question2.matchAsToday, 2);
  assert.equal(question2.matchLeavingOut, 0);
});

test('ppts matches the leave-out sum when reserve and taxi cannot start', () => {
  const { question2 } = checkSleeperReserve({ league, teams: withPpts(74, 69), players, weeks });
  assert.equal(question2.matchAsToday, 0);
  assert.equal(question2.matchLeavingOut, 2);
});

test('refuses to compare when saved weeks do not cover the scored season', () => {
  const result = checkSleeperReserve({ league, teams: withPpts(74, 69), players, weeks: weeks.slice(1) });
  assert.equal(result.question2.comparable, false);
  assert.match(result.question2.refusal, /1 of the 2 scored weeks are not saved/);
  assert.equal(result.question2.matchAsToday, undefined);
  assert.match(formatReport(result).join('\n'), /Not compared/);
});

test('the report holds no name, id or point value from the data', () => {
  const secrets = [
    ...Object.values(players).map((p) => p.name),
    ...teams.flatMap((t) => [t.name, t.manager]),
    ...Object.keys(players),
    '131.25', '85.25', '74', '69', '31.5', '40.75', '25.25', '61.5', '69.75',
  ];
  for (const input of [withPpts(74, 69), withPpts(131.25, 85.25)]) {
    for (const used of [weeks, weeks.slice(1)]) {
      const text = formatReport(checkSleeperReserve({ league, teams: input, players, weeks: used })).join('\n');
      for (const secret of secrets) {
        const token = new RegExp(`(^|[^\\w.])${secret.replace('.', '\\.')}($|[^\\w.])`);
        assert.ok(!token.test(text), `report leaks ${secret}`);
      }
    }
  }
});
