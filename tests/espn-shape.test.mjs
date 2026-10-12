import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EspnShapeError,
  guardPlayers,
  guardRosters,
  guardSchedule,
  guardSeason,
  guardSettings,
  guardTeams,
  guardTransactions,
} from '../src/espn/shape.mjs';
import {
  LEAGUE_BY_ID,
  PLAYERS_WL,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
  SCORED_WEEK,
  SEASON_RESPONSE,
} from './fixtures/mock-espn-league.mjs';

const clone = (value) => structuredClone(value);
const views = (id = PUBLIC_LEAGUE_ID) => clone(LEAGUE_BY_ID[id].league.views);

/** Asserts the guard throws EspnShapeError naming this view and path, and the doc. */
function refuses(fn, view, path, problem) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof EspnShapeError, String(error));
    assert.equal(error.view, view);
    assert.equal(error.path, path);
    assert.match(error.message, new RegExp(view.replace(/[/+()]/g, '.')));
    assert.ok(error.message.includes(path));
    assert.match(error.message, /docs\/espn-data\.md/);
    if (problem) assert.match(error.message, problem);
    return true;
  });
}

test('every fixture response passes its guard, and is returned untouched', () => {
  const v = views();
  const before = clone(v);
  assert.equal(guardSeason(SEASON_RESPONSE), SEASON_RESPONSE);
  assert.equal(guardPlayers(PLAYERS_WL), PLAYERS_WL);
  assert.equal(guardSettings(v.mSettings), v.mSettings);
  assert.equal(guardTeams(v.mTeam, { faab: true }), v.mTeam);
  assert.equal(guardRosters(v.mRoster), v.mRoster);
  guardSchedule(v.mMatchup);
  guardSchedule(v.mMatchupWeek4, { week: SCORED_WEEK });
  guardTransactions(v.mTransactions2);
  assert.deepEqual(v, before, 'a guard never edits what it checks');
});

test('the rolling-waiver league passes, with no FAAB fields required', () => {
  const v = views(ROLLING_LEAGUE_ID);
  guardSettings(v.mSettings);
  guardTeams(v.mTeam, { faab: false });
  guardTransactions(v.mTransactions2);
});

test('a missing number is an error naming the view and path, never 0', () => {
  const v = views();
  delete v.mSettings.settings.size;
  refuses(() => guardSettings(v.mSettings), 'mSettings', 'settings.size', /is missing/);

  const t = views();
  delete t.mTeam.teams[3].record.overall.wins;
  refuses(() => guardTeams(t.mTeam, { faab: true }), 'mTeam', 'teams[3].record.overall.wins', /is missing/);

  const s = views();
  delete s.mMatchup.schedule[2].home.totalPoints;
  refuses(() => guardSchedule(s.mMatchup), 'mMatchup/mMatchupScore/mScoreboard', 'schedule[2].home.totalPoints', /is missing/);
});

test('a wrong type is an error that names the type found, not the value', () => {
  const t = views();
  t.mTeam.teams[0].record.overall.pointsFor = 'secret-looking-value';
  assert.throws(
    () => guardTeams(t.mTeam, { faab: true }),
    (error) => {
      assert.equal(error.path, 'teams[0].record.overall.pointsFor');
      assert.match(error.message, /must be a number, found string/);
      assert.ok(!error.message.includes('secret-looking-value'));
      return true;
    },
  );
  const n = views();
  n.mTeam.teams[0].record.overall.wins = null;
  refuses(() => guardTeams(n.mTeam, { faab: true }), 'mTeam', 'teams[0].record.overall.wins', /found null/);
  const f = views();
  f.mTeam.teams[0].record.overall.wins = 2.5;
  refuses(() => guardTeams(f.mTeam, { faab: true }), 'mTeam', 'teams[0].record.overall.wins', /whole number/);
});

test('a missing list is an error, never an empty list', () => {
  const t = views();
  delete t.mTeam.teams[1].owners;
  refuses(() => guardTeams(t.mTeam, { faab: true }), 'mTeam', 'teams[1].owners', /is missing/);

  const r = views();
  delete r.mRoster.teams[0].roster.entries;
  refuses(() => guardRosters(r.mRoster), 'mRoster', 'teams[0].roster.entries', /is missing/);

  const x = views();
  delete x.mTransactions2.transactions;
  refuses(() => guardTransactions(x.mTransactions2), 'mTransactions2', 'transactions', /is missing/);

  const p = views();
  delete p.mSettings.settings.scoringSettings.scoringItems;
  refuses(() => guardSettings(p.mSettings), 'mSettings', 'settings.scoringSettings.scoringItems', /is missing/);
});

test('an empty list that is present is fine: the doc says trade items are often empty', () => {
  const x = views();
  x.mTransactions2.transactions[0].items = [];
  guardTransactions(x.mTransactions2);
  const none = views();
  none.mTransactions2.transactions = [];
  guardTransactions(none.mTransactions2);
});

test('a missing items list on a transaction is an error, though an empty one is not', () => {
  const x = views();
  delete x.mTransactions2.transactions[0].items;
  refuses(() => guardTransactions(x.mTransactions2), 'mTransactions2', 'transactions[0].items', /is missing/);
});

test('a missing top-level field names the envelope path', () => {
  const v = views();
  delete v.mSettings.status.finalScoringPeriod;
  refuses(() => guardSettings(v.mSettings), 'mSettings', 'status.finalScoringPeriod');
  const w = views();
  delete w.mTeam.scoringPeriodId;
  refuses(() => guardTeams(w.mTeam, { faab: true }), 'mTeam', 'scoringPeriodId');
});

