/**
 * Movement measured across weeks with no ranking recorded (src/rankingGap.mjs).
 *
 * store.loadPreviousRankings returns the newest ranking recorded before a
 * week, however old. An operator recorded rankings through week 4, skipped
 * week 5, and built week 6: the arrows measured two weeks, and nothing told
 * the model, the operator or doctor so. These cover a gap, no gap, and the
 * fallback to the preseason edition.
 *
 * Every league here is invented, and nothing touches the network: the
 * editions are built on the fake Sleeper API.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { loadConfig, loadDiskAssets, PACKAGE_ROOT } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { describeInspection, inspectLeague } from '../src/inspect.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { buildContext } from '../src/promptContext.mjs';
import { describeWeeks, rankedAfterWeek, rankingGap } from '../src/rankingGap.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';

const SEASON = '2026';
const weekRanking = (week) => ({ season: SEASON, label: `week-${week}`, week, rankings: [{ rank: 1, team: 'Punt Intended' }] });
const PRESEASON = { season: SEASON, label: 'preseason', week: null, rankings: [{ rank: 1, team: 'Punt Intended' }] };

/* ------------------------------------------------------------- the span */

test('a week 6 ranking measured from week 4 spans 2 weeks and skips week 5', () => {
  assert.deepEqual(rankingGap(weekRanking(4), 6), { from: 4, weeksSpanned: 2, skippedWeeks: [5] });
});

test('a week 6 ranking measured from week 5 spans 1 week and skips nothing', () => {
  assert.deepEqual(rankingGap(weekRanking(5), 6), { from: 5, weeksSpanned: 1, skippedWeeks: [] });
});

test('the preseason edition ranks the league after week 0, so a week 3 ranking from it skips weeks 1 and 2', () => {
  assert.equal(rankedAfterWeek(PRESEASON), 0);
  assert.deepEqual(rankingGap(PRESEASON, 3), { from: 0, weeksSpanned: 3, skippedWeeks: [1, 2] });
  assert.deepEqual(rankingGap(PRESEASON, 1), { from: 0, weeksSpanned: 1, skippedWeeks: [] });
});

test('no previous ranking, or one that cannot be placed, has no span', () => {
  assert.equal(rankingGap(null, 6), null);
  assert.equal(rankingGap({ label: 'final', week: null }, 6), null);
  assert.equal(rankingGap(weekRanking(6), 6), null);
});

test('skipped weeks read as a list', () => {
  assert.equal(describeWeeks([5]), 'week 5');
  assert.equal(describeWeeks([4, 5]), 'weeks 4 and 5');
  assert.equal(describeWeeks([1, 2, 3]), 'weeks 1, 2 and 3');
});

/* ------------------------------------------------------- what the model sees */

function rankingContext(previousRankings, { week = 6, task = 'rankings', maxNormalMovement = 3 } = {}) {
  return buildContext({
    task,
    config: {
      leagueDisplayName: null,
      editorial: {
        tone: 'dry',
        roast_intensity: 1,
        ranking_emoji: '',
        output: { sleeper_max_chars: 900, include_emoji: false },
        banned_phrases: [],
        awards: {},
      },
      rankings: { weights: { dynasty: { starting_lineup: 1 } }, weekly: { max_normal_movement: maxNormalMovement } },
    },
    league: {
      name: 'Test League',
      season: SEASON,
      status: 'in_season',
      startingSlots: ['QB', 'RB', 'WR'],
      benchSlots: 2,
      taxiSlots: 0,
      format: {
        type: 'dynasty',
        source: 'detected',
        scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: ['QB', 'RB', 'WR'] }),
      },
    },
    teams: [],
    players: {},
    week,
    previousRankings,
  }).previousRankings;
}

