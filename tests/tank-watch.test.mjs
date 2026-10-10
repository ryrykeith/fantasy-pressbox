import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  TANK_WATCH_START_WEEK_KEY,
  parseTankWatchStartWeek,
  resolveTankWatchStartWeek,
  refuseTankWatch,
} from '../src/tankWatch.mjs';
import { buildContext, buildPrompt, TASKS } from '../src/promptContext.mjs';
import { projectDraftOrder } from '../src/analysis/draftOrder.mjs';
import { futurePickOwnership } from '../src/sleeper/normalize.mjs';
import { createStore } from '../src/store.mjs';
import { loadConfig } from '../src/config.mjs';
import { checkPosts } from '../src/validate.mjs';
import {
  RULE,
  TEAMS_AFTER_WEEK_4,
  LEAGUE,
  TRADED_PICKS,
  ROSTER_IDS,
  TACO_TUESDAY,
} from './fixtures/mock-dynasty-league.mjs';

/**
 * The tank watch: a dynasty edition about the race for the top rookie picks,
 * who owns them, and which picks jump if their team crosses the playoff line.
 *
 * Built on the mock league after week 4 (tests/fixtures), where Taco Tuesday's
 * 2027 1st — owned by Rebuild Szn — is projected 1.07 and would be 1.02 if
 * Taco Tuesday missed the playoffs.
 */

const NO_ENV_FILE = join(tmpdir(), 'pressbox-no-such-env-file');

function project(teams = TEAMS_AFTER_WEEK_4) {
  return projectDraftOrder({
    league: LEAGUE,
    teams,
    rule: RULE,
    picks: futurePickOwnership({ tradedPicks: TRADED_PICKS, rosterIds: ROSTER_IDS, roundsPerDraft: 5, season: '2027' }),
  });
}

function testConfig() {
  return {
    leagueFormat: null,
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
    rookieDraft: { order: RULE, tankWatch: { startWeek: null } },
  };
}

const BOARD = {
  draftYear: 2027,
  updated: '2026-10-01',
  entries: [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    name: `Prospect ${rank}`,
    position: 'WR',
    school: 'Example State',
    note: null,
    source: 'Example Rookie Board',
  })),
};

function context({ draftOrder = project(), previousTankWatch = null, prospectBoard = null, league = LEAGUE } = {}) {
  return buildContext({
    task: 'tank-watch',
    config: testConfig(),
    league: { ...league, name: 'Fantasy Island', startingSlots: [], benchSlots: 0, taxiSlots: 0 },
    teams: TEAMS_AFTER_WEEK_4,
    players: {},
    week: 4,
    transactions: [{ type: 'trade', week: 4, teams: ['A', 'B'], bid: null, moves: ['x'] }],
    draftOrder,
    previousTankWatch,
    prospectBoard,
  });
}

const unavailable = (ctx, field) => ctx.unavailable.find((entry) => entry.field === field);

/* ------------------------------------------------------------- refusals */

test('refuses a redraft league: there is no rookie draft to tank for', () => {
  assert.throws(
    () => refuseTankWatch({ formatType: 'redraft', rule: RULE }),
    (error) => /redraft/.test(error.message) && /no rookie draft/i.test(error.message),
  );
});

test('refuses a guillotine league too: only dynasty leagues carry picks into a rookie draft', () => {
  assert.throws(() => refuseTankWatch({ formatType: 'guillotine', rule: RULE }), /guillotine/);
});

test('refuses without a declared rookie draft rule, naming the config key', () => {
  assert.throws(
    () => refuseTankWatch({ formatType: 'dynasty', rule: null }),
    (error) => error.message.includes('`order` in config/rookie-draft.yml'),
  );
});

test('an undeclared format is not refused before Sleeper has been asked', () => {
  assert.doesNotThrow(() => refuseTankWatch({ formatType: null, rule: RULE }));
});

test('refuses before the start week, saying when it opens and how to override', () => {
  const startWeek = { week: 7, source: 'declared' };
  assert.throws(
    () => refuseTankWatch({ formatType: 'dynasty', rule: RULE, week: 4, startWeek }),
    (error) =>
      /opens after week 7/.test(error.message) &&
      /week 4/.test(error.message) &&
      error.message.includes(TANK_WATCH_START_WEEK_KEY) &&
      error.message.includes('--early'),
  );
  assert.doesNotThrow(() => refuseTankWatch({ formatType: 'dynasty', rule: RULE, week: 4, startWeek, early: true }));
  assert.doesNotThrow(() => refuseTankWatch({ formatType: 'dynasty', rule: RULE, week: 7, startWeek }));
});

/* ------------------------------------------------------------- start week */

