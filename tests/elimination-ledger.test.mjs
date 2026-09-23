import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, ROOT } from '../src/config.mjs';

import {
  WEEK_STATUS,
  buildEliminationLedger,
  chopSignature,
  parseDeclaredEliminations,
  resolveTeamReference,
  survivorsAt,
} from '../src/analysis/elimination.mjs';
import { describeEliminationLedger } from '../src/eliminationReport.mjs';
import { hasEliminations } from '../src/format.mjs';
import { createStore } from '../src/store.mjs';
import { captureWeek } from '../src/pipeline.mjs';

/**
 * Sleeper reports a guillotine league as an ordinary head-to-head one and has
 * no elimination field at all, so every fixture below describes the *indirect*
 * evidence: a week's scores, plus the state a commissioner's manual work
 * leaves a chopped roster in (owner removed, players force-dropped).
 */

const STARTING_SLOTS = ['QB', 'RB', 'WR'];

/** A roster the commissioner has not touched: an owner and a full squad. */
function liveTeam(rosterId, name) {
  return {
    rosterId,
    ownerId: `owner-${rosterId}`,
    name,
    playerIds: ['qb', 'rb', 'wr', 'bench'],
  };
}

/** What a chopped roster looks like afterwards: no owner, no players. */
function choppedTeam(rosterId, name) {
  return { rosterId, ownerId: null, name, playerIds: [] };
}

function week(number, scores, { played = true } = {}) {
  return {
    week: number,
    played,
    scores: Object.entries(scores).map(([rosterId, points]) => ({
      rosterId: Number.parseInt(rosterId, 10),
      points,
    })),
  };
}

/* ------------------------------------------------ the declared ledger's shape */

test('a declared ledger is read as an ordered week -> team list', () => {
  const declared = parseDeclaredEliminations({ 3: 'Late Bloomers', 1: 'Bye Week Blues' });
  assert.deepEqual(declared, [
    { week: 1, team: 'Bye Week Blues' },
    { week: 3, team: 'Late Bloomers' },
  ]);
});

test('an absent declared ledger is not an error', () => {
  assert.deepEqual(parseDeclaredEliminations(undefined), []);
  assert.deepEqual(parseDeclaredEliminations(null), []);
  assert.deepEqual(parseDeclaredEliminations({}), []);
});

test('a key that is not a week number is refused, naming the key', () => {
  assert.throws(() => parseDeclaredEliminations({ 'week 1': 'Bye Week Blues' }), /week 1/);
  assert.throws(() => parseDeclaredEliminations({ 0: 'Bye Week Blues' }), /"0"/);
});

test('a week that names no team is refused rather than skipped', () => {
  assert.throws(() => parseDeclaredEliminations({ 1: null }), /week 1/);
  assert.throws(() => parseDeclaredEliminations({ 1: '   ' }), /week 1/);
});

test('a declared team that is not in the league stops the run and lists the real teams', () => {
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(2, 'Late Bloomers')];
  assert.throws(
    () => resolveTeamReference('Bye Week Blues', teams, { week: 2 }),
    (error) =>
      /Bye Week Blues/.test(error.message) &&
      /Chopping Block/.test(error.message) &&
      /Late Bloomers/.test(error.message),
  );
});

test('a declared team resolves by name, case-insensitively, or by roster id', () => {
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(7, 'Late Bloomers')];
  assert.equal(resolveTeamReference('Chopping Block', teams, { week: 1 }), 1);
  assert.equal(resolveTeamReference('  late bloomers ', teams, { week: 1 }), 7);
  assert.equal(resolveTeamReference(7, teams, { week: 1 }), 7);
});

/* ------------------------------------------------------- the chop signature */

test('a chopped roster is recognised by a removed owner or a squad that cannot be fielded', () => {
  const slots = { startingSlotCount: STARTING_SLOTS.length };
  assert.equal(chopSignature(liveTeam(1, 'Chopping Block'), slots).chopped, false);
  assert.equal(chopSignature(choppedTeam(1, 'Chopping Block'), slots).chopped, true);

  // One signal is enough: a commissioner who dropped the players but has not
  // yet removed the owner has still chopped the team.
  const strippedOnly = { ...liveTeam(1, 'Chopping Block'), playerIds: ['qb'] };
  assert.equal(chopSignature(strippedOnly, slots).chopped, true);
  assert.match(chopSignature(strippedOnly, slots).signals.join(' '), /1 player/);
});

