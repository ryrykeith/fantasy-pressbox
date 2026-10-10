/**
 * Numbering picks after round 1.
 *
 * Sleeper does not say whether a rookie draft runs linear (every round in round
 * 1's order) or snakes (even rounds reversed), so the league declares it. Once
 * it does, later-round picks get real numbers, and a bubble team's 2nd moves
 * across the playoff line just like its 1st. Built on the mock league after
 * week 4: Taco Tuesday, the last playoff seed, picks 7th, and
 * its 2027 2nd is owned by Lowered Expectations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDeclaredRoundOrder } from '../src/rookieDraft.mjs';
import { pickNumber, positionInRound, projectDraftOrder } from '../src/analysis/draftOrder.mjs';
import { pickProjection, draftProjectionView, tradePicksUnavailable } from '../src/tradePicks.mjs';
import { tankWatchView, tankWatchUnavailable } from '../src/tankWatch.mjs';
import { futurePickOwnership } from '../src/sleeper/normalize.mjs';
import {
  RULE,
  TEAMS_AFTER_WEEK_4,
  LEAGUE,
  TRADED_PICKS,
  ROSTER_IDS,
  TACO_TUESDAY,
  LOWERED_EXPECTATIONS,
} from './fixtures/mock-dynasty-league.mjs';

function project(roundOrder) {
  return projectDraftOrder({
    league: LEAGUE,
    teams: TEAMS_AFTER_WEEK_4,
    rule: RULE,
    picks: futurePickOwnership({ tradedPicks: TRADED_PICKS, rosterIds: ROSTER_IDS, roundsPerDraft: 5, season: '2027' }),
    roundOrder,
  });
}

const view = (draftOrder) =>
  draftProjectionView(draftOrder, { rule: RULE, teamCount: 12, playoffTeams: 6, asOfWeek: 4 });

/* ---------------------------------------------------------------- declaring */

test('the round order is declared as linear or snake, and anything else is refused', () => {
  assert.equal(parseDeclaredRoundOrder('linear'), 'linear');
  assert.equal(parseDeclaredRoundOrder(' Snake '), 'snake');
  assert.equal(parseDeclaredRoundOrder(undefined), null, 'absent means undeclared, never a default');
  assert.equal(parseDeclaredRoundOrder(''), null);
  assert.throws(() => parseDeclaredRoundOrder('serpentine'), /linear .*snake/);
});

/* ---------------------------------------------------------------- numbering */

test('linear: a team picks in the same spot every round', () => {
  const n = { teamCount: 12, roundOrder: 'linear' };
  assert.deepEqual([1, 2, 3].map((round) => pickNumber(round, 7, n)), ['1.07', '2.07', '3.07']);
});

test('snake: even rounds run in reverse', () => {
  const n = { teamCount: 12, roundOrder: 'snake' };
  assert.deepEqual([1, 2, 3].map((round) => pickNumber(round, 7, n)), ['1.07', '2.06', '3.07']);
  assert.equal(positionInRound(2, 1, n), 12, '1.01 picks last in round 2');
});

test('undeclared: round 1 is still numbered, later rounds are not', () => {
  assert.equal(pickNumber(1, 7, { teamCount: 12 }), '1.07');
  assert.equal(pickNumber(2, 7, { teamCount: 12 }), null);
});

test("the projection numbers every round's pick once the order is declared", () => {
  const taco = project('linear').slots.find((slot) => slot.originalRosterId === TACO_TUESDAY);
  assert.deepEqual(
    taco.rounds.slice(0, 3).map((round) => [round.pick, round.owner]),
    [
      ['1.07', 'Rebuild Szn'],
      ['2.07', 'Lowered Expectations'],
      ['3.07', 'Taco Tuesday'],
    ],
  );
});

/* ------------------------------------------------------------- trade grades */

test("in a linear draft a bubble team's traded 2nd crosses the playoff line like its 1st", () => {
  const projection = pickProjection({ season: '2027', round: 2, originalRosterId: TACO_TUESDAY }, { draftOrder: project('linear') });
  assert.equal(projection.projectedPick, '2.07');
  assert.deepEqual(projection.ifOriginalTeamCrosses, {
    pick: '2.02',
    picksMoved: 5,
    gamesFromLine: 0,
    swappedWith: 'Sunday Scaries',
  });
  assert.equal(projection.originalTeamRound1Pick, undefined, 'a numbered pick needs no round-1 stand-in');
});

test('in a snake draft the same crossing moves an even-round pick the other way', () => {
  // Earlier in round 1 means later in round 2: 2.06 becomes 2.11.
  const projection = pickProjection({ season: '2027', round: 2, originalRosterId: TACO_TUESDAY }, { draftOrder: project('snake') });
  assert.equal(projection.projectedPick, '2.06');
  assert.equal(projection.ifOriginalTeamCrosses.pick, '2.11');
  assert.equal(projection.ifOriginalTeamCrosses.picksMoved, -5);
});

test('undeclared leagues keep the old behaviour: no number, only the round-1 slot', () => {
  const projection = pickProjection({ season: '2027', round: 2, originalRosterId: TACO_TUESDAY }, { draftOrder: project(null) });
  assert.equal(projection.projectedPick, null);
  assert.equal(projection.originalTeamRound1Pick, '1.07');
});

test('the trade report only warns about unnumbered later rounds when the order is undeclared', () => {
  const picks = [{ season: '2027', round: 3, originalRosterId: LOWERED_EXPECTATIONS }];
  const fields = (roundOrder) =>
    tradePicksUnavailable({ picks, draftProjection: view(project(roundOrder)), board: null }).map((e) => e.field);
  assert.ok(fields(null).includes('laterRoundPickNumbers'));
  assert.ok(!fields('linear').includes('laterRoundPickNumbers'));
  assert.match(view(project('linear')).laterRounds, /linear/);
});

/* --------------------------------------------------------------- tank watch */

test('tank watch numbers later-round stakes and drops the warning once the order is declared', () => {
  const tankWatch = tankWatchView({ draftOrder: project('linear'), rule: RULE, teamCount: 12, playoffTeams: 6 });
  const tacoSecond = tankWatch.stakes.find((s) => s.round === 2 && s.originalTeam === 'Taco Tuesday');
  assert.equal(tacoSecond.projectedPick, '2.07');
  assert.equal(tacoSecond.ownedBy, 'Lowered Expectations');
  const missing = tankWatchUnavailable({ tankWatch, prize: null, week: 8 }).map((e) => e.field);
  assert.ok(!missing.includes('laterRoundPickNumbers'));

  const undeclared = tankWatchView({ draftOrder: project(null), rule: RULE, teamCount: 12, playoffTeams: 6 });
  assert.equal(undeclared.stakes.find((s) => s.round === 2).projectedPick, null);
  assert.ok(tankWatchUnavailable({ tankWatch: undeclared, prize: null, week: 8 }).some((e) => e.field === 'laterRoundPickNumbers'));
});
