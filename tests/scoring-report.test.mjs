import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { describeScoringSummary, describeUnmodelledScoring } from '../src/scoringReport.mjs';

/**
 * These cover the text doctor actually prints, so the acceptance case here is
 * literal: run doctor against a known scoring profile and the resolved
 * numbers must be visible in the output, not folded into a single line that
 * only mentions some of them.
 */

test('the summary reports reception tier, positional bonuses with deltas, passing TD and superflex', () => {
  const profile = deriveScoringProfile(
    { rec: 1, bonus_rec_te: 0.5, pass_td: 6 },
    { startingSlots: ['QB', 'SUPER_FLEX', 'RB'] },
  );

  const lines = describeScoringSummary(profile);
  const text = lines.join('\n');

  assert.match(text, /full PPR/);
  assert.match(text, /TE/);
  assert.match(text, /\+0\.5/);
  assert.match(text, /1\.5/); // effective per-catch value
  assert.match(text, /6/); // passing touchdown value
  assert.match(text, /yes/i); // superflex status
});

test('a league with no positional bonuses says so instead of listing nothing', () => {
  const profile = deriveScoringProfile({ rec: 1 }, { startingSlots: ['QB', 'RB'] });
  const text = describeScoringSummary(profile).join('\n');

  assert.match(text, /none/i);
  assert.match(text, /no\b/i); // superflex: no
});

test('a negative positional delta is reported the same way a premium is', () => {
  const profile = deriveScoringProfile({ rec: 0.5, bonus_rec_wr: -0.25 });
  const text = describeScoringSummary(profile).join('\n');

  assert.match(text, /WR/);
  assert.match(text, /-0\.25/);
});

test('an unset passing touchdown value is reported, not silently omitted', () => {
  const profile = deriveScoringProfile({});
  const text = describeScoringSummary(profile).join('\n');

  assert.match(text, /not set/i);
});

test('a league on Sleeper defaults has nothing unmodelled to report', () => {
  const profile = deriveScoringProfile({ rec: 1, bonus_rec_te: 0.5, pass_td: 6 });
  assert.deepEqual(describeUnmodelledScoring(profile), []);
});

test('a setting outside the modelled set is listed under a "not modelled" heading', () => {
  const profile = deriveScoringProfile({ idp_tkl: 1, bonus_rec_first_down: 0.5 });
  const lines = describeUnmodelledScoring(profile);

  assert.ok(lines.length > 0, 'produces at least a heading and one entry');
  assert.match(lines[0], /not modelled/i);
  const text = lines.join('\n');
  assert.match(text, /idp_tkl/);
  assert.match(text, /bonus_rec_first_down/);
});

test('an unmodelled setting with a known default reports what it replaced', () => {
  const profile = deriveScoringProfile({ fum_lost: -1 });
  const text = describeUnmodelledScoring(profile).join('\n');

  assert.match(text, /fum_lost/);
  assert.match(text, /-1/);
  assert.match(text, /-2/); // Sleeper's default, for comparison
});
