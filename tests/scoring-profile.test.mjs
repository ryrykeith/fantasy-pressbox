import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveScoringProfile,
  normalizeLeague,
  SLEEPER_DEFAULT_SCORING,
} from '../src/sleeper/normalize.mjs';

/** Sleeper's own defaults, so a test can say "this league changed nothing". */
const defaults = () => ({ ...SLEEPER_DEFAULT_SCORING });

/* ------------------------------------------------------------- receptions */

test('the reception tiers are named the way managers name them', () => {
  assert.equal(deriveScoringProfile({ rec: 0 }).reception.tier, 'standard');
  assert.equal(deriveScoringProfile({ rec: 0.5 }).reception.tier, 'half-PPR');
  assert.equal(deriveScoringProfile({ rec: 1 }).reception.tier, 'full PPR');
});

test('an unusual per-reception value is called custom rather than rounded into a tier', () => {
  const profile = deriveScoringProfile({ rec: 0.25 });
  assert.equal(profile.reception.tier, 'custom');
  assert.equal(profile.reception.base, 0.25);
});

test('absent reception scoring is standard, not unknown', () => {
  const profile = deriveScoringProfile({});
  assert.equal(profile.reception.base, 0);
  assert.equal(profile.reception.tier, 'standard');
});

test('a TE premium is reported as a delta and as an effective per-catch value', () => {
  // The acceptance case: +0.5 on top of full PPR means a TE catch is worth 1.5,
  // and the delta is the part that changes what a tight end is worth.
  const profile = deriveScoringProfile({ rec: 1, bonus_rec_te: 0.5 });

  assert.equal(profile.reception.base, 1);
  assert.deepEqual(profile.reception.byPosition, {
    RB: { perCatch: 1, bonus: 0 },
    WR: { perCatch: 1, bonus: 0 },
    TE: { perCatch: 1.5, bonus: 0.5 },
  });
  assert.deepEqual(profile.reception.premiumPositions, ['TE']);
});

test('running back and receiver reception bonuses are captured the same way', () => {
  const profile = deriveScoringProfile({ rec: 0.5, bonus_rec_rb: 0.25, bonus_rec_wr: -0.25 });

  assert.deepEqual(profile.reception.byPosition, {
    RB: { perCatch: 0.75, bonus: 0.25 },
    WR: { perCatch: 0.25, bonus: -0.25 },
    TE: { perCatch: 0.5, bonus: 0 },
  });
  // A negative bonus is not a premium.
  assert.deepEqual(profile.reception.premiumPositions, ['RB']);
});

test('a league with no reception bonuses has no premium positions', () => {
  assert.deepEqual(deriveScoringProfile({ rec: 1 }).reception.premiumPositions, []);
});

test('fractional per-catch values do not pick up floating point noise', () => {
  const profile = deriveScoringProfile({ rec: 0.5, bonus_rec_te: 0.1 });
  assert.equal(profile.reception.byPosition.TE.perCatch, 0.6);
});

/* --------------------------------------------------------------- passing */

test('passing scoring is reported in both of the units people quote', () => {
  const profile = deriveScoringProfile({ pass_td: 6, pass_yd: 0.04, pass_int: -2 });

  assert.deepEqual(profile.passing, {
    touchdown: 6,
    pointsPerYard: 0.04,
    yardsPerPoint: 25,
    interception: -2,
  });
});

test('passing values Sleeper did not report stay null rather than becoming zero', () => {
  // Zero is a real setting — a league really can score a passing touchdown at 0
  // — so it must not double as "we do not know".
  const profile = deriveScoringProfile({});
  assert.deepEqual(profile.passing, {
    touchdown: null,
    pointsPerYard: null,
    yardsPerPoint: null,
    interception: null,
  });
});

test('passing yardage scored at zero does not divide by zero', () => {
  const profile = deriveScoringProfile({ pass_yd: 0 });
  assert.equal(profile.passing.pointsPerYard, 0);
  assert.equal(profile.passing.yardsPerPoint, null);
});

/* ------------------------------------------------------- non-default diff */

test('a league that changed nothing says so, with an empty non-default list', () => {
  // The second acceptance case.
  const profile = deriveScoringProfile(defaults());
  assert.deepEqual(profile.nonDefault, []);
  assert.equal(profile.isDefault, true);
});

