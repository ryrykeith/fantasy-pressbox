import test from 'node:test';
import assert from 'node:assert/strict';

import { MARKET_CREDIT_LINE, buildContext, buildPrompt } from '../src/promptContext.mjs';
import { checkPosts, marketValueNumbers } from '../src/validate.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { normalizeLeague, normalizeTeams } from '../src/espn/normalize.mjs';
import { buildLeague, PUBLIC_LEAGUE_ID } from './fixtures/mock-espn-league.mjs';
import { assets } from './fixtures/assets.mjs';

/**
 * FantasyCalc's terms require its name and a link beside its values. An edition
 * that carries market values hands the model the credit line, and the length
 * check reports a post that quotes a value without it. Both leagues' contexts
 * are covered: the market has the same shape on Sleeper and ESPN.
 */

const CREDIT = 'Values: FantasyCalc (fantasycalc.com)';

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
};

const MARKET = {
  source: 'FantasyCalc',
  label: 'redraft, 10 teams, half-PPR',
  fetchedAt: '2026-10-08T23:17:05.924Z',
  week: 3,
  caveats: [],
  players: {},
  picks: {},
};

function sleeperLeague() {
  const startingSlots = ['QB', 'WR', 'WR', 'TE', 'SUPER_FLEX'];
  return {
    name: 'Test League',
    season: '2026',
    status: 'in_season',
    startingSlots,
    benchSlots: 5,
    taxiSlots: 0,
    playoffTeams: 2,
    playoffWeekStart: 15,
    waiverBudget: 100,
    format: {
      type: 'redraft',
      source: 'declared',
      declaredType: 'redraft',
      detectedType: 'redraft',
      scoring: deriveScoringProfile({ rec: 0.5 }, { startingSlots }),
    },
  };
}

const sleeperTeams = [1, 2].map((rosterId) => ({
  rosterId,
  name: `Team ${rosterId}`,
  manager: `mgr${rosterId}`,
  record: { wins: 1, losses: 1, ties: 0 },
  seasonPointsFor: 200,
  seasonPointsAgainst: 200,
  seasonPotentialPoints: 250,
  playerIds: [],
  starterIds: [],
  taxiIds: [],
  reserveIds: [],
}));

function espnInputs() {
  const { views } = buildLeague();
  const league = normalizeLeague(views, { leagueId: PUBLIC_LEAGUE_ID });
  const teams = normalizeTeams(views);
  return { league, teams };
}

const build = ({ league, teams, marketValues }) =>
  buildContext({
    task: 'trade-report',
    config: CONFIG,
    league,
    teams,
    players: {},
    week: 3,
    transactions: [],
    enrichedTransactions: [],
    marketValues,
  });

const sources = {
  sleeper: () => ({ league: sleeperLeague(), teams: sleeperTeams }),
  espn: () => espnInputs(),
};

for (const [provider, inputs] of Object.entries(sources)) {
  test(`${provider}: an edition with market values carries the credit line and its instruction`, () => {
    const ctx = build({ ...inputs(), marketValues: MARKET });
    assert.equal(MARKET_CREDIT_LINE, CREDIT);
    assert.equal(ctx.marketCredit.line, CREDIT);
    assert.match(ctx.marketCredit.instruction, /must end with this exact line/);
    assert.match(ctx.marketCredit.instruction, /counts toward\s+the post-length limit/);
  });

  test(`${provider}: an edition without market values is unchanged and needs no credit`, () => {
    for (const marketValues of [null, { unavailable: 'FantasyCalc did not answer' }]) {
      const ctx = build({ ...inputs(), marketValues });
      assert.equal(ctx.marketCredit, undefined);
      assert.equal(ctx.marketValues, undefined);
    }
  });
}

test('the trade-report prompt tells the model to end a post that quotes a value with the credit line', () => {
  const prompt = buildPrompt({
    task: 'trade-report',
    context: { ...build({ ...sources.sleeper(), marketValues: MARKET }), trades: [{}] },
    assets,
  });
  assert.match(prompt, /marketCredit/);
});

/* ------------------------------------------------------------- validation */

