import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  describeProspectBoard,
  parseProspectBoard,
  prospectBoardAgeDays,
  prospectBoardUnavailable,
  prospectBoardView,
  PROSPECT_BOARD_STALE_DAYS,
} from '../src/prospectBoard.mjs';
import { loadProspectBoard, ROOT } from '../src/config.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';

/**
 * The declared prospect board.
 *
 * Every name below is invented. The board is the operator's to fill in and
 * source; nothing here (or in the shipped example) is a real ranking.
 */

function entry(rank, overrides = {}) {
  return {
    rank,
    name: `Test Prospect ${rank}`,
    position: 'WR',
    school: 'Example State',
    source: 'Example Dynasty Weekly',
    ...overrides,
  };
}

function board(overrides = {}) {
  return { draftYear: 2027, updated: '2026-10-01', entries: [entry(1), entry(2)], ...overrides };
}

const parse = (value, options = {}) => parseProspectBoard(value, { draftYear: 2027, source: 'board', ...options });

test('a valid board parses, ordered by rank', () => {
  const parsed = parse(board({ entries: [entry(2), entry(1, { note: 'Fast.' })] }));
  assert.equal(parsed.draftYear, 2027);
  assert.equal(parsed.updated, '2026-10-01');
  assert.deepEqual(parsed.entries.map((e) => e.rank), [1, 2]);
  assert.equal(parsed.entries[0].note, 'Fast.');
  assert.equal(parsed.entries[1].note, null);
});

test('an entry without a source is refused, naming the entry', () => {
  assert.throws(
    () => parse(board({ entries: [entry(1, { source: undefined })] })),
    /entry 1.*Test Prospect 1.*source/s,
  );
  assert.throws(() => parse(board({ entries: [entry(1, { source: '  ' })] })), /source/);
});

test('duplicate ranks are refused', () => {
  assert.throws(() => parse(board({ entries: [entry(1), entry(1, { name: 'Other' })] })), /rank 1.*more than once/s);
});

test('a missing or malformed updated date is refused', () => {
  assert.throws(() => parse(board({ updated: undefined })), /updated/);
  assert.throws(() => parse(board({ updated: 'last week' })), /updated.*YYYY-MM-DD/s);
  assert.throws(() => parse(board({ updated: '2026-13-45' })), /updated/);
});

test('draftYear must be present and match the file it was read from', () => {
  assert.throws(() => parse(board({ draftYear: undefined })), /draftYear/);
  assert.throws(() => parse(board({ draftYear: 2028 })), /draftYear.*2028.*2027/s);
});

test('rank, name, position and school are required; unknown keys are refused', () => {
  assert.throws(() => parse(board({ entries: [entry(0)] })), /rank/);
  assert.throws(() => parse(board({ entries: [entry(1.5)] })), /rank/);
  assert.throws(() => parse(board({ entries: [entry(1, { name: '' })] })), /name/);
  assert.throws(() => parse(board({ entries: [entry(1, { position: undefined })] })), /position/);
  assert.throws(() => parse(board({ entries: [entry(1, { school: undefined })] })), /school/);
  assert.throws(() => parse(board({ entries: [entry(1, { sorce: 'typo' })] })), /unrecognised sorce/);
  assert.throws(() => parse(board({ colour: 'blue' })), /unrecognised colour/);
});

test('an empty or non-list entries field is refused', () => {
  assert.throws(() => parse(board({ entries: [] })), /entries/);
  assert.throws(() => parse(board({ entries: undefined })), /entries/);
  assert.throws(() => parse(null), /board/);
});

test('age is counted in whole days, and a board dated in the future counts as brand new', () => {
  const parsed = parse(board());
  assert.equal(prospectBoardAgeDays(parsed, new Date('2026-10-11T12:00:00Z')), 10);
  assert.equal(prospectBoardAgeDays(parsed, new Date('2026-10-01T00:00:00Z')), 0);
  assert.equal(prospectBoardAgeDays(parsed, new Date('2026-09-01T00:00:00Z')), 0);
});

