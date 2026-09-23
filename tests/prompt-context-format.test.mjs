import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext, buildPrompt, TASKS } from '../src/promptContext.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';

const DYNASTY_WEIGHTS = {
  starting_lineup: 0.3,
  dynasty_value: 0.25,
  depth: 0.15,
  quarterback: 0.1,
  future_draft_capital: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.05,
};

const REDRAFT_WEIGHTS = {
  starting_lineup: 0.45,
  depth: 0.25,
  quarterback: 0.1,
  roster_flexibility: 0.05,
  contender_viability: 0.15,
};

// Both formats every test in this file resolves against. resolveRankingWeights
// throws for any format missing here, so this must cover every testLeague()
// format type used below, not just the ones a given test is asserting on.
const FORMAT_WEIGHTS = { dynasty: DYNASTY_WEIGHTS, redraft: REDRAFT_WEIGHTS };

/** Minimal config: just enough of the editorial/rankings shape buildContext reads. */
function testConfig({ weights = FORMAT_WEIGHTS } = {}) {
  return {
    leagueDisplayName: null,
    editorial: {
      tone: 'dry',
      roast_intensity: 1,
      ranking_emoji: '',
      output: { sleeper_max_chars: 500, include_emoji: false },
      banned_phrases: [],
      awards: {},
    },
    rankings: { weights, weekly: {} },
  };
}

/** Minimal normalized league; each test overrides only what it cares about. */
function testLeague(formatType, source = 'detected', { scoringSettings, startingSlots } = {}) {
  const slots = startingSlots ?? ['QB', 'RB', 'WR'];
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: slots,
    benchSlots: 2,
    taxiSlots: 0,
    playoffTeams: 6,
    playoffWeekStart: 15,
    format: {
      type: formatType,
      source,
      declaredType: source === 'declared' ? formatType : null,
      detectedType: formatType,
      // Derived rather than hand-written, so this fixture cannot drift out of
      // the shape a real normalized league actually has.
      scoring: deriveScoringProfile(scoringSettings ?? { rec: 1, pass_td: 4 }, {
        startingSlots: slots,
      }),
    },
  };
}

/** Sleeper's own defaults: no premiums, no superflex, nothing unusual. */
const ORDINARY_SCORING = { rec: 0, pass_td: 4 };

function findEntry(context, field) {
  return context.unavailable.find((entry) => entry.field === field);
}

function findFactor(context, factor) {
  return context.league.positionalValue.find((entry) => entry.factor === factor);
}

test('context.league.format carries the resolved type and source', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'declared'),
    teams: [],
    players: {},
    week: 3,
  });

  assert.equal(context.league.format.type, 'dynasty');
  assert.equal(context.league.format.source, 'declared');
});

/* ------------------------------------------------ per-format ranking weights */

test("a redraft league's prompt context carries the redraft weight set", () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('redraft'),
    teams: [],
    players: {},
    week: 3,
  });

  assert.deepEqual(context.editorial.rankingWeights, REDRAFT_WEIGHTS);
});

test("a redraft league's ranking weights never mention draft capital as a factor", () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('redraft'),
    teams: [],
    players: {},
    week: 3,
    futureDraftCapital: null,
  });

  // The weight set itself carries no dynasty asset factor — it is the
  // "unavailable" entry's job (tested elsewhere) to explain that draft
  // capital doesn't exist for this format at all, not the weights' job.
  const weightsJson = JSON.stringify(context.editorial.rankingWeights);
  assert.doesNotMatch(weightsJson, /dynasty_value/);
  assert.doesNotMatch(weightsJson, /future_draft_capital/);
});

test("a dynasty league's prompt context still carries the dynasty weight set", () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty'),
    teams: [],
    players: {},
    week: 3,
  });

  assert.deepEqual(context.editorial.rankingWeights, DYNASTY_WEIGHTS);
});

test('a redraft league with no traded picks is told draft capital is not a concept', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('redraft'),
    teams: [],
    players: {},
    week: 3,
    futureDraftCapital: null,
  });

  const entry = findEntry(context, 'futureDraftCapital');
  assert.ok(entry, 'expected an unavailable entry for futureDraftCapital');
  assert.match(entry.instruction, /not a concept|does not exist/i);
  assert.doesNotMatch(entry.instruction, /nothing traded/i);
});

