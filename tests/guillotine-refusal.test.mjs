import test from 'node:test';
import assert from 'node:assert/strict';

import { refuseGuillotineMatchupEdition } from '../src/cli.mjs';
import { buildContext, buildPrompt } from '../src/promptContext.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';

/**
 * A guillotine league has no head-to-head matchups: nobody plays anybody, so
 * `preview` and `recap` have nothing to describe. Both lines of defence named
 * in the task are covered here —
 *
 * - refuseGuillotineMatchupEdition in src/cli.mjs, which refuses before any
 *   work begins, straight off the declared format (Sleeper can never report
 *   guillotine, so a declaration is the only way it is ever true).
 * - buildPrompt in src/promptContext.mjs, which refuses again from the
 *   resolved context, in case some other caller reaches it directly.
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

const GUILLOTINE_WEIGHTS = { weekly_floor: 0.6, starting_lineup: 0.4 };
const DYNASTY_WEIGHTS = {
  starting_lineup: 0.3,
  dynasty_value: 0.25,
  depth: 0.15,
  quarterback: 0.1,
  future_draft_capital: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.05,
};

function testConfig(leagueFormat = null) {
  return {
    leagueFormat,
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {},
    },
    rankings: {
      weights: { dynasty: DYNASTY_WEIGHTS, guillotine: GUILLOTINE_WEIGHTS },
      weekly: {},
    },
  };
}

function testLeague(formatType) {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: STARTING_SLOTS,
    benchSlots: 2,
    taxiSlots: 0,
    playoffTeams: 0,
    playoffWeekStart: null,
    format: {
      type: formatType,
      source: 'declared',
      declaredType: formatType,
      // Sleeper cannot see a guillotine league, so detection would say
      // redraft even when the operator has declared otherwise.
      detectedType: 'redraft',
      scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: STARTING_SLOTS }),
    },
  };
}

function contextFor(task, formatType) {
  return buildContext({
    task,
    config: testConfig(),
    league: testLeague(formatType),
    teams: [],
    players: {},
    week: 3,
  });
}

/* -------------------------------------------- src/cli.mjs: first line of defence */

test('refuses preview on a declared guillotine league', () => {
  assert.throws(
    () => refuseGuillotineMatchupEdition(testConfig('guillotine'), 'preview'),
    (error) => {
      assert.match(error.message, /guillotine league/i);
      assert.match(error.message, /no head-to-head matchups/i);
      assert.match(error.message, /`survival-preview`/, 'names the replacement command');
      return true;
    },
  );
});

test('refuses recap on a declared guillotine league', () => {
  assert.throws(
    () => refuseGuillotineMatchupEdition(testConfig('guillotine'), 'recap'),
    (error) => {
      assert.match(error.message, /guillotine league/i);
      assert.match(error.message, /no head-to-head matchups/i);
      assert.match(error.message, /`chop-recap`/, 'names the replacement command');
      return true;
    },
  );
});

test('does not refuse preview or recap for dynasty, redraft, or an undeclared format', () => {
  assert.doesNotThrow(() => refuseGuillotineMatchupEdition(testConfig('dynasty'), 'preview'));
  assert.doesNotThrow(() => refuseGuillotineMatchupEdition(testConfig('redraft'), 'recap'));
  assert.doesNotThrow(() => refuseGuillotineMatchupEdition(testConfig(null), 'preview'));
});

test('does not refuse tasks that are not matchup-shaped, even for a guillotine league', () => {
  assert.doesNotThrow(() => refuseGuillotineMatchupEdition(testConfig('guillotine'), 'rankings'));
  assert.doesNotThrow(() =>
    refuseGuillotineMatchupEdition(testConfig('guillotine'), 'preseason-rankings'),
  );
});

/* ------------------------------------------ src/promptContext.mjs: second line */

test('buildPrompt refuses a preview built from a guillotine context', () => {
  const context = contextFor('preview', 'guillotine');
  assert.throws(() => buildPrompt({ task: 'preview', context }), /guillotine league/i);
});

test('buildPrompt refuses a recap built from a guillotine context', () => {
  const context = contextFor('recap', 'guillotine');
  assert.throws(() => buildPrompt({ task: 'recap', context }), /guillotine league/i);
});

test('buildPrompt still builds a rankings edition from a guillotine context', () => {
  const context = contextFor('rankings', 'guillotine');
  assert.doesNotThrow(() => buildPrompt({ task: 'rankings', context }));
});

test('buildPrompt still builds preview and recap for a dynasty context', () => {
  for (const task of ['preview', 'recap']) {
    const context = contextFor(task, 'dynasty');
    assert.doesNotThrow(() => buildPrompt({ task, context }));
  }
});
