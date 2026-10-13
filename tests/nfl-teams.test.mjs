import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NFL_TEAM_CODES,
  canonicalTeamCode,
  nflverseTeamCode,
  ESPN_TO_CANONICAL,
  NFLVERSE_TO_CANONICAL,
  STALE_CODES,
} from '../src/nflTeams.mjs';
import { buildTable, render, weeksPlayedFromCsv, loadGamesCsv } from '../scripts/fetch-bye-weeks.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TABLE_PATH = join(ROOT, 'config', 'bye-weeks.2026.yml');
const SLICE_PATH = join(ROOT, 'tests', 'fixtures', 'nflverse-games-slice.csv');

test('WSH resolves to WAS and OAK to LV', () => {
  assert.equal(canonicalTeamCode('WSH'), 'WAS');
  assert.equal(canonicalTeamCode('OAK'), 'LV');
  assert.equal(canonicalTeamCode('WAS'), 'WAS');
});

test('an unknown code is refused, never passed through', () => {
  for (const bad of ['XXX', 'wsh', '', undefined, null, 42, '__proto__', 'constructor']) {
    assert.throws(() => canonicalTeamCode(bad), /Unknown NFL team code/);
    assert.throws(() => nflverseTeamCode(bad), /Unknown NFL team code/);
  }
});

test('nflverse LA resolves to LAR, and only through the nflverse resolver', () => {
  assert.equal(nflverseTeamCode('LA'), 'LAR');
  assert.equal(nflverseTeamCode('LAR'), 'LAR');
  assert.equal(nflverseTeamCode('WAS'), 'WAS');
  // ESPN and stale spellings are not nflverse's; the resolver does not take them.
  assert.throws(() => nflverseTeamCode('WSH'), /Unknown NFL team code/);
  assert.throws(() => nflverseTeamCode('OAK'), /Unknown NFL team code/);
  // ESPN's own alias is untouched: its fantasy API still spells Washington WSH.
  assert.equal(canonicalTeamCode('WSH'), 'WAS');
});

test('canonical codes are exactly the committed bye-week table, and aliases resolve into it', () => {
  const parsed = parseYaml(readFileSync(TABLE_PATH, 'utf8'));
  assert.deepEqual([...NFL_TEAM_CODES].sort(), Object.keys(parsed.bye_weeks).sort());
  assert.deepEqual({ ...STALE_CODES }, parsed.aliases);
  for (const target of Object.values(ESPN_TO_CANONICAL)) assert.ok(NFL_TEAM_CODES.includes(target));
  for (const target of Object.values(NFLVERSE_TO_CANONICAL)) assert.ok(NFL_TEAM_CODES.includes(target));
});

// A full-season games.csv built from the committed table: each week, every
// team without a bye plays, paired up arbitrarily, with the Rams spelled the
// nflverse way. Only the team codes and weeks matter here.
function scheduleCsv(byes, { season = 2026, mutate } = {}) {
  const lines = ['game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score'];
  const nflverse = (code) => Object.entries(NFLVERSE_TO_CANONICAL).find(([, c]) => c === code)?.[0] ?? code;
  for (let week = 1; week <= 18; week++) {
    const playing = Object.keys(byes).filter((t) => byes[t] !== week).map(nflverse);
    for (let i = 0; i < playing.length; i += 2) {
      lines.push(`${season}_${week}_${i},${season},REG,${week},,,,${playing[i]},,${playing[i + 1]},`);
    }
  }
  return (mutate ? mutate(lines) : lines).join('\n') + '\n';
}

test('the generator rebuilds the committed byes from a fixture schedule, with no network', async () => {
  const committed = readFileSync(TABLE_PATH, 'utf8');
  const byes = parseYaml(committed).bye_weeks;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('the test must not touch the network');
  };
  try {
    const rendered = render(2026, buildTable(2026, scheduleCsv(byes)));
    assert.deepEqual(parseYaml(rendered).bye_weeks, byes);
    assert.deepEqual(parseYaml(rendered).aliases, parseYaml(committed).aliases);
    assert.equal(parseYaml(rendered).season, 2026);
    // Post-season games and other seasons change nothing.
    const withExtras = scheduleCsv(byes, {
      mutate: (lines) => [...lines, '2026_19_a,2026,WC,19,,,,KC,,BUF,', '2025_1_a,2025,REG,1,,,,KC,,BUF,'],
    });
    assert.equal(render(2026, buildTable(2026, withExtras)), rendered);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the rendered header credits nflverse with the licence link and a note of changes', () => {
  const byes = parseYaml(readFileSync(TABLE_PATH, 'utf8')).bye_weeks;
  const header = render(2026, buildTable(2026, scheduleCsv(byes))).split('\nseason:')[0];
  assert.match(header, /Source: nflverse schedule data \(games\.csv, nflverse-data 'schedules'\s+#\s+release\), CC BY 4\.0, https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
  assert.match(header, /Changes: reduced to each team's bye week, team codes mapped to this\s+#\s+project's \(LA to LAR\)\./);
  assert.ok(!/ESPN/.test(header));
});

test('the fixture slice: LA reads as LAR, and non-REG and other-season games are ignored', async () => {
  const weeks = weeksPlayedFromCsv(2026, await loadGamesCsv(SLICE_PATH));
  assert.deepEqual([...weeks.keys()].sort(), ['ARI', 'LAR', 'SEA']);
  assert.deepEqual([...weeks.get('LAR')].sort(), [1, 2]);
  assert.deepEqual([...weeks.get('SEA')], [1]);
  assert.deepEqual([...weeks.get('ARI')], [2]);
  // KC and DEN appear only in a postseason row and a 2025 row.
  assert.ok(!weeks.has('KC') && !weeks.has('DEN'));
});

test('a team with two missing weeks is refused', () => {
  const byes = parseYaml(readFileSync(TABLE_PATH, 'utf8')).bye_weeks;
  // Drop every game in which BUF plays in week 1 and week 2 (BUF's bye is elsewhere).
  const csv = scheduleCsv(byes, {
    mutate: (lines) => lines.filter((l, i) => i === 0 || !/,REG,[12],/.test(l) || !/(,BUF,|,BUF$)/.test(l)),
  });
  assert.throws(() => buildTable(2026, csv), /BUF has 3 bye weeks/);
});

test('a table without exactly 32 teams is refused', () => {
  const byes = parseYaml(readFileSync(TABLE_PATH, 'utf8')).bye_weeks;
  const csv = scheduleCsv(byes, { mutate: (lines) => lines.filter((l) => !/,(NE|NYJ)(,|$)/.test(l)) });
  assert.throws(() => buildTable(2026, csv), /did not produce one bye per team/);
  assert.throws(() => buildTable(2026, readFileSync(SLICE_PATH, 'utf8')), /found 3 teams, expected 32/);
});

test('the generator refuses an abbreviation the table does not know, and a season with no games', () => {
  const header = 'season,game_type,week,away_team,home_team\n';
  assert.throws(() => buildTable(2026, `${header}2026,REG,1,ZZZ,KC\n`), /Unknown NFL team code "ZZZ"/);
  assert.throws(() => buildTable(2031, readFileSync(SLICE_PATH, 'utf8')), /no regular-season games for 2031/);
  assert.throws(() => buildTable(2026, 'season,week\n2026,1\n'), /no "game_type" column/);
});
