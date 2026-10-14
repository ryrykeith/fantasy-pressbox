import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';

// One contract, two back ends: the same calls must give the same answers
// whether the history is on disk or in memory.
const BACKENDS = {
  file: () => createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-store-contract-')) }),
  memory: () => createMemoryStore(),
};

const SEASON = '2026';
const ranking = (week) => ({ week, rankings: [{ rank: 1, team: 'Invented Team', rosterId: 1 }] });

for (const [name, make] of Object.entries(BACKENDS)) {
  test(`${name} store: raw bundles round-trip and load through a week, oldest first`, () => {
    const store = make();
    assert.equal(store.loadRaw(SEASON, 1), null);
    assert.deepEqual(store.loadRawThrough(SEASON, 9), []);
    store.saveRaw(SEASON, 3, { week: 3 });
    store.saveRaw(SEASON, 1, { week: 1 });
    store.saveRaw(SEASON, 12, { week: 12 });
    assert.deepEqual(store.loadRaw(SEASON, 3), { week: 3 });
    assert.deepEqual(store.loadRawThrough(SEASON, 3), [{ week: 1 }, { week: 3 }]);
    assert.deepEqual(store.loadRawThrough(SEASON, 99).map((b) => b.week), [1, 3, 12]);
    assert.notEqual(store.rawPath(SEASON, 3), store.snapshotPath(SEASON, 3));
  });

  test(`${name} store: snapshots stamp savedAt and feed the team name history`, () => {
    const store = make();
    store.saveSnapshot(SEASON, 1, { week: 1, teams: [{ rosterId: 1, name: 'Old Name' }] });
    store.saveSnapshot(SEASON, 2, { week: 2, teams: [{ rosterId: 1, name: 'New Name' }] });
    assert.match(store.loadSnapshot(SEASON, 1).savedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(store.loadSnapshotsThrough(SEASON, 1).map((s) => s.week), [1]);
    assert.deepEqual(store.loadTeamNameHistory(SEASON), [
      { week: 1, rosterId: 1, name: 'Old Name' },
      { week: 2, rosterId: 1, name: 'New Name' },
    ]);
    assert.equal(store.loadSnapshot(SEASON, 7), null);
  });

  test(`${name} store: previous rankings are the latest earlier week, else the preseason edition`, () => {
    const store = make();
    assert.equal(store.loadPreviousRankings(SEASON, 5), null);
    store.saveRankings(SEASON, 'preseason', ranking(0));
    assert.equal(store.loadPreviousRankings(SEASON, 2).week, 0);
    store.saveRankings(SEASON, 'week-2', ranking(2));
    store.saveRankings(SEASON, 'week-4', ranking(4));
    assert.equal(store.loadPreviousRankings(SEASON, 4).week, 2);
    assert.equal(store.loadPreviousRankings(SEASON, 5).week, 4);
    assert.deepEqual(store.loadRankings(SEASON, 'week-2'), ranking(2));
  });

  test(`${name} store: predictions, market values and the imported league round-trip`, () => {
    const store = make();
    store.savePredictions(SEASON, 2, [{ team_a: 'A', team_b: 'B' }]);
    const saved = store.loadPredictions(SEASON, 2);
    assert.equal(saved.week, 2);
    assert.equal(saved.season, SEASON);
    assert.deepEqual(saved.predictions, [{ team_a: 'A', team_b: 'B' }]);
    assert.equal(store.loadPredictions(SEASON, 3), null);

    assert.equal(store.loadMarketValues(SEASON, 2), null);
    store.saveMarketValues(SEASON, 2, { idSpace: 'sleeper', values: { 1: 10 } });
    assert.deepEqual(store.loadMarketValues(SEASON, 2), { idSpace: 'sleeper', values: { 1: 10 } });

    assert.equal(store.loadImportedLeague(SEASON), null);
    store.saveImportedLeague(SEASON, { provider: 'espn', leagueId: '000000000000000000', body: { id: 1 } });
    assert.equal(store.loadImportedLeague(SEASON).body.id, 1);
    assert.equal(typeof store.importedLeaguePath(SEASON), 'string');
  });

  test(`${name} store: the previous tank watch is the latest strictly before the week`, () => {
    const store = make();
    assert.equal(store.loadPreviousTankWatch(SEASON, 9), null);
    store.saveTankWatch(SEASON, 3, [{ pick: 1 }]);
    store.saveTankWatch(SEASON, 6, [{ pick: 2 }]);
    assert.equal(store.loadPreviousTankWatch(SEASON, 6).week, 3);
    assert.equal(store.loadPreviousTankWatch(SEASON, 7).week, 6);
    assert.equal(store.loadPreviousTankWatch(SEASON, 3), null);
  });

  test(`${name} store: what it hands out cannot alter what it holds`, () => {
    const store = make();
    const value = { week: 1, nested: { n: 1 } };
    store.saveRaw(SEASON, 1, value);
    value.nested.n = 99;
    store.loadRaw(SEASON, 1).nested.n = 50;
    assert.equal(store.loadRaw(SEASON, 1).nested.n, 1);
  });
}

test('the file store writes data/<kind>/<season>/<file>.json, pretty-printed with a trailing newline', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'pressbox-store-layout-'));
  const store = createStore({ dataDir });
  const path = store.saveRaw(SEASON, 4, { week: 4 });
  assert.equal(path, join(dataDir, 'raw', SEASON, 'week-4.json'));
  assert.equal(readFileSync(path, 'utf8'), '{\n  "week": 4\n}\n');
  assert.equal(store.dataDir, dataDir);
  assert.equal(existsSync(join(dataDir, 'snapshots')), false);
});

test('pipeline.mjs, the store core and the grading helpers import nothing from node:, and the pipeline never makes a store', () => {
  for (const file of ['pipeline.mjs', 'storeCore.mjs', 'rankingGrades.mjs']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]node:/, `${file} imports from node:`);
    assert.doesNotMatch(source, /import\(\s*['"]node:/, `${file} dynamically imports node:`);
  }
  const pipeline = readFileSync(new URL('../src/pipeline.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(pipeline, /createStore|createMemoryStore/, 'the pipeline takes a store, it never makes one');
});

test('the memory store holds plain objects keyed by kind, season and file, and serializes to JSON as is', () => {
  const store = createMemoryStore();
  store.saveRaw(SEASON, 1, { week: 1, at: new Date(0), map: new Map([[1, 2]]) });
  store.saveRankings(SEASON, 'preseason', ranking(0));
  assert.deepEqual(Object.keys(store.data), ['raw', 'rankings']);
  assert.deepEqual(Object.keys(store.data.raw[SEASON]), ['week-1.json']);
  // A Date becomes its ISO string; a Map does not survive as a Map.
  assert.equal(store.data.raw[SEASON]['week-1.json'].at, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(JSON.parse(JSON.stringify(store.data)), store.data);

  // The same data can seed another store.
  const seeded = createMemoryStore(store.data);
  assert.deepEqual(seeded.loadRankings(SEASON, 'preseason'), ranking(0));
});
