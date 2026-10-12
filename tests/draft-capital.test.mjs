import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDraftStatus, normalizeLeague, normalizeTradedPicks } from '../src/sleeper/normalize.mjs';
import { currentSeasonDrafted, isFuturePick } from '../src/league/draftCapital.mjs';
import { LOWERED_EXPECTATIONS, REBUILD_SZN, TACO_TUESDAY } from './fixtures/mock-dynasty-league.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('traded picks are normalized to provider-neutral fields', () => {
  const raw = [
    { season: '2027', round: 1, roster_id: TACO_TUESDAY, owner_id: REBUILD_SZN, previous_owner_id: LOWERED_EXPECTATIONS },
    { season: 2028, round: 2, roster_id: REBUILD_SZN, owner_id: TACO_TUESDAY },
  ];
  assert.deepEqual(normalizeTradedPicks(raw), [
    {
      season: '2027',
      round: 1,
      originalRosterId: TACO_TUESDAY,
      ownerRosterId: REBUILD_SZN,
      previousOwnerRosterId: LOWERED_EXPECTATIONS,
    },
    { season: '2028', round: 2, originalRosterId: REBUILD_SZN, ownerRosterId: TACO_TUESDAY, previousOwnerRosterId: null },
  ]);
  assert.deepEqual(normalizeTradedPicks(null), []);
});

test('Sleeper league status maps to a draft status', () => {
  assert.equal(normalizeDraftStatus('pre_draft'), 'pre_draft');
  assert.equal(normalizeDraftStatus('drafting'), 'drafting');
  assert.equal(normalizeDraftStatus('in_season'), 'complete');
  assert.equal(normalizeDraftStatus('complete'), 'complete');
  assert.equal(normalizeLeague({ season: '2026', status: 'drafting' }).draftStatus, 'drafting');
});

test('a current-season pick is capital only until that draft has been held', () => {
  const pick = { season: '2026', round: 1 };
  assert.equal(isFuturePick(pick, { season: '2026', draftStatus: 'pre_draft' }), true);
  assert.equal(isFuturePick(pick, { season: '2026', draftStatus: 'drafting' }), true);
  assert.equal(isFuturePick(pick, { season: '2026', draftStatus: 'complete' }), false);
  assert.equal(currentSeasonDrafted({ draftStatus: 'complete' }), true);
  assert.equal(isFuturePick({ season: '2027' }, { season: '2026', draftStatus: 'complete' }), true);
  assert.equal(isFuturePick({ season: '2025' }, { season: '2026', draftStatus: 'pre_draft' }), false);
});

test('src/league/draftCapital.mjs reads no Sleeper pick field names', () => {
  const source = readFileSync(join(ROOT, 'src/league/draftCapital.mjs'), 'utf8');
  assert.doesNotMatch(source, /\b(roster_id|owner_id|previous_owner_id)\b/);
});
