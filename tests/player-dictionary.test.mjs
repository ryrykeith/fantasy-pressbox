/**
 * The player dictionary (src/league/players.mjs): Sleeper's /players/nfl file
 * is normalized once, in openLeague, and nothing past src/sleeper/ reads a
 * Sleeper field name on a player again.
 *
 * The pinned context below was produced from the raw dictionary before the
 * change and is reproduced from the normalized one after it, byte for byte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeWeek } from '../src/analysis/week.mjs';
import { playerFor, unknownPlayer } from '../src/league/players.mjs';
import { buildContext, describePlayer } from '../src/promptContext.mjs';
import { normalizePlayer, normalizePlayers, normalizeTransactions, normalizeWeekRosters } from '../src/sleeper/normalize.mjs';
import { MISSING_ID, RAW_PLAYERS, rankingsContext } from './fixtures/player-dictionary-league.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLAYERS = normalizePlayers(RAW_PLAYERS);

test('each Sleeper player becomes the record normalizePlayer has always returned, every field present', () => {
  assert.deepEqual(Object.keys(PLAYERS), Object.keys(RAW_PLAYERS));
  for (const [id, raw] of Object.entries(RAW_PLAYERS)) {
    assert.deepEqual(PLAYERS[id], normalizePlayer(id, raw));
    assert.deepEqual(Object.keys(PLAYERS[id]), ['id', 'name', 'position', 'team', 'age', 'yearsExp', 'injuryStatus', 'status']);
  }
  assert.deepEqual(PLAYERS.rb1, {
    id: 'rb1',
    name: 'Rex Carter',
    position: 'RB',
    team: 'DAL',
    age: 24,
    yearsExp: 2,
    injuryStatus: 'Questionable',
    status: 'Active',
  });
  // Sleeper leaves fields out; for Sleeper they are present as null, as today.
  assert.equal(PLAYERS.wr1.injuryStatus, null);
  assert.equal(PLAYERS.te2.age, null);
});

test('an empty entry in the file is left out, so a lookup of it misses as it did before', () => {
  const players = normalizePlayers({ ...RAW_PLAYERS, gone: null });
  assert.equal('gone' in players, false);
  assert.equal(describePlayer('gone', players.gone), 'Unknown player gone');
});

test('a missing player stays "Unknown player <id>"', () => {
  assert.deepEqual(playerFor(PLAYERS, MISSING_ID), {
    id: MISSING_ID,
    name: `Unknown player ${MISSING_ID}`,
    position: null,
    team: null,
  });
  assert.deepEqual(unknownPlayer(MISSING_ID), normalizePlayer(MISSING_ID, undefined));
  assert.equal(playerFor(PLAYERS, 'qb1'), PLAYERS.qb1);
  assert.equal(describePlayer(MISSING_ID, PLAYERS[MISSING_ID]), `Unknown player ${MISSING_ID}`);
});

test('describePlayer reads a normalized player and writes the line it always has', () => {
  const line = (id) => describePlayer(id, PLAYERS[id]);
  assert.equal(line('qb1'), 'Quinn Arms (QB, BUF, age 27)');
  // A name from first and last, and the injury suffix.
  assert.equal(line('rb1'), 'Rex Carter (RB, DAL, age 24) [Questionable]');
  // No team, null or empty, is a free agent.
  assert.equal(line('wr1'), 'Wes Lane (WR, FA, age 26)');
  assert.equal(line('wr2'), 'Wade Pike (WR, FA, age 25)');
  // An age of 0 or none is left out.
  assert.equal(line('te1'), 'Tad Bloom (TE, MIA)');
  assert.equal(line('te2'), 'Bo Tanner (TE, SF) [Doubtful]');
  // No name at all falls back to the id.
  assert.equal(line('rb2'), 'rb2 (RB, GB, age 23)');
});

test('the rankings context is unchanged by the player dictionary', () => {
  const context = rankingsContext(
    { analyzeWeek, normalizeTransactions, normalizeWeekRosters, buildContext, describePlayer },
    PLAYERS,
  );
  const pinned = JSON.parse(
    readFileSync(join(ROOT, 'tests/fixtures/player-dictionary-rankings-context.json'), 'utf8'),
  );
  const actual = { teams: context.teams, thisWeek: context.thisWeek, transactions: context.transactions };
  assert.equal(`${JSON.stringify(actual, null, 2)}\n`, `${JSON.stringify(pinned, null, 2)}\n`);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.mjs') ? [path] : [];
  });
}

test("no module outside src/sleeper/ reads Sleeper's player field names", () => {
  const offenders = sourceFiles(join(ROOT, 'src'))
    .map((path) => relative(ROOT, path))
    .filter((path) => !path.startsWith(join('src', 'sleeper')))
    .filter((path) => /\b(full_name|first_name|last_name|injury_status|years_exp)\b/.test(readFileSync(join(ROOT, path), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the analysis modules do not import normalizePlayer', () => {
  for (const name of ['week.mjs', 'faab.mjs', 'transactions.mjs']) {
    const source = readFileSync(join(ROOT, 'src/analysis', name), 'utf8');
    assert.doesNotMatch(source, /normalizePlayer\b/, `src/analysis/${name}`);
  }
});
