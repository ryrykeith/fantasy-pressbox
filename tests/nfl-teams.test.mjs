import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NFL_TEAM_CODES, canonicalTeamCode, ESPN_TO_CANONICAL, STALE_CODES } from '../src/nflTeams.mjs';
import { buildTable, render } from '../scripts/fetch-bye-weeks.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TABLE_PATH = join(ROOT, 'config', 'bye-weeks.2026.yml');

test('WSH resolves to WAS and OAK to LV', () => {
  assert.equal(canonicalTeamCode('WSH'), 'WAS');
  assert.equal(canonicalTeamCode('OAK'), 'LV');
  assert.equal(canonicalTeamCode('WAS'), 'WAS');
});

test('an unknown code is refused, never passed through', () => {
  for (const bad of ['XXX', 'wsh', '', undefined, null, 42, '__proto__', 'constructor']) {
    assert.throws(() => canonicalTeamCode(bad), /Unknown NFL team code/);
  }
});

test('canonical codes are exactly the committed bye-week table, and aliases resolve into it', () => {
  const parsed = parseYaml(readFileSync(TABLE_PATH, 'utf8'));
  assert.deepEqual([...NFL_TEAM_CODES].sort(), Object.keys(parsed.bye_weeks).sort());
  assert.deepEqual({ ...STALE_CODES }, parsed.aliases);
  for (const target of Object.values(ESPN_TO_CANONICAL)) assert.ok(NFL_TEAM_CODES.includes(target));
});

test('fetch-bye-weeks output is unchanged, with the network stubbed by a fixture schedule', async () => {
  const committed = readFileSync(TABLE_PATH, 'utf8');
  const byes = parseYaml(committed).bye_weeks;
  const espnSpelling = (code) => Object.entries(ESPN_TO_CANONICAL).find(([, c]) => c === code)?.[0] ?? code;

  // A schedule built from the committed table: each week, every team without a
  // bye plays, paired up arbitrarily. Only the team codes matter here.
  const requested = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const week = Number(new URL(url).searchParams.get('week'));
    const playing = Object.keys(byes).filter((t) => byes[t] !== week).map(espnSpelling);
    const events = [];
    for (let i = 0; i < playing.length; i += 2) {
      events.push({
        competitions: [{ competitors: [{ team: { abbreviation: playing[i] } }, { team: { abbreviation: playing[i + 1] } }] }],
      });
    }
    return { ok: true, status: 200, json: async () => ({ events }) };
  };
  try {
    const rendered = render(2026, await buildTable(2026));
    assert.equal(rendered, committed);
    assert.equal(requested.length, 18);
    assert.ok(requested.every((u) => u.startsWith('https://site.api.espn.com/')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the generator refuses an abbreviation the table does not know', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ events: [{ competitions: [{ competitors: [{ team: { abbreviation: 'ZZZ' } }] }] }] }),
  });
  try {
    await assert.rejects(() => buildTable(2026), /Unknown NFL team code "ZZZ"/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