test('the start week is the declared one, or the regular season midpoint', () => {
  assert.deepEqual(resolveTankWatchStartWeek({ declared: 9, league: LEAGUE }), { week: 9, source: 'declared' });
  // Playoffs start in week 15, so the regular season is 14 weeks and opens the tank watch after week 7.
  assert.deepEqual(resolveTankWatchStartWeek({ declared: null, league: LEAGUE }), { week: 7, source: 'midpoint' });
});

test('with no declared start week and no playoff start to halve, it refuses naming the key', () => {
  assert.throws(
    () => resolveTankWatchStartWeek({ declared: null, league: { ...LEAGUE, playoffWeekStart: null } }),
    (error) => error.message.includes(TANK_WATCH_START_WEEK_KEY),
  );
});

test('a start week must be a week number', () => {
  assert.equal(parseTankWatchStartWeek(undefined), null);
  assert.equal(parseTankWatchStartWeek(null), null);
  assert.equal(parseTankWatchStartWeek(8), 8);
  assert.throws(() => parseTankWatchStartWeek('eight'), /eight/);
  assert.throws(() => parseTankWatchStartWeek(0), /start_week/);
});

test('the start week is read from config/rookie-draft.yml, and the shipped file declares none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pressbox-tank-'));
  const rookieDraftPath = join(dir, 'rookie-draft.yml');
  try {
    writeFileSync(rookieDraftPath, 'tank_watch:\n  start_week: 8\n');
    assert.equal(loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath }).rookieDraft.tankWatch.startWeek, 8);
    writeFileSync(rookieDraftPath, 'tank_watch:\n  start_week: soon\n');
    assert.throws(() => loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath }), /rookie-draft\.yml/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(loadConfig({ envPath: NO_ENV_FILE }).rookieDraft.tankWatch.startWeek, null);
});

/* ------------------------------------------------------------- content */

test('the race is the non-playoff group, with the max points-for gaps between picks', () => {
  const { tankWatch } = context();
  assert.equal(tankWatch.draftSeason, '2027');
  assert.equal(tankWatch.topPicks, '1.01-1.03');
  assert.equal(tankWatch.race.measuredIn, 'max points-for');
  assert.deepEqual(
    tankWatch.race.picks.map((pick) => [pick.pick, pick.team, pick.inTopPicks]),
    [
      ['1.01', 'Kickoff Kings', true],
      ['1.02', 'Rebuild Szn', true],
      ['1.03', 'Sack Lunch', true],
      ['1.04', 'Hail Mary Heroes', false],
      ['1.05', 'Sunday Scaries', false],
      ['1.06', 'Lowered Expectations', false],
    ],
  );
  const third = tankWatch.race.picks[2];
  assert.equal(third.maxPointsFor, 611.75);
  assert.equal(third.marginToTopLine, 7.18);
  assert.equal(tankWatch.race.picks[0].gapToPickAbove, null);
  assert.ok(tankWatch.rule.some((line) => /picks 1-6: the 6 teams that miss the playoffs/.test(line)));
  assert.equal(tankWatch.order.length, 12);
});

test('pick ownership says who holds whose pick, every round, with round-1 picks numbered', () => {
  const { tankWatch } = context();
  const tacoFirst = tankWatch.stakes.find((stake) => stake.originalTeam === 'Taco Tuesday' && stake.round === 1);
  assert.deepEqual(tacoFirst, {
    pick: '2027 round 1',
    round: 1,
    originalTeam: 'Taco Tuesday',
    ownedBy: 'Rebuild Szn',
    projectedPick: '1.07',
  });
  const tacoSecond = tankWatch.stakes.find((stake) => stake.originalTeam === 'Taco Tuesday' && stake.round === 2);
  assert.equal(tacoSecond.ownedBy, 'Lowered Expectations');
  assert.equal(tacoSecond.projectedPick, null);
  // Only picks that changed hands are stakes; a team rooting for itself is not news.
  assert.equal(tankWatch.stakes.length, 4);
  assert.equal(tankWatch.order.find((slot) => slot.pick === '1.07').ownedBy, 'Rebuild Szn');
  assert.equal('ownedBy' in tankWatch.order[0], false);
});

test('the playoff cliff: Taco Tuesday missing the playoffs sends Rebuild Szn its pick at 1.02', () => {
  const { tankWatch } = context();
  const taco = tankWatch.cliff.find((entry) => entry.team === 'Taco Tuesday');
  assert.deepEqual(taco, {
    team: 'Taco Tuesday',
    ownedBy: 'Rebuild Szn',
    side: 'projected playoff team',
    gamesFromLine: 0,
    pick: '1.07',
    pickIfCrossed: '1.02',
    picksMoved: 5,
    swappedWith: 'Sunday Scaries',
  });
});

