import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import {
  FIXTURE_COOKIES,
  MULTI_WEEK_LEAGUE_ID,
  PRIVATE_LEAGUE_ID,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  UNKNOWN_LEAGUE_ID,
  FIXTURE_WEEK,
} from './fixtures/mock-espn-league.mjs';
import { TEAMS_AFTER_WEEK_4 } from './fixtures/mock-dynasty-league.mjs';

// These check the ESPN fixtures themselves, so every later ESPN test can lean on them.

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026';
const leagueUrl = (id, views, extra = '') =>
  `${BASE}/segments/0/leagues/${id}?${views.map((v) => `view=${v}`).join('&')}${extra}`;
const cookieHeader = { Cookie: `espn_s2=${FIXTURE_COOKIES.espn_s2}; SWID=${FIXTURE_COOKIES.SWID}` };

test('the fixture files say where their shapes come from and that they are unverified', () => {
  for (const file of ['mock-espn-league.mjs', 'fake-espn-fetch.mjs']) {
    const head = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8').slice(0, 1500);
    assert.match(head, /docs\/espn-data\.md/, file);
    assert.match(head, /UNVERIFIED/i, file);
  }
});

test('a public league answers without cookies, with the cast and the doc\'s shapes', async () => {
  const fake = createFakeEspnFetch();
  const settings = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mSettings']))).json();
  assert.equal(settings.settings.size, 12);
  assert.equal(settings.settings.acquisitionSettings.isUsingAcquisitionBudget, true);

  const team = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mTeam', 'mRoster']))).json();
  assert.deepEqual(team.teams.map((t) => t.name), TEAMS_AFTER_WEEK_4.map((t) => t.name));
  assert.equal(team.members.length, 12);
  assert.equal(team.teams[0].roster.entries.length, 9);
  assert.equal(team.teams[0].record.overall.pointsFor, TEAMS_AFTER_WEEK_4[0].seasonPointsFor);
});

test('a week of mMatchup carries both lineups, bench included, and sides add up', async () => {
  const fake = createFakeEspnFetch();
  const body = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mMatchup', 'mMatchupScore'], '&scoringPeriodId=4'))).json();
  assert.equal(body.schedule.length, 6);
  const side = body.schedule[0].home;
  const entries = side.rosterForCurrentScoringPeriod.entries;
  const bench = entries.filter((e) => e.lineupSlotId === 20);
  assert.equal(bench.length, 2);
  const points = (e) => e.playerPoolEntry.player.stats.find((s) => s.scoringPeriodId === 4 && s.statSourceId === 0).appliedTotal;
  const starters = entries.filter((e) => e.lineupSlotId !== 20).reduce((a, e) => a + points(e), 0);
  assert.equal(Math.round(starters * 100) / 100, side.totalPoints);
  assert.equal(side.totalPoints, FIXTURE_WEEK.starterTotal(0));
  assert.ok(bench.some((e) => points(e) > 20), 'one bench player outscored a starter');
  // Without a week, the schedule has scores and no lineups.
  const plain = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mMatchup']))).json();
  assert.equal(plain.schedule[0].home.rosterForCurrentScoringPeriod, undefined);
});

test('week 4 transactions hold a trade, a won and a lost bid, a free agent add and a drop', async () => {
  const fake = createFakeEspnFetch();
  const { transactions } = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mTransactions2'], '&scoringPeriodId=4'))).json();
  assert.deepEqual(transactions.map((t) => t.type), ['TRADE_ACCEPT', 'WAIVER', 'WAIVER_ERROR', 'FREEAGENT', 'ROSTER']);
  assert.deepEqual(transactions.filter((t) => 'bidAmount' in t).map((t) => t.bidAmount), [12, 8]);
  assert.ok(transactions.some((t) => t.items.some((i) => i.type === 'DROP')));
});