test('FAAB fields are required only in a FAAB league', () => {
  const v = views();
  delete v.mSettings.settings.acquisitionSettings.acquisitionBudget;
  refuses(() => guardSettings(v.mSettings), 'mSettings', 'settings.acquisitionSettings.acquisitionBudget');

  const t = views();
  delete t.mTeam.teams[2].transactionCounter.acquisitionBudgetSpent;
  refuses(
    () => guardTeams(t.mTeam, { faab: true }),
    'mTeam',
    'teams[2].transactionCounter.acquisitionBudgetSpent',
  );
  guardTeams(t.mTeam, { faab: false });
});

test('matchup period and lineup slot tables must be keyed by numbers', () => {
  const v = views();
  v.mSettings.settings.scheduleSettings.matchupPeriods.week_one = [1];
  refuses(() => guardSettings(v.mSettings), 'mSettings', 'settings.scheduleSettings.matchupPeriods.week_one');
  const w = views();
  w.mSettings.settings.rosterSettings.lineupSlotCounts.QB = 1;
  refuses(() => guardSettings(w.mSettings), 'mSettings', 'settings.rosterSettings.lineupSlotCounts.QB');
});

test('a matchup with no away side is a bye, and passes; no home side does not', () => {
  const v = views();
  delete v.mMatchup.schedule[0].away;
  guardSchedule(v.mMatchup);
  delete v.mMatchup.schedule[0].home;
  refuses(() => guardSchedule(v.mMatchup), 'mMatchup/mMatchupScore/mScoreboard', 'schedule[0].home', /is missing/);
});

test('a winner or transaction type outside the doc is refused, naming the allowed values', () => {
  const v = views();
  v.mMatchup.schedule[1].winner = 'DRAW';
  refuses(() => guardSchedule(v.mMatchup), 'mMatchup/mMatchupScore/mScoreboard', 'schedule[1].winner', /HOME, AWAY, TIE, UNDECIDED/);
  const x = views();
  x.mTransactions2.transactions[1].type = 'BARTER';
  refuses(() => guardTransactions(x.mTransactions2), 'mTransactions2', 'transactions[1].type', /WAIVER/);
});

test('a lineup entry with no actual-points entry passes and stays absent; a present one is type-checked', () => {
  const v = views();
  const stats = v.mMatchupWeek4.schedule[0].home.rosterForCurrentScoringPeriod.entries[0].playerPoolEntry.player.stats;
  stats.splice(0, 1); // drop the statSourceId 0 entry
  guardSchedule(v.mMatchupWeek4, { week: SCORED_WEEK });
  assert.ok(!stats.some((s) => s.statSourceId === 0 && s.scoringPeriodId === SCORED_WEEK), 'the guard adds nothing');

  const w = views();
  const entry = w.mMatchupWeek4.schedule[0].away.rosterForCurrentScoringPeriod.entries[1];
  delete entry.playerPoolEntry.player.stats[0].appliedTotal;
  refuses(
    () => guardSchedule(w.mMatchupWeek4, { week: SCORED_WEEK }),
    'mMatchup/mMatchupScore/mScoreboard',
    'schedule[0].away.rosterForCurrentScoringPeriod.entries[1].playerPoolEntry.player.stats[0].appliedTotal',
    /is missing/,
  );

  const x = views();
  delete x.mMatchupWeek4.schedule[3].home.rosterForCurrentScoringPeriod;
  refuses(
    () => guardSchedule(x.mMatchupWeek4, { week: SCORED_WEEK }),
    'mMatchup/mMatchupScore/mScoreboard',
    'schedule[3].home.rosterForCurrentScoringPeriod',
  );
});

test('the whole-season schedule needs no lineups', () => {
  guardSchedule(views().mMatchup);
});

test('a player missing a field is refused by its path in a roster entry and in the player list', () => {
  const r = views();
  delete r.mRoster.teams[4].roster.entries[2].playerPoolEntry.player.proTeamId;
  refuses(
    () => guardRosters(r.mRoster),
    'mRoster',
    'teams[4].roster.entries[2].playerPoolEntry.player.proTeamId',
    /is missing/,
  );
  const list = clone(PLAYERS_WL);
  list[5].eligibleSlots = '2,3';
  refuses(() => guardPlayers(list), 'players_wl', '(response)[5].eligibleSlots', /must be a list/);
  refuses(() => guardPlayers({ players: list }), 'players_wl', '(response)', /must be a list/);
});

test('a member with no displayName passes (unavailable, per the doc); one with a non-string does not', () => {
  const v = views();
  delete v.mTeam.members[0].displayName;
  guardTeams(v.mTeam, { faab: true });
  v.mTeam.members[1].displayName = 7;
  refuses(() => guardTeams(v.mTeam, { faab: true }), 'mTeam', 'members[1].displayName', /string/);
});

test('the season response must carry currentScoringPeriod.id', () => {
  refuses(() => guardSeason({ id: 2026 }), 'season', 'currentScoringPeriod', /is missing/);
  refuses(() => guardSeason({ currentScoringPeriod: 5 }), 'season', 'currentScoringPeriod', /must be an object/);
  refuses(() => guardSeason({ currentScoringPeriod: {} }), 'season', 'currentScoringPeriod.id', /is missing/);
});

test('guardTeams demands to be told whether the league is FAAB', () => {
  assert.throws(() => guardTeams(views().mTeam, {}), TypeError);
});

test('the shape error says the shapes are unverified and nothing was guessed', () => {
  assert.throws(() => guardSeason({}), /unverified.*Nothing was guessed/s);
});