// What the context carries for a traded player and a pick, as promptContext shapes it.
const withValues = {
  marketCredit: { line: CREDIT },
  trades: [
    {
      sides: [
        {
          received: { players: [{ player: 'DJ Moore', market: { value: 2097 } }], picks: [{ pick: '2027 round 1', market: { generic: 3116, tiers: { early: 5128 } } }] },
          receivedMarketTotal: { value: 5213 },
        },
      ],
    },
  ],
};

test('a post that quotes a value without the credit line is reported', () => {
  const report = checkPosts('TRADE REPORT 1/1\nDJ Moore is worth 2097 on the market.', { context: withValues });
  assert.equal(report.allOk, false);
  assert.equal(report.creditMissing.length, 1);
  assert.equal(report.creditLine, CREDIT);
});

test('a post that quotes a value and ends with the credit line passes', () => {
  const report = checkPosts(`TRADE REPORT 1/1\nDJ Moore is worth 2,097.\n${CREDIT}`, { context: withValues });
  assert.equal(report.allOk, true);
  assert.deepEqual(report.creditMissing, []);
});

test('a post that quotes no value needs no credit, even in an edition with values', () => {
  const report = checkPosts('TRADE REPORT 2/4\nTeam 1 goes 1-3 and looks lost.\n%%%\nVERDICT: even.', { context: withValues });
  assert.equal(report.allOk, true);
});

test('without market values in the context, no credit is checked', () => {
  const report = checkPosts('DJ Moore is worth 2097.', { context: { trades: withValues.trades } });
  assert.equal(report.allOk, true);
  assert.equal(report.creditLine, null);
});

test('the credit line counts toward the length limit', () => {
  const body = `Value 2097 ${'x'.repeat(20)}\n${CREDIT}`;
  const length = [...body].length;
  assert.equal(checkPosts(body, { maxChars: length, context: withValues }).allOk, true);
  const tight = checkPosts(body, { maxChars: length - 1, context: withValues });
  assert.equal(tight.allOk, false);
  assert.equal(tight.violations[0].overBy, 1);
  assert.equal(tight.creditMissing.length, 0);
});

/**
 * The strength rating prices two of its components in FantasyCalc values
 * (market_value, draft_capital); lineup, depth and age_window are points and
 * years, and quoting those owes no credit.
 */
const withStrength = {
  marketCredit: { line: CREDIT },
  strength: {
    teams: [
      {
        components: {
          lineup: { value: 131.5, weeks: 3 },
          depth: { value: 77.25, weeks: 3 },
          market_value: { value: 18400, pricedPlayers: 20, unpricedPlayers: 0 },
          age_window: { value: 26.4 },
          draft_capital: { value: 5200, picksHeld: 4, unpricedPicks: 0 },
        },
      },
      {
        components: {
          lineup: { value: 140.1 },
          depth: { value: 80.9 },
          market_value: { value: null, reason: 'FantasyCalc prices no player on this roster' },
          age_window: { value: 24.1 },
          draft_capital: { value: null, reason: 'its future picks are not priced' },
        },
      },
    ],
  },
};

test('marketValueNumbers includes a strength market_value and draft_capital, not lineup, depth or age_window', () => {
  assert.deepEqual([...marketValueNumbers(withStrength)].sort((a, b) => a - b), [5200, 18400]);
});

test('a ranking post quoting a strength market value without the credit line is reported', () => {
  const report = checkPosts('POWER RANKINGS\n1. Team 1 — a roster worth 18,400 on the market.', { context: withStrength });
  assert.equal(report.posts[0].missingCredit, true);
  assert.equal(report.allOk, false);
  assert.equal(report.creditMissing.length, 1);
});

test('a ranking post quoting a strength draft capital value without the credit line is reported', () => {
  const report = checkPosts('POWER RANKINGS\n1. Team 1 — picks worth 5200.', { context: withStrength });
  assert.equal(report.creditMissing.length, 1);
});

test('a ranking post quoting a strength market value with the credit line passes', () => {
  const report = checkPosts(`POWER RANKINGS\n1. Team 1 — a roster worth 18,400.\n${CREDIT}`, { context: withStrength });
  assert.equal(report.allOk, true);
  assert.deepEqual(report.creditMissing, []);
});

test('a ranking post quoting only strength lineup, depth and age values needs no credit', () => {
  const report = checkPosts('POWER RANKINGS\n1. Team 1 — lineup 131.5, depth 77.25, starters average 26.4.', { context: withStrength });
  assert.equal(report.allOk, true);
});