test('the rolling-waiver variant has no budget and no bids', async () => {
  const fake = createFakeEspnFetch();
  const settings = await (await fake(leagueUrl(ROLLING_LEAGUE_ID, ['mSettings']))).json();
  assert.equal(settings.settings.acquisitionSettings.isUsingAcquisitionBudget, false);
  const { transactions } = await (await fake(leagueUrl(ROLLING_LEAGUE_ID, ['mTransactions2'], '&scoringPeriodId=4'))).json();
  assert.equal(transactions.some((t) => 'bidAmount' in t), false);
  const { teams } = await (await fake(leagueUrl(ROLLING_LEAGUE_ID, ['mTeam']))).json();
  assert.ok(teams.every((t) => t.waiverRank >= 1 && t.transactionCounter.acquisitionBudgetSpent === undefined));
});

test('the multi-week variant has a matchup period spanning two scoring periods', async () => {
  const fake = createFakeEspnFetch();
  const { settings } = await (await fake(leagueUrl(MULTI_WEEK_LEAGUE_ID, ['mSettings']))).json();
  assert.deepEqual(settings.scheduleSettings.matchupPeriods[4], [4, 5]);
  const normal = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mSettings']))).json();
  assert.ok(Object.values(normal.settings.scheduleSettings.matchupPeriods).every((p) => p.length === 1));
  // Periods 14-16 are the playoffs, after the 13 regular-season periods.
  assert.equal(normal.settings.scheduleSettings.matchupPeriodCount, 13);
  assert.deepEqual(normal.settings.scheduleSettings.matchupPeriods[14], [14]);
});

test('the season endpoint and players_wl need no login', async () => {
  const fake = createFakeEspnFetch();
  const season = await (await fake(BASE)).json();
  assert.ok(season.currentScoringPeriod);
  const players = await (await fake(`${BASE}/players?view=players_wl`, { headers: { 'x-fantasy-filter': '{"filterActive":{"value":true}}' } })).json();
  assert.ok(players.length > 0 && players.length < 60);
  assert.ok(players.every((p) => Array.isArray(p.eligibleSlots) && 'defaultPositionId' in p && 'proTeamId' in p));
  assert.ok(players.some((p) => p.fullName.endsWith(' D/ST')));
});

test('a private league answers 401 without both cookies and 200 with them', async () => {
  const fake = createFakeEspnFetch();
  const url = leagueUrl(PRIVATE_LEAGUE_ID, ['mSettings']);
  const refused = await fake(url);
  assert.equal(refused.status, 401);
  assert.match((await refused.json()).details[0].message, /not authorized to view this League/);
  assert.equal((await fake(url, { headers: { Cookie: `espn_s2=${FIXTURE_COOKIES.espn_s2}` } })).status, 401);
  assert.equal((await fake(url, { headers: { Cookie: 'espn_s2=wrong; SWID=wrong' } })).status, 401);
  assert.equal((await fake(url, { headers: cookieHeader })).status, 200);
  assert.equal((await fake(url, { headers: new Headers(cookieHeader) })).status, 200);
});

test('an unknown league or season is a 404', async () => {
  const fake = createFakeEspnFetch();
  assert.equal((await fake(leagueUrl(UNKNOWN_LEAGUE_ID, ['mSettings']))).status, 404);
  assert.equal((await fake(`${BASE.replace('2026', '2025')}/segments/0/leagues/${PUBLIC_LEAGUE_ID}?view=mSettings`)).status, 404);
});

test('a request the fixtures do not know rejects instead of going anywhere', async () => {
  const fake = createFakeEspnFetch();
  await assert.rejects(fake('https://example.com/league'), /outside the fixture host/);
  await assert.rejects(fake(`${BASE}?view=proTeamSchedules_wl`), /no fixture/);
  await assert.rejects(fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mStandings'])), /no fixture for view/);
});

test('mDraftDetail carries only draftDetail.drafted', async () => {
  const fake = createFakeEspnFetch();
  const body = await (await fake(leagueUrl(PUBLIC_LEAGUE_ID, ['mDraftDetail']))).json();
  assert.deepEqual(body.draftDetail, { drafted: true });
});

test('the fake logs URLs it serves, never cookies', async () => {
  const seen = [];
  const fake = createFakeEspnFetch({ log: (u) => seen.push(u) });
  await fake(leagueUrl(PRIVATE_LEAGUE_ID, ['mSettings']), { headers: cookieHeader });
  assert.equal(seen.length, 1);
  assert.ok(!seen[0].includes(FIXTURE_COOKIES.espn_s2));
});
