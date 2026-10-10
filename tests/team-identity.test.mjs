/**
 * Team renames.
 *
 * Sleeper managers rename their teams whenever they like, and do so mid-season.
 * The case these tests are built around happened for real: roster 5 was ranked
 * third as "user4817" (the manager's username, because the team had never
 * been named), then renamed to "Pick Six Appeal" and ranked first the next week.
 * Matched by name, that read as a team ranked first out of nowhere while
 * another vanished. Matched by roster, it is a team that moved up two.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTeamIdentity,
  attachRosterIds,
  presentPreviousRankings,
} from '../src/teamIdentity.mjs';
import { withMovement, gradePredictions } from '../src/store.mjs';
import { recordBlock } from '../src/cli.mjs';
import { buildContext } from '../src/promptContext.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';

// The league as it is now, after the rename.
const TEAMS = [
  { rosterId: 1, name: 'Taco Tuesday', manager: 'tacoman' },
  { rosterId: 2, name: 'Bye Week Blues', manager: 'vavirg' },
  { rosterId: 5, name: 'Pick Six Appeal', manager: 'user4817' },
];

// What the weekly snapshots recorded: roster 5 went by its manager's username
// through week 3 and by its new name from week 4.
const HISTORY = [
  ...[1, 2, 3].flatMap((week) => [
    { week, rosterId: 1, name: 'Taco Tuesday' },
    { week, rosterId: 2, name: 'Bye Week Blues' },
    { week, rosterId: 5, name: 'user4817' },
  ]),
  { week: 4, rosterId: 1, name: 'Taco Tuesday' },
  { week: 4, rosterId: 2, name: 'Bye Week Blues' },
  { week: 4, rosterId: 5, name: 'Pick Six Appeal' },
];

const WEEK_3_RANKINGS = {
  season: '2026',
  label: 'week-3',
  week: 3,
  rankings: [
    { rank: 1, team: 'Taco Tuesday' },
    { rank: 2, team: 'Bye Week Blues' },
    { rank: 3, team: 'user4817' },
  ],
};

const identity = () => createTeamIdentity({ teams: TEAMS, history: HISTORY });

/* ------------------------------------------------------------ resolving names */

test("a team's current name resolves to its roster", () => {
  assert.equal(identity().rosterIdFor('Pick Six Appeal'), 5);
});

test('a name a team was published under before renaming still resolves to it', () => {
  assert.equal(identity().rosterIdFor('user4817', { week: 3 }), 5);
  assert.equal(identity().rosterIdFor('user4817'), 5, 'and without knowing the week');
});

test("a never-named team resolves through its manager's username, even with no history at all", () => {
  // Sleeper shows the username until a team is named, so that is the name it
  // was published under — even if no snapshot ever captured it.
  const bare = createTeamIdentity({ teams: TEAMS });
  assert.equal(bare.rosterIdFor('user4817'), 5);
});

test('matching ignores case and surrounding spaces, which a model will not always preserve', () => {
  assert.equal(identity().rosterIdFor('  pick six appeal '), 5);
});

test('a name nobody has ever gone by does not resolve', () => {
  assert.equal(identity().rosterIdFor('Pick Six Apeal'), null);
});

test("a name two rosters have held is settled by the week it was used, and otherwise refused", () => {
  // Roster 1 was "The Swap" in week 1, roster 2 took that name in week 2.
  const swapped = createTeamIdentity({
    teams: [
      { rosterId: 1, name: 'Alpha', manager: 'a' },
      { rosterId: 2, name: 'Bravo', manager: 'b' },
    ],
    history: [
      { week: 1, rosterId: 1, name: 'The Swap' },
      { week: 2, rosterId: 2, name: 'The Swap' },
    ],
  });
  assert.equal(swapped.rosterIdFor('The Swap', { week: 1 }), 1);
  assert.equal(swapped.rosterIdFor('The Swap', { week: 2 }), 2);
  assert.equal(swapped.rosterIdFor('The Swap'), null, 'without a week it is a guess, so no answer');
});

/* ------------------------------------------------------------------- movement */

test('movement follows a renamed team instead of calling it new', () => {
  const now = attachRosterIds([{ rank: 1, team: 'Pick Six Appeal' }], identity()).entries;
  const before = attachRosterIds(WEEK_3_RANKINGS.rankings, identity(), { week: 3 }).entries;
  const [entry] = withMovement(now, { rankings: before });
  assert.equal(entry.previousRank, 3);
  assert.equal(entry.movement, 2);
});

test('the same comparison by name alone would have lost the team — which is the bug', () => {
  const [entry] = withMovement([{ rank: 1, team: 'Pick Six Appeal' }], WEEK_3_RANKINGS);
  assert.equal(entry.movement, null);
});

/* ------------------------------------------------------------------ recording */

function rankingStore({ previous = WEEK_3_RANKINGS } = {}) {
  const saved = [];
  return {
    saved,
    loadPreviousRankings: () => previous,
    loadTeamNameHistory: () => HISTORY,
    saveRankings(season, label, payload) {
      saved.push({ season, label, payload });
      return `data/rankings/${season}/${label}.json`;
    },
  };
}

test('recording a ranking after a rename files the right movement and the roster behind each name', () => {
  const store = rankingStore();
  recordBlock({
    store,
    league: { season: '2026' },
    week: 4,
    task: 'rankings',
    block: [
      { rank: 1, team: 'Pick Six Appeal' },
      { rank: 2, team: 'Bye Week Blues' },
      { rank: 3, team: 'Taco Tuesday' },
    ],
    previousRankings: null,
    say: () => {},
    teams: TEAMS,
  });

  const filed = store.saved[0].payload.rankings;
  assert.deepEqual(
    filed.map((e) => [e.team, e.rosterId, e.movement]),
    [
      ['Pick Six Appeal', 5, 2],
      ['Bye Week Blues', 2, 0],
      ['Taco Tuesday', 1, -2],
    ],
  );
});