test('a dynasty league with no traded picks keeps today\'s "nothing traded" wording', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty'),
    teams: [],
    players: {},
    week: 3,
    futureDraftCapital: null,
  });

  const entry = findEntry(context, 'futureDraftCapital');
  assert.ok(entry, 'expected an unavailable entry for futureDraftCapital');
  assert.equal(
    entry.instruction,
    'Every team holds its own future picks and nothing else. Do not discuss ' +
      'draft capital as a point of difference between teams, and do not mention ' +
      'picks for drafts that have already happened.',
  );
  assert.equal(entry.why, 'No picks have been traded for any draft that has not yet been held.');
});

test('a redraft league with traded picks present does not get the futureDraftCapital entry at all', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('redraft'),
    teams: [],
    players: {},
    week: 3,
    futureDraftCapital: { note: 'x', roundsPerDraft: 1, seasons: [], teams: [] },
  });

  assert.equal(findEntry(context, 'futureDraftCapital'), undefined);
});

/* ------------------------------------------------ positional value */

test('a TE-premium league is told to rank an every-down tight end as an advantage', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'detected', {
      scoringSettings: { rec: 1, bonus_rec_te: 0.5, pass_td: 4 },
    }),
    teams: [],
    players: {},
    week: 3,
  });

  const entry = findFactor(context, 'receptionPremium:TE');
  assert.ok(entry, 'expected a positional-value entry for the TE premium');
  assert.match(entry.why, /1\.5/, 'the why should state what a tight end catch is actually worth');
  assert.match(entry.instruction, /tight end/i);
  assert.match(entry.instruction, /advantage/i);
});

test('a league with ordinary scoring gets no positional-value entries at all', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'detected', { scoringSettings: ORDINARY_SCORING }),
    teams: [],
    players: {},
    week: 3,
  });

  assert.deepEqual(context.league.positionalValue, []);
});

test('a superflex league is told quarterback scarcity compounds', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'detected', {
      scoringSettings: ORDINARY_SCORING,
      startingSlots: ['QB', 'RB', 'WR', 'SUPER_FLEX'],
    }),
    teams: [],
    players: {},
    week: 3,
  });

  const entry = findFactor(context, 'superflex');
  assert.ok(entry, 'expected a positional-value entry for superflex');
  assert.match(entry.instruction, /quarterback/i);
});

test('six-point passing touchdowns raise quarterback value; four-point ones say nothing', () => {
  const build = (passTd) =>
    buildContext({
      task: 'rankings',
      config: testConfig(),
      league: testLeague('dynasty', 'detected', {
        scoringSettings: { rec: 0, pass_td: passTd },
      }),
      teams: [],
      players: {},
      week: 3,
    });

  assert.ok(findFactor(build(6), 'passingTouchdown'));
  assert.equal(findFactor(build(4), 'passingTouchdown'), undefined);
});

test('every edition carries the positional-value list, not just the rankings', () => {
  for (const task of TASKS) {
    const context = buildContext({
      task,
      config: testConfig(),
      league: testLeague('dynasty', 'detected', {
        scoringSettings: { rec: 1, bonus_rec_te: 0.5, pass_td: 4 },
      }),
      teams: [],
      players: {},
      week: 3,
    });

    assert.ok(
      findFactor(context, 'receptionPremium:TE'),
      `${task} should be told about the TE premium too`,
    );
  }
});

test('the rankings prompt for a TE-premium league states the elevated tight end value', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'detected', {
      scoringSettings: { rec: 1, bonus_rec_te: 0.5, pass_td: 4 },
    }),
    teams: [],
    players: {},
    week: 3,
  });

  const prompt = buildPrompt({ task: 'rankings', context });
  assert.match(prompt, /tight end/i);
  assert.match(prompt, /positionalValue/);
});

test('the rankings prompt for an ordinary league mentions no premium it does not have', () => {
  const context = buildContext({
    task: 'rankings',
    config: testConfig(),
    league: testLeague('dynasty', 'detected', { scoringSettings: ORDINARY_SCORING }),
    teams: [],
    players: {},
    week: 3,
  });

  const prompt = buildPrompt({ task: 'rankings', context });

  // Not one word of instruction about a premium this league does not have.
  assert.doesNotMatch(prompt, /tight end/i);
  assert.match(prompt, /"positionalValue": \[\]/);

  // The profile still reports the facts, and reports them as absent. An empty
  // `premiumPositions` is an answer, not noise: it says this league pays every
  // position the same for a catch.
  assert.match(prompt, /"premiumPositions": \[\]/);
});
