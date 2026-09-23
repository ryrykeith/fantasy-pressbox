/**
 * Guards the committed bye-week tables.
 *
 * These files are generated once a season and then trusted by every edition
 * that reports bye exposure. The failure mode that matters is not a crash —
 * it is a table that looks fine and is quietly incomplete, because a team
 * with no bye reads as good news rather than as a bug.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../src/lib/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = join(ROOT, 'config');

const tables = readdirSync(CONFIG).filter((file) => /^bye-weeks\.\d{4}\.yml$/.test(file));

test('at least one bye-week table is committed', () => {
  assert.ok(tables.length > 0, 'no config/bye-weeks.<season>.yml found');
});

for (const file of tables) {
  const season = Number.parseInt(/(\d{4})/.exec(file)[1], 10);
  const parsed = parseYaml(readFileSync(join(CONFIG, file), 'utf8'));

  test(`${file} declares the season its filename claims`, () => {
    assert.equal(parsed.season, season);
  });

  test(`${file} covers all 32 teams exactly once`, () => {
    const teams = Object.keys(parsed.bye_weeks ?? {});
    assert.equal(teams.length, 32, `expected 32 teams, got ${teams.length}`);
    assert.equal(new Set(teams).size, 32, 'duplicate team codes');
  });

  test(`${file} gives every team one regular-season bye week`, () => {
    for (const [team, week] of Object.entries(parsed.bye_weeks ?? {})) {
      assert.ok(Number.isInteger(week), `${team}: bye week ${week} is not an integer`);
      assert.ok(week >= 1 && week <= 18, `${team}: bye week ${week} outside weeks 1-18`);
    }
  });

  // Sleeper says WAS where ESPN says WSH. If the generator's mapping ever
  // regresses, the table still has 32 entries and still passes every check
  // above — it just silently describes a team this project never asks about.
  test(`${file} uses Sleeper team codes, not ESPN's`, () => {
    const teams = Object.keys(parsed.bye_weeks ?? {});
    assert.ok(teams.includes('WAS'), 'missing WAS — did the WSH mapping regress?');
    assert.ok(!teams.includes('WSH'), 'contains ESPN code WSH');
  });

  test(`${file} resolves stale codes to teams it actually lists`, () => {
    for (const [stale, current] of Object.entries(parsed.aliases ?? {})) {
      assert.ok(
        Object.hasOwn(parsed.bye_weeks ?? {}, current),
        `alias ${stale} -> ${current}, but ${current} has no bye week`,
      );
      assert.ok(!Object.hasOwn(parsed.bye_weeks ?? {}, stale), `${stale} is both an alias and a team`);
    }
  });
}