test("Sleeper's defaults are the ones people would recognise", () => {
  // Guards the headline entries of the table the diff is measured against: a
  // typo here would report every ordinary league as unusual.
  assert.equal(SLEEPER_DEFAULT_SCORING.rec, 0);
  assert.equal(SLEEPER_DEFAULT_SCORING.pass_td, 4);
  assert.equal(SLEEPER_DEFAULT_SCORING.pass_int, -2);
  assert.equal(SLEEPER_DEFAULT_SCORING.rush_td, 6);
  assert.equal(SLEEPER_DEFAULT_SCORING.rec_td, 6);
  assert.equal(SLEEPER_DEFAULT_SCORING.bonus_rec_te, 0);
});

test('a changed setting is listed with the value it replaced', () => {
  const profile = deriveScoringProfile({ ...defaults(), rec: 1, pass_td: 6 });

  assert.equal(profile.isDefault, false);
  assert.deepEqual(profile.nonDefault, [
    { key: 'pass_td', value: 6, default: 4 },
    { key: 'rec', value: 1, default: 0 },
  ]);
});

test('a setting turned off is as non-default as one turned up', () => {
  // A league with no interception penalty is unusual and must not read as
  // ordinary just because the value is zero.
  const profile = deriveScoringProfile({ ...defaults(), pass_int: 0 });
  assert.deepEqual(profile.nonDefault, [{ key: 'pass_int', value: 0, default: -2 }]);
});

test('a setting Sleeper has no default for is still surfaced', () => {
  // Return yards, first downs and tackle-based IDP scoring are not in any
  // default template, so an unrecognised key is reported rather than dropped.
  const profile = deriveScoringProfile({ ...defaults(), bonus_rec_first_down: 0.5, idp_tkl: 1 });

  assert.equal(profile.isDefault, false);
  assert.deepEqual(profile.nonDefault, [
    { key: 'bonus_rec_first_down', value: 0.5, default: null },
    { key: 'idp_tkl', value: 1, default: null },
  ]);
});

test('an unrecognised setting left at zero is not reported as unusual', () => {
  // Sleeper sends a long tail of keys set to zero for scoring that is simply
  // switched off. Listing those would bury the settings that matter.
  const profile = deriveScoringProfile({ ...defaults(), idp_tkl: 0, bonus_rec_first_down: 0 });
  assert.deepEqual(profile.nonDefault, []);
  assert.equal(profile.isDefault, true);
});

test('the non-default list is ordered so two runs of the same league read the same', () => {
  const profile = deriveScoringProfile({ rec: 1, pass_td: 6, bonus_rec_te: 0.5, fum_lost: -1 });
  assert.deepEqual(
    profile.nonDefault.map((entry) => entry.key),
    ['bonus_rec_te', 'fum_lost', 'pass_td', 'rec'],
  );
});

test('missing scoring settings entirely does not throw', () => {
  const profile = deriveScoringProfile();
  assert.equal(profile.isDefault, true);
  assert.equal(profile.reception.tier, 'standard');
});

/* ------------------------------------------------------------- superflex */

test('superflex comes from the starting slots, not from the scoring blob', () => {
  assert.equal(deriveScoringProfile({}, { startingSlots: ['QB', 'RB', 'WR'] }).superflex, false);
  assert.equal(
    deriveScoringProfile({}, { startingSlots: ['QB', 'SUPER_FLEX', 'RB'] }).superflex,
    true,
  );
  assert.equal(deriveScoringProfile({}, { startingSlots: ['QB', 'QB', 'RB'] }).superflex, true);
});

/* ------------------------------------------------ wired into normalizeLeague */

test('every normalized league carries the profile at league.format.scoring', () => {
  const league = normalizeLeague({
    league_id: '123',
    season: '2026',
    roster_positions: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX', 'BN'],
    scoring_settings: { ...defaults(), rec: 1, bonus_rec_te: 0.5, pass_td: 6 },
    settings: { num_teams: 12 },
  });

  assert.equal(league.format.scoring.superflex, true);
  assert.equal(league.format.scoring.reception.tier, 'full PPR');
  assert.equal(league.format.scoring.reception.byPosition.TE.perCatch, 1.5);
  assert.equal(league.format.scoring.passing.touchdown, 6);
  assert.equal(league.format.scoring.isDefault, false);
});