test('recording never rewrites the previous ranking it measured against', () => {
  const previous = structuredClone(WEEK_3_RANKINGS);
  const store = rankingStore({ previous });
  recordBlock({
    store,
    league: { season: '2026' },
    week: 4,
    task: 'rankings',
    block: [{ rank: 1, team: 'Pick Six Appeal' }],
    previousRankings: null,
    say: () => {},
    teams: TEAMS,
  });
  assert.deepEqual(previous, WEEK_3_RANKINGS, 'last week still says user4817, as published');
});

test('a name in the block that matches no team is refused, and nothing is filed', () => {
  const store = rankingStore();
  assert.throws(
    () =>
      recordBlock({
        store,
        league: { season: '2026' },
        week: 4,
        task: 'rankings',
        block: [
          { rank: 1, team: 'Pick Six Apeal' },
          { rank: 2, team: 'Bye Week Blues' },
        ],
        previousRankings: null,
        say: () => {},
        teams: TEAMS,
      }),
    /Pick Six Apeal[\s\S]*Pick Six Appeal \(manager user4817\)/,
  );
  assert.equal(store.saved.length, 0);
});

test('recorded predictions keep their published names and gain the roster behind each', () => {
  const saved = [];
  const store = {
    loadTeamNameHistory: () => HISTORY,
    savePredictions: (season, week, predictions) => saved.push(predictions) && 'path',
  };
  recordBlock({
    store,
    league: { season: '2026' },
    week: 4,
    task: 'preview',
    block: [{ team_a: 'Pick Six Appeal', team_b: 'Taco Tuesday', predicted_winner: 'Pick Six Appeal' }],
    previousRankings: null,
    say: () => {},
    teams: TEAMS,
  });
  assert.deepEqual(saved[0][0], {
    team_a: 'Pick Six Appeal',
    team_b: 'Taco Tuesday',
    predicted_winner: 'Pick Six Appeal',
    roster_a: 5,
    roster_b: 1,
    predicted_winner_roster: 5,
  });
});

/* -------------------------------------------------------------------- grading */

test('a called game is graded correctly when the team renamed between the call and the result', () => {
  // Called in week 3 as user4817; the result is read after the rename.
  const graded = gradePredictions(
    [{ team_a: 'user4817', team_b: 'Taco Tuesday', predicted_winner: 'user4817' }],
    {
      week: 3,
      teamWeeks: [
        { rosterId: 5, team: 'Pick Six Appeal', points: 131.58 },
        { rosterId: 1, team: 'Taco Tuesday', points: 114.36 },
      ],
    },
    { identity: identity() },
  );
  assert.equal(graded.results[0].graded, true);
  assert.equal(graded.results[0].correct, true);
});

test('a correct chop call stays correct when the chopped team renamed itself first', () => {
  const graded = gradePredictions(
    [{ week: 3, predicted_chop: 'user4817' }],
    { week: 3, teamWeeks: [] },
    {
      identity: identity(),
      eliminationLedger: { history: [{ week: 3, rosterId: 5, team: 'Pick Six Appeal', source: 'declared' }] },
    },
  );
  // Compared by name this was marked WRONG — worse than leaving it ungraded.
  assert.equal(graded.results[0].correct, true);
});

/* ---------------------------------------------------------- what the model sees */

test("last week's ranking is shown under current names, with the published name kept as formerly", () => {
  const shown = presentPreviousRankings(WEEK_3_RANKINGS, identity());
  assert.deepEqual(shown.rankings[2], { rank: 3, team: 'Pick Six Appeal', rosterId: 5, formerly: 'user4817' });
  assert.deepEqual(shown.renamed, [{ from: 'user4817', to: 'Pick Six Appeal' }]);
  assert.deepEqual(shown.unresolved, []);
});

function rankingContext(previousRankings) {
  return buildContext({
    task: 'rankings',
    config: {
      leagueDisplayName: null,
      editorial: {
        tone: 'dry',
        roast_intensity: 1,
        ranking_emoji: '',
        output: { sleeper_max_chars: 900, include_emoji: false },
        banned_phrases: [],
        awards: {},
      },
      rankings: { weights: { dynasty: { starting_lineup: 1 } }, weekly: {} },
    },
    league: {
      name: 'Test League',
      season: '2026',
      status: 'in_season',
      startingSlots: ['QB', 'RB', 'WR'],
      benchSlots: 2,
      taxiSlots: 0,
      format: {
        type: 'dynasty',
        source: 'detected',
        scoring: deriveScoringProfile({ rec: 1, pass_td: 4 }, { startingSlots: ['QB', 'RB', 'WR'] }),
      },
    },
    teams: [],
    players: {},
    week: 4,
    previousRankings,
  });
}

test('the prompt explains a rename only when there is one', () => {
  const renamed = rankingContext(presentPreviousRankings(WEEK_3_RANKINGS, identity())).previousRankings;
  assert.match(renamed.note, /same team, renamed/);
  assert.deepEqual(renamed.rankings[2], { rank: 3, team: 'Pick Six Appeal', formerly: 'user4817' });

  const steady = rankingContext(
    presentPreviousRankings({ ...WEEK_3_RANKINGS, rankings: WEEK_3_RANKINGS.rankings.slice(0, 2) }, identity()),
  ).previousRankings;
  assert.equal(steady.note, undefined);
  assert.ok(steady.rankings.every((entry) => !('formerly' in entry)));
});
