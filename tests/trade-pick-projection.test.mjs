import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext, buildPrompt } from '../src/promptContext.mjs';
import { projectDraftOrder } from '../src/analysis/draftOrder.mjs';
import { futurePickOwnership } from '../src/sleeper/normalize.mjs';
import { prospectsAroundPick } from '../src/tradePicks.mjs';
import {
  RULE,
  TEAMS_AFTER_WEEK_4,
  LEAGUE,
  TRADED_PICKS,
  ROSTER_IDS,
  REBUILD_SZN,
  TACO_TUESDAY,
} from './fixtures/mock-dynasty-league.mjs';

/**
 * A trade report that values traded picks at their projected slot: the DJ
 * Moore trade in the mock league after week 4. Taco Tuesday sent its
 * 2027 1st to Rebuild Szn for DJ Moore and two later picks. Taco Tuesday is the last playoff
 * seed, so the 1st is projected 1.07 — and 1.02 if it falls out of the field.
 */

const players = {
  wrDJ: { full_name: 'DJ Moore', position: 'WR', team: 'BUF', age: 29 },
};

const pick = (season, round, originalRosterId) => ({ season, round, originalRosterId });

/** The trade as src/analysis/transactions.mjs#enrichTransactions shapes it. */
const TRADE = {
  type: 'trade',
  week: 3,
  completedAt: '2026-09-30T02:21:00.000Z',
  sides: [
    {
      rosterId: REBUILD_SZN,
      team: 'Rebuild Szn',
      received: { players: [], picks: [pick('2027', 1, TACO_TUESDAY)], faab: 0 },
      gaveUp: {
        players: [{ id: 'wrDJ' }],
        picks: [pick('2027', 3, REBUILD_SZN), pick('2028', 2, REBUILD_SZN)],
        faab: 0,
      },
      roster: null,
      rosterNote: 'Week 3 is not on disk.',
    },
    {
      rosterId: TACO_TUESDAY,
      team: 'Taco Tuesday',
      received: {
        players: [{ id: 'wrDJ' }],
        picks: [pick('2027', 3, REBUILD_SZN), pick('2028', 2, REBUILD_SZN)],
        faab: 0,
      },
      gaveUp: { players: [], picks: [pick('2027', 1, TACO_TUESDAY)], faab: 0 },
      roster: null,
      rosterNote: 'Week 3 is not on disk.',
    },
  ],
  playerHistory: [],
  scoring: null,
};

const MARKET = {
  source: 'FantasyCalc',
  label: 'dynasty, superflex, 12 teams, half-PPR',
  fetchedAt: '2026-10-08T23:17:05.924Z',
  caveats: [],
  players: { wrDJ: { name: 'DJ Moore', position: 'WR', value: 2097, overallRank: 100, positionRank: 37, age: 29.4 } },
  picks: {
    '2027-1': { season: '2027', round: 1, generic: 3116, tiers: { Early: 5128, Mid: 3377, Late: 2594 } },
    '2027-3': { season: '2027', round: 3, generic: 700, tiers: {} },
    '2028-2': { season: '2028', round: 2, generic: 1300, tiers: {} },
  },
};

const BOARD = {
  draftYear: 2027,
  updated: '2026-10-01',
  entries: Array.from({ length: 10 }, (_, i) => ({
    rank: i + 1,
    name: `Prospect ${i + 1}`,
    position: i % 2 ? 'QB' : 'WR',
    school: 'Example State',
    note: null,
    source: 'Example Rookie Board',
  })),
};

const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 'medium',
    ranking_emoji: {},
    output: { sleeper_max_chars: 900, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: { weekly: {} },
  rookieDraft: { order: RULE, tankWatch: { startWeek: null } },
};

function project() {
  return projectDraftOrder({
    league: LEAGUE,
    teams: TEAMS_AFTER_WEEK_4,
    rule: RULE,
    picks: futurePickOwnership({ tradedPicks: TRADED_PICKS, rosterIds: ROSTER_IDS, roundsPerDraft: 5, season: '2027' }),
  });
}