test('doctor says nothing is declared when there is no board', () => {
  const [line] = describeProspectBoard(null, { draftYear: 2027 });
  assert.match(line, /✗ not declared/);
  assert.match(line, /config\/prospects\.2027\.yml/);
});

test('doctor reports a fresh board by age and size, with no warning', () => {
  const lines = describeProspectBoard(parse(board()), { draftYear: 2027, now: new Date('2026-10-09T00:00:00Z') });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /2027/);
  assert.match(lines[0], /2 prospects/);
  assert.match(lines[0], /updated 2026-10-01 \(8 days ago\)/);
  assert.doesNotMatch(lines.join('\n'), /stale|⚠/);
});

test('doctor warns once a board is older than the stale threshold', () => {
  const now = new Date(Date.parse('2026-10-01T00:00:00Z') + (PROSPECT_BOARD_STALE_DAYS + 1) * 86_400_000);
  const lines = describeProspectBoard(parse(board()), { draftYear: 2027, now });
  assert.match(lines.join('\n'), /⚠.*stale/);
});

test('the prompt view carries every entry with its source, and the rule for everyone else', () => {
  const view = prospectBoardView(parse(board({ entries: [entry(1, { note: 'Fast.' }), entry(2)] })));
  assert.equal(view.draftYear, 2027);
  assert.equal(view.updated, '2026-10-01');
  assert.equal(view.prospects.length, 2);
  assert.deepEqual(view.prospects[0], {
    rank: 1,
    name: 'Test Prospect 1',
    position: 'WR',
    school: 'Example State',
    note: 'Fast.',
    source: 'Example Dynasty Weekly',
  });
  assert.match(view.rule, /only the prospects listed/i);
});

test('with no board the model is told no prospect may be discussed', () => {
  const entryNone = prospectBoardUnavailable(null, { draftYear: 2027 });
  assert.equal(entryNone.field, 'prospectBoard');
  assert.match(entryNone.why, /2027/);
  assert.match(entryNone.instruction, /do not name/i);
  assert.match(entryNone.instruction, /consensus/i);
});

test('with a board the model is told prospects off it are not discussed, and who is on it', () => {
  const entryOn = prospectBoardUnavailable(parse(board()), { draftYear: 2027 });
  assert.equal(entryOn.field, 'prospectsNotOnBoard');
  assert.match(entryOn.instruction, /not on the board/i);
  assert.match(entryOn.instruction, /sourced/i);
});

test('loadProspectBoard returns null when no file is declared for the year', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prospects-'));
  assert.equal(loadProspectBoard({ draftYear: 2027, configDir: dir }), null);
});

test('loadProspectBoard reads and validates the file for that year', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prospects-'));
  writeFileSync(
    join(dir, 'prospects.2027.yml'),
    [
      'draftYear: 2027',
      'updated: 2026-10-01',
      'entries:',
      '  - rank: 1',
      '    name: Test Prospect',
      '    position: WR',
      '    school: Example State',
      '    source: Example Dynasty Weekly, https://example.com/board',
    ].join('\n'),
  );
  const loaded = loadProspectBoard({ draftYear: 2027, configDir: dir });
  assert.equal(loaded.entries[0].source, 'Example Dynasty Weekly, https://example.com/board');
});

test('loadProspectBoard names the file when it is invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prospects-'));
  writeFileSync(join(dir, 'prospects.2027.yml'), 'draftYear: 2027\nupdated: 2026-10-01\nentries:\n  - rank: 1\n');
  assert.throws(() => loadProspectBoard({ draftYear: 2027, configDir: dir }), /prospects\.2027\.yml/);
});

test('the shipped example is a valid board, but is never loaded as a real one', () => {
  const path = join(ROOT, 'config', 'prospects.example.yml');
  const parsed = parseProspectBoard(parseYaml(readFileSync(path, 'utf8')), { draftYear: 2027, source: path });
  assert.ok(parsed.entries.length >= 2);
  assert.equal(loadProspectBoard({ draftYear: 2099 }), null);
});