test('a week 6 ranking whose last recorded ranking is week 4 carries weeksSpanned 2 and a note', () => {
  const previous = rankingContext(weekRanking(4));
  assert.equal(previous.publishedFor, 4);
  assert.equal(previous.weeksSpanned, 2);
  assert.match(previous.spanNote, /2 weeks of movement, from the week 4 rankings/);
  assert.match(previous.spanNote, /No ranking was recorded for week 5\./);
  assert.match(previous.spanNote, /never call it last week's/);
  assert.match(previous.spanNote, /normally keep movement within 6 spots/, 'the one-week cap of 3, scaled by 2');
});

test('a week 6 ranking with week 5 recorded carries neither', () => {
  const previous = rankingContext(weekRanking(5));
  assert.equal(previous.publishedFor, 5);
  assert.equal('weeksSpanned' in previous, false);
  assert.equal('spanNote' in previous, false);
});

test('a week 3 ranking falling back to the preseason edition spans 3 weeks', () => {
  const previous = rankingContext(PRESEASON, { week: 3 });
  assert.equal(previous.publishedFor, null);
  assert.equal(previous.weeksSpanned, 3);
  assert.match(previous.spanNote, /from the preseason rankings\. No ranking was recorded for weeks 1 and 2\./);
  assert.match(previous.spanNote, /within 9 spots/);
});

test('a survival ranking across a gap carries the same span', () => {
  const previous = rankingContext(weekRanking(3), { task: 'survival-rankings' });
  assert.equal(previous.weeksSpanned, 3);
  assert.match(previous.spanNote, /No ranking was recorded for weeks 4 and 5\./);
});

test('both ranking prompts name the span, forbid "last week" and scale the movement cap', () => {
  for (const name of ['weekly-power-rankings.md', 'survival-rankings.md']) {
    const text = readFileSync(join(PACKAGE_ROOT, 'prompts', name), 'utf8');
    assert.match(text, /`previousRankings\.weeksSpanned`/, name);
    assert.match(text, /Name the edition they measure from/, name);
    assert.match(text, /never call\s+it last week's ranking/, name);
    assert.match(text, /multiply it by `previousRankings\.weeksSpanned`/, name);
    assert.doesNotMatch(text, /last edition's order/, name);
    assert.doesNotMatch(text, /what you got wrong last time/i, name);
  }
});

/* ---------------------------------------------------------------- the CLI */

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

async function buildRankings(week, store) {
  await import('./fixtures/fake-sleeper-api-fetch.mjs');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-gap-')));
  folders.push(root);
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=redraft\nLEAGUE_FIRST_SEASON=2026\n`);
  const config = loadConfig({ workspaceRoot: root });
  const said = [];
  const warnings = [];
  const prepared = await prepareEdition({
    task: 'rankings',
    week,
    settings: { ...config, playerCache: createMemoryPlayerCache() },
    store,
    assets: loadDiskAssets({ promptsDir: config.promptsDir }),
    log: { say: (line) => said.push(line), warn: (line) => warnings.push(line) },
  });
  return { ...prepared, said, warnings };
}

test('the CLI names the skipped weeks when it measures movement across a gap', async () => {
  const store = createMemoryStore();
  store.saveRankings(SEASON, 'week-1', weekRanking(1));
  const { said, warnings, context } = await buildRankings(3, store);
  assert.ok(said.includes('Measuring movement against "week-1" rankings.'));
  assert.deepEqual(warnings.filter((line) => /No ranking was recorded/.test(line)), [
    'No ranking was recorded for week 2, so the arrows measure 2 weeks of movement from the week 1 rankings.',
  ]);
  assert.equal(context.previousRankings.weeksSpanned, 2);
});

test('the CLI says nothing about a gap when last week was recorded', async () => {
  const store = createMemoryStore();
  store.saveRankings(SEASON, 'week-2', weekRanking(2));
  const { warnings, context } = await buildRankings(3, store);
  assert.deepEqual(warnings.filter((line) => /No ranking was recorded/.test(line)), []);
  assert.equal('weeksSpanned' in context.previousRankings, false);
});

test('the CLI names the weeks since the preseason edition when that is all there is', async () => {
  const store = createMemoryStore();
  store.saveRankings(SEASON, 'preseason', PRESEASON);
  const { said, warnings } = await buildRankings(3, store);
  assert.ok(said.includes('Measuring movement against "preseason" rankings.'));
  assert.deepEqual(warnings.filter((line) => /No ranking was recorded/.test(line)), [
    'No ranking was recorded for weeks 1 and 2, so the arrows measure 3 weeks of movement from the preseason rankings.',
  ]);
});

/* ------------------------------------------------------------------ doctor */

/** A store with the weeks captured through `through` and the given rankings. */
function doctorStore({ through, rankingWeeks = [], preseason = false }) {
  const store = createMemoryStore();
  for (let week = 1; week <= through; week += 1) {
    store.saveSnapshot(SEASON, week, { week, season: SEASON, played: true, settled: true, league: { detectedFormat: 'redraft' }, teams: [], analysis: { week, teamWeeks: [] } });
  }
  for (const week of rankingWeeks) store.saveRankings(SEASON, `week-${week}`, weekRanking(week));
  if (preseason) store.saveRankings(SEASON, 'preseason', PRESEASON);
  return store;
}

const doctor = (store) => inspectLeague({ store, provider: 'sleeper', leagueId: '000000000000000000', season: SEASON });

test('doctor lists every week since the last recorded ranking that has none', () => {
  // Week 7 is the current week: rankings through week 6 could be on file.
  const report = doctor(doctorStore({ through: 7, rankingWeeks: [2, 4] }));
  assert.deepEqual(report.rankings, { task: 'rankings', newest: { label: 'week-4', week: 4 }, missingWeeks: [5, 6] });
  assert.match(
    describeInspection(report).coverage.join('\n'),
    /Rankings\s+newest recorded is the week 4 rankings; ✗ none recorded for weeks 5 and 6/,
  );
});

test('doctor reports no missing ranking when last week was recorded', () => {
  const report = doctor(doctorStore({ through: 7, rankingWeeks: [6] }));
  assert.deepEqual(report.rankings.missingWeeks, []);
  assert.match(describeInspection(report).coverage.join('\n'), /newest recorded is the week 6 rankings; none missing since/);
});

test('doctor counts from the preseason edition when that is all there is, and from week 1 with nothing', () => {
  const fromPreseason = doctor(doctorStore({ through: 4, preseason: true }));
  assert.deepEqual(fromPreseason.rankings, { task: 'rankings', newest: { label: 'preseason', week: 0 }, missingWeeks: [1, 2, 3] });
  assert.match(describeInspection(fromPreseason).coverage.join('\n'), /newest recorded is the preseason rankings; ✗ none recorded for weeks 1, 2 and 3/);

  const nothing = doctor(doctorStore({ through: 3 }));
  assert.deepEqual(nothing.rankings, { task: 'rankings', newest: null, missingWeeks: [1, 2] });
  assert.match(describeInspection(nothing).coverage.join('\n'), /Rankings\s+none recorded yet; ✗ none recorded for weeks 1 and 2/);
});