function context({ draftOrder = project(), prospectBoard = BOARD, league = LEAGUE } = {}) {
  return buildContext({
    task: 'trade-report',
    config: CONFIG,
    league: { ...league, name: 'Fantasy Island', startingSlots: [], benchSlots: 0, taxiSlots: 0 },
    teams: TEAMS_AFTER_WEEK_4,
    players,
    week: 4,
    enrichedTransactions: [TRADE],
    marketValues: MARKET,
    draftOrder,
    prospectBoard,
  });
}

const field = (ctx, name) => ctx.unavailable.find((entry) => entry.field === name);
const side = (ctx, name) => ctx.trades[0].sides.find((s) => s.team === name);
const received = (ctx, team, label) => side(ctx, team).received.picks.find((p) => p.pick === label);

/* ------------------------------------------------------------ the board */

test('the board around a pick is the ranks either side of its slot, clipped to the board', () => {
  const ranks = (slot) => prospectsAroundPick(BOARD, slot).map((entry) => entry.rank);
  assert.deepEqual(ranks(7), [6, 7, 8]);
  assert.deepEqual(ranks(1), [1, 2]);
  assert.deepEqual(ranks(10), [9, 10]);
  assert.deepEqual(ranks(12), []);
  assert.deepEqual(prospectsAroundPick(null, 7), []);
});

/* ------------------------------------------------------------ round 1 */

test('a traded 1st is valued at its projected slot, with the cliff and the market tiers alongside', () => {
  const ctx = context();
  const first = received(ctx, 'Rebuild Szn', '2027 round 1');
  assert.equal(first.originalTeam, 'Taco Tuesday');
  // FantasyCalc's generic and tier prices stay, as market context.
  assert.deepEqual(first.market, { generic: 3116, tiers: { Early: 5128, Mid: 3377, Late: 2594 } });
  assert.deepEqual(first.projection, {
    projectedPick: '1.07',
    of: 12,
    originalTeamSide: 'projected playoff team',
    ifOriginalTeamCrosses: {
      pick: '1.02',
      picksMoved: 5,
      gamesFromLine: 0,
      swappedWith: 'Sunday Scaries',
    },
    boardAroundPick: [
      { rank: 6, name: 'Prospect 6', position: 'QB' },
      { rank: 7, name: 'Prospect 7', position: 'WR' },
      { rank: 8, name: 'Prospect 8', position: 'QB' },
    ],
    boardAroundPickIfCrossed: [
      { rank: 1, name: 'Prospect 1', position: 'WR' },
      { rank: 2, name: 'Prospect 2', position: 'QB' },
      { rank: 3, name: 'Prospect 3', position: 'WR' },
    ],
  });
  // The same pick reads the same on the side that gave it up.
  assert.deepEqual(side(ctx, 'Taco Tuesday').gaveUp.picks[0].projection, first.projection);
});

test('a pick whose original team is off the bubble carries no cliff', () => {
  const ctx = buildContext({
    task: 'trade-report',
    config: CONFIG,
    league: { ...LEAGUE, name: 'Fantasy Island', startingSlots: [], benchSlots: 0, taxiSlots: 0 },
    teams: TEAMS_AFTER_WEEK_4,
    players,
    week: 4,
    enrichedTransactions: [
      {
        ...TRADE,
        sides: TRADE.sides.map((s) => ({
          ...s,
          received: { ...s.received, picks: s.received.picks.map((p) => (p.round === 1 ? pick('2027', 1, REBUILD_SZN) : p)) },
        })),
      },
    ],
    marketValues: MARKET,
    draftOrder: project(),
    prospectBoard: BOARD,
  });
  const first = received(ctx, 'Rebuild Szn', '2027 round 1');
  assert.equal(first.projection.projectedPick, '1.02');
  assert.equal(first.projection.originalTeamSide, 'projected to miss the playoffs');
  assert.equal('ifOriginalTeamCrosses' in first.projection, false);
  assert.equal('boardAroundPickIfCrossed' in first.projection, false);
});