/* --------------------------------------------------------- derived ledgers */

test('the ledger yields the ordered elimination history and the survivors for any week', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    liveTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Faab Hoarders'),
    choppedTeam(4, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [
      week(1, { 1: 120, 2: 110, 3: 105, 4: 90 }),
      week(2, { 1: 130, 2: 100, 3: 80, 4: 0 }),
    ],
    throughWeek: 2,
  });

  assert.deepEqual(
    ledger.history.map((entry) => [entry.week, entry.team, entry.source]),
    [
      [1, 'Bye Week Blues', 'derived'],
      [2, 'Faab Hoarders', 'derived'],
    ],
  );
  assert.deepEqual(ledger.survivors.map((team) => team.team), ['Chopping Block', 'Late Bloomers']);

  assert.deepEqual(survivorsAt(ledger, 0).map((t) => t.team), [
    'Chopping Block',
    'Late Bloomers',
    'Faab Hoarders',
    'Bye Week Blues',
  ]);
  assert.deepEqual(survivorsAt(ledger, 1).map((t) => t.team), [
    'Chopping Block',
    'Late Bloomers',
    'Faab Hoarders',
  ]);
  assert.deepEqual(survivorsAt(ledger, 2).map((t) => t.team), ['Chopping Block', 'Late Bloomers']);
});

test('an eliminated team is not a candidate again in a later week', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    liveTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Faab Hoarders'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    // Roster 3 keeps "scoring" 0 after the chop, the way Sleeper reports an
    // emptied roster forever. It must not be chopped a second time.
    weeks: [week(1, { 1: 120, 2: 110, 3: 90 }), week(2, { 1: 130, 2: 100, 3: 0 })],
    throughWeek: 2,
  });

  assert.equal(ledger.history.length, 1);
  assert.equal(ledger.weeks[1].status, WEEK_STATUS.UNRESOLVED);
  assert.equal(ledger.weeks[1].candidate.team, 'Late Bloomers');
});

/* ------------------------------------------------- declaration vs derivation */

test('a derived elimination that contradicts the declared ledger is warned about, naming both', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    choppedTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 100, 3: 90 })],
    // The commissioner ruled Late Bloomers out, even though Bye Week Blues
    // scored less — a stat correction, a tiebreak, or a mistake.
    declared: [{ week: 1, team: 'Late Bloomers' }],
    throughWeek: 1,
  });

  assert.equal(ledger.history[0].team, 'Late Bloomers');
  assert.equal(ledger.history[0].source, 'declared');

  const warning = ledger.warnings.join('\n');
  assert.match(warning, /Late Bloomers/);
  assert.match(warning, /Bye Week Blues/);
  assert.match(warning, /week 1/i);
});

test('a declaration settles a week the scores cannot, and needs no scores at all', () => {
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(2, 'Late Bloomers')];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [],
    declared: [{ week: 1, team: 'Late Bloomers' }],
    throughWeek: 1,
  });

  assert.equal(ledger.weeks[0].status, WEEK_STATUS.ELIMINATED);
  assert.deepEqual(ledger.survivors.map((t) => t.team), ['Chopping Block']);
});

test('declaring a team that is already out is reported, not applied twice', () => {
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(2, 'Late Bloomers')];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [],
    declared: [
      { week: 1, team: 'Late Bloomers' },
      { week: 2, team: 'Late Bloomers' },
    ],
    throughWeek: 2,
  });

  assert.equal(ledger.history.length, 1);
  assert.equal(ledger.weeks[1].status, WEEK_STATUS.UNRESOLVED);
  assert.match(ledger.warnings.join('\n'), /already/i);
});

/* ------------------------------------------------------ unresolvable weeks */

