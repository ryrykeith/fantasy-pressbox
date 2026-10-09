import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext } from '../src/promptContext.mjs';
import { hasFutureDraftCapital } from '../src/format.mjs';

/**
 * Redraft leagues re-draft every season: no future picks, and usually no taxi
 * squad. The context must not emit either concept, because an empty array or a
 * "nothing traded" note reads as "this exists and happens to be empty".
 */

const PLAYERS = { p1: { full_name: 'One', position: 'QB', team: 'AAA' } };

const FUTURE_DRAFT_CAPITAL = { rounds: 4, teams: [{ team: 'Alpha', picks: ['2027 R1'] }] };

function league(type, taxiSlots) {
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots: ['QB'],
    benchSlots: 2,
    taxiSlots,
    playoffTeams: 4,
    playoffWeekStart: 15,
    format: { type, source: 'declared', declaredType: type, detectedType: type },
  };
}

const TEAMS = [
  {
    rosterId: 1,
    name: 'Alpha',
    manager: 'ann',
    playerIds: ['p1'],
    starterIds: ['p1'],
    taxiIds: [],
    reserveIds: [],
    record: { wins: 1, losses: 0, ties: 0 },
    seasonPointsFor: 100,
    seasonPointsAgainst: 90,
    seasonPotentialPoints: 110,
  },
];

const CONFIG = {
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
    weights: {
      dynasty: { starting_lineup: 0.6, dynasty_value: 0.4 },
      redraft: { starting_lineup: 1 },
    },
    weekly: {},
  },
};

function context(type, taxiSlots) {
  return buildContext({
    task: 'rankings',
    config: CONFIG,
    league: league(type, taxiSlots),
    teams: TEAMS,
    players: PLAYERS,
    week: 3,
    futureDraftCapital: FUTURE_DRAFT_CAPITAL,
  });
}

test('only redraft lacks future draft capital', () => {
  assert.equal(hasFutureDraftCapital({ type: 'redraft' }), false);
  assert.equal(hasFutureDraftCapital({ type: 'dynasty' }), true);
  assert.equal(hasFutureDraftCapital(null), true);
});

test('a redraft context drops futureDraftCapital even when picks were reported', () => {
  const ctx = context('redraft', 0);
  assert.equal('futureDraftCapital' in ctx, false);
});

test('a redraft context says draft capital does not apply, not that nothing was traded', () => {
  const entry = context('redraft', 0).unavailable.find((u) => u.field === 'futureDraftCapital');
  assert.ok(entry);
  assert.match(entry.instruction, /not a concept/);
  assert.doesNotMatch(entry.why, /traded/);
});

test('no taxi slots means no taxiSquad key; injuredReserve stays', () => {
  const [team] = context('redraft', 0).teams;
  assert.equal('taxiSquad' in team, false);
  assert.deepEqual(team.injuredReserve, []);
});

test('a dynasty league keeps futureDraftCapital and taxiSquad', () => {
  const ctx = context('dynasty', 3);
  assert.deepEqual(ctx.futureDraftCapital, FUTURE_DRAFT_CAPITAL);
  assert.deepEqual(ctx.teams[0].taxiSquad, []);
});
