import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';
import { NFL_TEAM_CODES } from '../src/nflTeams.mjs';
import {
  EspnCodeError,
  LINEUP_SLOT_IDS,
  PRO_TEAM_IDS,
  SCORING_STAT_IDS,
  lineupSlot,
  lineupSlotEntry,
  positionFromEligibleSlots,
  proTeamCode,
  scoringStat,
} from '../src/espn/codes.mjs';

// The module is a transcription of docs/espn-data.md. These tests read the
// doc's own tables and compare every row, so a drift in either one fails.

const DOC = readFileSync(join(PACKAGE_ROOT, 'docs', 'espn-data.md'), 'utf8');

function docTable(heading) {
  const start = DOC.indexOf(`### ${heading}`);
  assert.notEqual(start, -1, `doc heading "${heading}" not found`);
  const rows = [];
  let inTable = false;
  for (const line of DOC.slice(start).split('\n').slice(1)) {
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (/^-?\d+$/.test(cells[0])) rows.push(cells);
    } else if (inTable) break;
  }
  return rows;
}
const unticked = (cell) => cell.replace(/^`|`$/g, '');

test('lineup slots match the doc, row for row', () => {
  const rows = docTable('Lineup slot IDs');
  assert.deepEqual(LINEUP_SLOT_IDS, rows.map((row) => Number(row[0])));
  for (const row of rows) {
    const id = Number(row[0]);
    const entry = lineupSlotEntry(id);
    assert.equal(entry.name, unticked(row[1]), `slot ${id} name`);
    if (/not mapped: refused/.test(row[3])) {
      assert.equal(entry.slot, null, `slot ${id} should be refused`);
      assert.throws(() => lineupSlot(id), EspnCodeError);
    } else {
      assert.equal(lineupSlot(id), unticked(row[3]), `slot ${id} shared slot`);
    }
  }
});

test('pro teams match the doc, row for row', () => {
  const rows = docTable('Pro team IDs').filter((row) => Number(row[0]) >= 0);
  assert.deepEqual(PRO_TEAM_IDS, rows.map((row) => Number(row[0])));
  for (const row of rows) {
    const id = Number(row[0]);
    if (id === 0) {
      assert.match(row[3], /free agent/);
      assert.equal(proTeamCode(0), null);
      continue;
    }
    assert.equal(proTeamCode(id), unticked(row[3].replace(/ \(alias\)$/, '')), `pro team ${id}`);
  }
});

test('pro team codes resolve through src/nflTeams.mjs: all canonical, Washington aliased', () => {
  for (const id of PRO_TEAM_IDS.filter((id) => id !== 0)) {
    assert.ok(NFL_TEAM_CODES.includes(proTeamCode(id)), `pro team ${id}`);
  }
  assert.equal(proTeamCode(28), 'WAS');
  // Every canonical code is reachable by exactly one ID.
  const reached = PRO_TEAM_IDS.filter((id) => id !== 0).map(proTeamCode);
  assert.deepEqual([...reached].sort(), [...NFL_TEAM_CODES].sort());
});

test('scoring stats match the doc, row for row', () => {
  const rows = docTable('Scoring stat IDs');
  assert.equal(rows.length, 235);
  assert.deepEqual(SCORING_STAT_IDS, rows.map((row) => Number(row[0])));
  for (const row of rows) {
    const stat = scoringStat(Number(row[0]));
    assert.equal(stat.abbr, unticked(row[1]), `stat ${row[0]} abbreviation`);
    assert.equal(stat.label, row[2], `stat ${row[0]} label`);
  }
});

test('only the four stats the doc names carry a scoring-profile field', () => {
  const withField = SCORING_STAT_IDS.filter((id) => scoringStat(id).field !== null);
  assert.deepEqual(withField, [3, 4, 20, 53]);
  assert.equal(scoringStat(53).field, 'reception.base');
  assert.equal(scoringStat(4).field, 'passing.touchdown');
  assert.equal(scoringStat(3).field, 'passing.pointsPerYard');
  assert.equal(scoringStat(20).field, 'passing.interception');
});