test('a chop the commissioner has not processed is unresolved, not a guess', () => {
  // Week 1 is scored and Bye Week Blues was lowest, but nobody has been
  // removed in Sleeper yet: every roster still has an owner and a squad.
  const teams = [
    liveTeam(1, 'Chopping Block'),
    liveTeam(2, 'Late Bloomers'),
    liveTeam(3, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 110, 3: 90 })],
    throughWeek: 1,
  });

  assert.equal(ledger.weeks[0].status, WEEK_STATUS.UNRESOLVED);
  assert.equal(ledger.history.length, 0);
  assert.deepEqual(ledger.unresolvedWeeks, [1]);
  // The candidate is still reported — an editor may say "on the block", just
  // not "eliminated".
  assert.equal(ledger.weeks[0].candidate.team, 'Bye Week Blues');
  assert.equal(ledger.survivorCount, 3);
});

test('a tie for lowest is unresolved and names everyone tied', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    choppedTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 90, 3: 90 })],
    throughWeek: 1,
  });

  assert.equal(ledger.weeks[0].status, WEEK_STATUS.UNRESOLVED);
  assert.equal(ledger.history.length, 0);
  assert.deepEqual(
    ledger.weeks[0].tiedCandidates.map((c) => c.team).sort(),
    ['Bye Week Blues', 'Late Bloomers'],
  );
});

test('a week that has not been played is reported as such, not as unresolved', () => {
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(2, 'Late Bloomers')];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 0, 2: 0 }, { played: false })],
    throughWeek: 1,
  });

  assert.equal(ledger.weeks[0].status, WEEK_STATUS.NOT_PLAYED);
  assert.equal(ledger.history.length, 0);
});

test('before a ball is kicked, an empty roster is not a chopped one', () => {
  // Every roster is empty in the preseason. Reading the chop signature then
  // would eliminate the entire league in week 1.
  const teams = [choppedTeam(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 0, 2: 0 }, { played: false })],
    throughWeek: 1,
  });

  assert.equal(ledger.history.length, 0);
  assert.deepEqual(ledger.warnings, []);
  assert.equal(ledger.survivorCount, 2);
});

test('a roster that looks chopped but no week accounts for is surfaced', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    liveTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    // Bye Week Blues is gone in Sleeper, but it out-scored Late Bloomers in
    // the only week we have, so no week explains the chop.
    weeks: [week(1, { 1: 120, 2: 90, 3: 100 })],
    throughWeek: 1,
  });

  assert.match(ledger.warnings.join('\n'), /Bye Week Blues/);
  assert.match(ledger.warnings.join('\n'), /no week accounts for it/i);
});

/* ------------------------------------------------------------- the report */

test('the report names the survivors, the history and every warning', () => {
  const teams = [
    liveTeam(1, 'Chopping Block'),
    liveTeam(2, 'Late Bloomers'),
    choppedTeam(3, 'Bye Week Blues'),
  ];
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: STARTING_SLOTS,
    weeks: [week(1, { 1: 120, 2: 110, 3: 90 })],
    throughWeek: 1,
  });

  const text = describeEliminationLedger(ledger).join('\n');
  assert.match(text, /Bye Week Blues/);
  assert.match(text, /2 of 3/);
  // No declared ledger in this fixture, so the report must point at the one
  // reliable path rather than leaving derivation looking authoritative.
  assert.match(text, /config\/guillotine\.yml/);
});

/* ----------------------------------------------- the snapshot captureWeek writes */

const MATCHUPS = [
  { roster_id: 1, matchup_id: 1, points: 120, starters: ['qb'], starters_points: [120], players: ['qb'], players_points: { qb: 120 } },
  { roster_id: 2, matchup_id: 1, points: 90, starters: ['rb'], starters_points: [90], players: ['rb'], players_points: { rb: 90 } },
];

const PLAYERS = {
  qb: { full_name: 'Quinn Arms', position: 'QB', team: 'BUF' },
  rb: { full_name: 'Rex Carter', position: 'RB', team: 'DAL' },
};

function fakeClient() {
  return {
    matchups: async () => MATCHUPS,
    transactions: async () => [],
  };
}

function leagueOf(formatType) {
  return {
    id: '123',
    season: '2026',
    startingSlots: STARTING_SLOTS,
    format: { type: formatType, source: 'declared' },
  };
}

