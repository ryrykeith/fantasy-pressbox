import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext } from '../src/promptContext.mjs';

/** Minimal config: just enough of the editorial/rankings shape buildContext reads. */
function testConfig() {
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
    rankings: { weights: {}, weekly: {} },
  };
}

/** Minimal normalized league; each test overrides only what it cares about. */
function testLeague(formatType, source = 'detected') {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: ['QB', 'RB', 'WR'],
    benchSlots: 2,
    taxiSlots: 0,
    playoffTeams: 6,
    playoffWeekStart: 15,
    format: {
      type: formatType,
      source,
      declaredType: source === 'declared' ? formatType : null,
      detectedType: formatType,
      scoring: { superflex: false, pointsPerReception: 1, tePremium: 0, passingTouchdown: 4 },
    },
  };
}

function findEntry(context, field) {
  return context.unavailable.find((entry) => entry.field === field);
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