test('an unknown ID is refused by every table, naming the table and the ID', () => {
  assert.throws(() => lineupSlotEntry(99), /lineup slot ID 99/);
  assert.throws(() => lineupSlot(99), /lineup slot ID 99/);
  assert.throws(() => proTeamCode(31), /pro team ID 31/);
  assert.throws(() => proTeamCode(-1), /pro team ID -1/);
  assert.throws(() => scoringStat(235), /scoring stat ID 235/);
  assert.throws(() => scoringStat('3'), /scoring stat ID "3"/);
  assert.throws(() => lineupSlot(undefined), EspnCodeError);
});

test('a slot the doc refuses throws, naming the slot', () => {
  assert.throws(() => lineupSlot(8), /lineup slot 8 \("DT"\)/);
  assert.throws(() => lineupSlot(25), /lineup slot 25 \("Rookie"\)/);
  assert.throws(() => lineupSlot(22), /lineup slot 22/);
});

test('position comes from eligibleSlots: first slot that is not combined and not 25', () => {
  assert.equal(positionFromEligibleSlots([2, 3, 23, 20, 21]), 'RB');
  assert.equal(positionFromEligibleSlots([3, 23, 4, 20]), 'WR'); // combined slots skipped
  assert.equal(positionFromEligibleSlots([23, 5, 6, 20, 21]), 'TE');
  assert.equal(positionFromEligibleSlots([0, 7, 20, 21]), 'QB');
  assert.equal(positionFromEligibleSlots([25, 2, 20]), 'RB'); // Rookie skipped
  assert.equal(positionFromEligibleSlots([17, 20, 21]), 'K');
  assert.equal(positionFromEligibleSlots([10, 20, 21]), 'LB');
});

test('a team defense (a "/" in the name) takes its first slot: D/ST becomes DEF', () => {
  assert.equal(positionFromEligibleSlots([16, 20, 21], 'Taco Tuesday D/ST'), 'DEF');
});

test('a position is a slot name, not a starting slot: DT, DE, CB, S, P, HC do not throw', () => {
  const cases = [[8, 'DT'], [9, 'DE'], [12, 'CB'], [13, 'S'], [18, 'P'], [19, 'HC']];
  for (const [id, name] of cases) {
    assert.equal(positionFromEligibleSlots([id, 20, 21], 'Pat Invented'), name);
  }
});

test('position: refusals', () => {
  assert.throws(() => positionFromEligibleSlots([3, 99], 'Pat Invented'), /lineup slot ID 99/);
  assert.throws(() => positionFromEligibleSlots([], 'Pat Invented'), EspnCodeError);
  assert.throws(() => positionFromEligibleSlots([3, 25], 'Pat Invented'), EspnCodeError);
  assert.throws(() => positionFromEligibleSlots(undefined, 'Pat Invented'), EspnCodeError);
  assert.throws(() => positionFromEligibleSlots('2', 'Pat Invented'), EspnCodeError);
});

test('position: bench, IR or slot 22 as the chosen slot throws, naming the player', () => {
  assert.throws(() => positionFromEligibleSlots([20, 21], 'Pat Invented'), /Pat Invented/);
  assert.throws(() => positionFromEligibleSlots([21], 'Pat Invented'), EspnCodeError);
  assert.throws(() => positionFromEligibleSlots([22, 20], 'Pat Invented'), /Pat Invented/);
  // A "/" in the name takes the first slot whatever it is, so it cannot rescue a bench slot.
  assert.throws(() => positionFromEligibleSlots([20, 21], 'Taco Tuesday D/ST'), EspnCodeError);
});

test('there is no defaultPositionId table', () => {
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'espn', 'codes.mjs'), 'utf8');
  assert.doesNotMatch(source, /export (const|function) \w*(defaultPosition|POSITION_IDS?)\b/i);
});
