import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLeague, detectFormatType } from '../src/sleeper/normalize.mjs';

/** A minimal Sleeper league payload; each test overrides only what it cares about. */
function sleeperLeague(overrides = {}) {
  return {
    league_id: '123',
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN'],
    scoring_settings: { rec: 0.5, bonus_rec_te: 0.5, pass_td: 4 },
    settings: { num_teams: 12 },
    ...overrides,
  };
}

test('Sleeper league type 2 is dynasty', () => {
  assert.equal(detectFormatType(sleeperLeague({ settings: { type: 2 } })), 'dynasty');
});

test('a taxi squad means dynasty even without the type flag', () => {
  assert.equal(detectFormatType(sleeperLeague({ settings: { taxi_slots: 4 } })), 'dynasty');
});

test('anything else Sleeper reports is treated as redraft', () => {
  assert.equal(detectFormatType(sleeperLeague()), 'redraft');
  assert.equal(detectFormatType(sleeperLeague({ settings: { type: 0, taxi_slots: 0 } })), 'redraft');
});

test('detection never invents a guillotine league', () => {
  // A guillotine league is run by hand, so Sleeper reports it as ordinary
  // head-to-head. Detection must not pretend otherwise.
  assert.notEqual(detectFormatType(sleeperLeague({ settings: { type: 2 } })), 'guillotine');
  assert.notEqual(detectFormatType(sleeperLeague()), 'guillotine');
});

test('an undeclared league still resolves to a usable type', () => {
  const league = normalizeLeague(sleeperLeague({ settings: { type: 2, num_teams: 12 } }));
  assert.equal(league.format.type, 'dynasty');
  assert.equal(league.format.source, 'detected');
  assert.equal(league.format.declaredType, null);
  assert.equal(league.format.detectedType, 'dynasty');
});

test('a declared type wins, and what Sleeper thought is still on the record', () => {
  const league = normalizeLeague(sleeperLeague({ settings: { type: 2, taxi_slots: 4 } }), {
    declaredFormatType: 'guillotine',
  });
  assert.equal(league.format.type, 'guillotine');
  assert.equal(league.format.source, 'declared');
  assert.equal(league.format.declaredType, 'guillotine');
  assert.equal(league.format.detectedType, 'dynasty');
});

test('a declared redraft league overrides a detected dynasty league', () => {
  // The acceptance case this task is named for: Sleeper's own settings say
  // dynasty (type 2), but the operator declared redraft, and the declaration
  // must win rather than the detection.
  const league = normalizeLeague(sleeperLeague({ settings: { type: 2, num_teams: 12 } }), {
    declaredFormatType: 'redraft',
  });
  assert.equal(league.format.type, 'redraft');
  assert.equal(league.format.source, 'declared');
  assert.equal(league.format.declaredType, 'redraft');
  assert.equal(league.format.detectedType, 'dynasty');
});

test('scoring modifiers are orthogonal to the type', () => {
  // A guillotine league can be superflex and TE premium at the same time.
  const league = normalizeLeague(
    sleeperLeague({
      roster_positions: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX', 'BN'],
      scoring_settings: { rec: 1, bonus_rec_te: 0.5, pass_td: 6 },
    }),
    { declaredFormatType: 'guillotine' },
  );

  assert.equal(league.format.type, 'guillotine');
  // The profile itself is covered in tests/scoring-profile.test.mjs; what
  // matters here is only that declaring a format changes none of it.
  assert.equal(league.format.scoring.superflex, true);
  assert.equal(league.format.scoring.reception.base, 1);
  assert.equal(league.format.scoring.reception.byPosition.TE.bonus, 0.5);
  assert.equal(league.format.scoring.passing.touchdown, 6);
});

test('two starting quarterbacks are superflex by another name', () => {
  const league = normalizeLeague(
    sleeperLeague({ roster_positions: ['QB', 'QB', 'RB', 'WR', 'TE', 'BN'] }),
  );
  assert.equal(league.format.scoring.superflex, true);
});

test('a single-quarterback league is not superflex', () => {
  assert.equal(normalizeLeague(sleeperLeague()).format.scoring.superflex, false);
});

test('scoring defaults are explicit rather than undefined', () => {
  const league = normalizeLeague(sleeperLeague({ scoring_settings: {} }));
  assert.equal(league.format.scoring.superflex, false);
  assert.equal(league.format.scoring.reception.base, 0);
  assert.equal(league.format.scoring.reception.byPosition.TE.bonus, 0);
  assert.equal(league.format.scoring.passing.touchdown, null);
});

test('an invalid declared type reaching normalize is still refused', () => {
  assert.throws(
    () => normalizeLeague(sleeperLeague(), { declaredFormatType: 'keeper' }),
    /keeper/,
  );
});