test('the prize: the board\'s top prospects for the top picks, and nobody else', () => {
  const ctx = context({ prospectBoard: BOARD });
  assert.deepEqual(
    ctx.prospectBoard.prospects.map((prospect) => prospect.name),
    ['Prospect 1', 'Prospect 2', 'Prospect 3'],
  );
  assert.equal(ctx.prospectBoard.prospects[0].source, 'Example Rookie Board');
  assert.match(unavailable(ctx, 'prospectsNotOnBoard').why, /3 for the 2027 class/);
  assert.equal(unavailable(ctx, 'prospectBoard'), undefined);
});

test('with no prospect board the prize is an unavailable entry, not a guess', () => {
  const ctx = context();
  assert.equal('prospectBoard' in ctx, false);
  assert.match(unavailable(ctx, 'prospectBoard').instruction, /Do not name, rank or describe any college or rookie prospect/);
});

test('movement is measured against the previous tank watch\'s projection', () => {
  const before = project(
    TEAMS_AFTER_WEEK_4.map((t) =>
      t.rosterId === TACO_TUESDAY ? { ...t, record: { wins: 1, losses: 3, ties: 0 }, seasonPointsFor: 400 } : t,
    ),
  );
  const ctx = context({ previousTankWatch: { week: 3, draftOrder: before } });
  assert.equal(ctx.tankWatch.movement.sinceWeek, 3);
  const taco = ctx.tankWatch.movement.picks.find((entry) => entry.team === 'Taco Tuesday');
  assert.deepEqual(taco, { team: 'Taco Tuesday', ownedBy: 'Rebuild Szn', pick: '1.07', previousPick: '1.02', change: -5 });
  assert.equal(unavailable(ctx, 'previousTankWatch'), undefined);
});

test('the first tank watch says there is no movement to report', () => {
  const ctx = context();
  assert.equal('movement' in ctx.tankWatch, false);
  assert.match(unavailable(ctx, 'previousTankWatch').instruction, /no movement/i);
});

test('a projection is called a projection, later rounds get no pick numbers, and trade terms are not known', () => {
  const ctx = context();
  assert.equal(ctx.tankWatch.status, 'projected');
  assert.ok(unavailable(ctx, 'finalDraftOrder'));
  assert.ok(unavailable(ctx, 'laterRoundPickNumbers'));
  assert.ok(unavailable(ctx, 'pickTradeHistory'));
  // The generic "do not mention trades" entry would forbid the ownership story itself.
  assert.equal(unavailable(ctx, 'transactions'), undefined);
  assert.equal('transactions' in ctx, false);
  // The draft order already carries every team's record, so no second ordering competes with it.
  assert.equal('standings' in ctx, false);
});

/* ------------------------------------------------------------- the prompt */

test('tank-watch is a registered edition with its own prompt', () => {
  assert.ok(TASKS.includes('tank-watch'));
  const prompt = buildPrompt({ task: 'tank-watch', context: context() });
  assert.match(prompt, /# Tank Watch/);
  assert.match(prompt, /"tankWatch"/);
});

test('buildPrompt refuses a tank watch with no draft order, or for a league that is not dynasty', () => {
  assert.throws(() => buildPrompt({ task: 'tank-watch', context: context({ draftOrder: null }) }), /draft order/);
  const redraft = context({ league: { ...LEAGUE, format: { type: 'redraft', source: 'declared' } } });
  assert.throws(() => buildPrompt({ task: 'tank-watch', context: redraft }), /redraft/);
});

test('the posts a tank watch is asked for are checked against the configured limit', () => {
  const ctx = context();
  assert.equal(ctx.editorial.sleeperMaxChars, 500);
  const report = checkPosts(`TANK WATCH • 1/2\nshort\n%%%\nTANK WATCH • 2/2\n${'x'.repeat(600)}`, { maxChars: 500 });
  assert.equal(report.allOk, false);
});

/* ------------------------------------------------------------- persistence */

test('each tank watch\'s projection is saved, and the next one reads the latest earlier one', () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  assert.equal(store.loadPreviousTankWatch('2026', 8), null);
  store.saveTankWatch('2026', 6, project());
  store.saveTankWatch('2026', 7, project());
  store.saveTankWatch('2026', 8, project());
  const previous = store.loadPreviousTankWatch('2026', 8);
  assert.equal(previous.week, 7);
  assert.equal(previous.draftOrder.slots[6].pick, '1.07');
});

/* ------------------------------------------------------------- the command */

test('--help lists the tank-watch command and the --early override', () => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.match(result.stdout, /tank-watch/);
  assert.match(result.stdout, /--early/);
});