/* ------------------------------------------------------------ later rounds and seasons */

test('a later-round pick of the projected draft names its team\'s round-1 slot, never its own number', () => {
  const ctx = context();
  const third = received(ctx, 'Taco Tuesday', '2027 round 3');
  assert.deepEqual(third.projection, {
    projectedPick: null,
    of: 12,
    originalTeamSide: 'projected to miss the playoffs',
    originalTeamRound1Pick: '1.02',
  });
  assert.ok(field(ctx, 'laterRoundPickNumbers'));
});

test('a pick for a draft further out is not projected, and says so', () => {
  const ctx = context();
  const later = received(ctx, 'Taco Tuesday', '2028 round 2');
  assert.equal('projection' in later, false);
  const entry = field(ctx, 'projectedDraftSlot');
  assert.match(entry.why, /2028/);
  assert.match(entry.why, /Only the 2027 draft is projected/);
  assert.match(entry.instruction, /2028/);
});

/* ------------------------------------------------------------ context */

test('the projection is labelled with its rule, status and the week it was taken from', () => {
  const ctx = context();
  assert.equal(ctx.draftProjection.draftSeason, '2027');
  assert.equal(ctx.draftProjection.status, 'projected');
  assert.equal(ctx.draftProjection.asOfWeek, 4);
  assert.match(ctx.draftProjection.rule.join('\n'), /picks 7-12: the 6 playoff teams, lowest max points-for first/);

  assert.match(field(ctx, 'finalDraftOrder').why, /week 4/);
  assert.match(field(ctx, 'finalDraftOrder').instruction, /projected/);
  assert.match(field(ctx, 'projectedSlotAtTradeTime').instruction, /Do not say/);
});

test('only the board entries around a traded pick reach the context, each with its source', () => {
  const ctx = context();
  assert.deepEqual(
    ctx.prospectBoard.prospects.map((entry) => entry.rank),
    [1, 2, 3, 6, 7, 8],
  );
  assert.equal(ctx.prospectBoard.prospects[0].source, 'Example Rookie Board');
  assert.ok(field(ctx, 'prospectsNotOnBoard'));
  assert.match(field(ctx, 'boardRankIsNotAvailability').instruction, /not/);
});

test('without a board, the projection carries no prospects and the class may not be named', () => {
  const ctx = context({ prospectBoard: null });
  const first = received(ctx, 'Rebuild Szn', '2027 round 1');
  assert.equal(first.projection.projectedPick, '1.07');
  assert.equal('boardAroundPick' in first.projection, false);
  assert.equal(ctx.prospectBoard, undefined);
  assert.match(field(ctx, 'prospectBoard').why, /No prospect board is declared for the 2027 draft class/);
  assert.equal(field(ctx, 'boardRankIsNotAvailability'), undefined);
});

test('without a projected order, picks keep the old refusal to name a slot', () => {
  const ctx = context({ draftOrder: null });
  const first = received(ctx, 'Rebuild Szn', '2027 round 1');
  assert.equal('projection' in first, false);
  assert.equal(ctx.draftProjection, undefined);
  assert.equal(ctx.prospectBoard, undefined);
  const entry = field(ctx, 'projectedDraftSlot');
  assert.match(entry.why, /config\/rookie-draft\.yml/);
  assert.match(entry.instruction, /Do not place any pick in a tier/);
  assert.equal(field(ctx, 'finalDraftOrder'), undefined);
});

/* ------------------------------------------------------------ prompt */

test('the dynasty prompt grades a projected pick at its slot and keeps the tiers as market context', () => {
  const prompt = buildPrompt({ task: 'trade-report', context: context() });
  assert.match(prompt, /`projectedPick`/);
  assert.match(prompt, /`ifOriginalTeamCrosses`/);
  assert.match(prompt, /`boardAroundPick`/);
  assert.match(prompt, /market context/);
});