test('captureWeek records the ledger in a guillotine snapshot, so history stays immutable', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [liveTeam(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('guillotine'),
    teams,
    players: PLAYERS,
    week: 1,
    config: { guillotine: { eliminations: [] } },
  });

  assert.equal(result.elimination.history[0].team, 'Late Bloomers');

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(written.elimination.history[0].week, 1);
  assert.equal(written.elimination.history[0].team, 'Late Bloomers');
  assert.deepEqual(written.elimination.survivors.map((t) => t.team), ['Chopping Block']);
});

test('a format with no eliminations gets no ledger key at all, rather than a null one', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [liveTeam(1, 'Chopping Block'), liveTeam(2, 'Late Bloomers')];

  const result = await captureWeek({
    client: fakeClient(),
    store,
    league: leagueOf('dynasty'),
    teams,
    players: PLAYERS,
    week: 1,
  });

  const written = JSON.parse(readFileSync(result.snapshotPath, 'utf8'));
  assert.equal(Object.hasOwn(written, 'elimination'), false);
  assert.equal(Object.hasOwn(result, 'elimination'), false);
});

test('captureWeek carries earlier weeks forward, so week 2 knows who week 1 chopped', async () => {
  const store = createStore({ dataDir: mkdtempSync(join(tmpdir(), 'pressbox-')) });
  const teams = [liveTeam(1, 'Chopping Block'), choppedTeam(2, 'Late Bloomers')];
  const league = leagueOf('guillotine');
  const config = { guillotine: { eliminations: [] } };

  await captureWeek({ client: fakeClient(), store, league, teams, players: PLAYERS, week: 1, config });
  const second = await captureWeek({
    client: fakeClient(),
    store,
    league,
    teams,
    players: PLAYERS,
    week: 2,
    config,
  });

  // Week 1 chopped Late Bloomers; week 2 must not chop it again, and the only
  // survivor is not a candidate against an empty field.
  assert.equal(second.elimination.history.length, 1);
  assert.equal(second.elimination.weeks.length, 2);
  assert.equal(second.elimination.weeks[0].status, WEEK_STATUS.ELIMINATED);
});

/* ------------------------------------------------------------ config load */

// Point config at a file that does not exist so the developer's own .env plays
// no part in what these read.
const NO_ENV_FILE = join(ROOT, 'tests', '.env.does-not-exist');

function withGuillotineFile(body, contents) {
  const path = join(mkdtempSync(join(tmpdir(), 'pressbox-config-')), 'guillotine.yml');
  if (contents !== undefined) writeFileSync(path, contents);
  return body(path);
}

test('the declared ledger is read from config/guillotine.yml', () => {
  withGuillotineFile(
    (guillotinePath) => {
      const config = loadConfig({ envPath: NO_ENV_FILE, guillotinePath });
      assert.deepEqual(config.guillotine.eliminations, [
        { week: 1, team: 'Bye Week Blues' },
        { week: 2, team: 'Faab Hoarders' },
      ]);
    },
    'eliminations:\n  2: "Faab Hoarders"\n  1: "Bye Week Blues"\n',
  );
});

test('a league with no guillotine file has an empty ledger, not a missing one', () => {
  withGuillotineFile((guillotinePath) => {
    assert.deepEqual(loadConfig({ envPath: NO_ENV_FILE, guillotinePath }).guillotine.eliminations, []);
  });
});

test('the shipped config/guillotine.yml is readable and declares nothing', () => {
  const config = loadConfig({
    envPath: NO_ENV_FILE,
    guillotinePath: join(ROOT, 'config', 'guillotine.yml'),
  });
  assert.deepEqual(config.guillotine.eliminations, []);
});

test('a broken ledger stops the run at config load, before any command', () => {
  withGuillotineFile(
    (guillotinePath) => {
      assert.throws(
        () => loadConfig({ envPath: NO_ENV_FILE, guillotinePath }),
        /guillotine\.yml/,
      );
    },
    'eliminations:\n  opening week: "Bye Week Blues"\n',
  );
});

/* ----------------------------------------------------------- the taxonomy */

test('only guillotine eliminates teams during the season', () => {
  assert.equal(hasEliminations({ type: 'guillotine' }), true);
  assert.equal(hasEliminations({ type: 'dynasty' }), false);
  assert.equal(hasEliminations({ type: 'redraft' }), false);
  assert.equal(hasEliminations(undefined), false);
});
