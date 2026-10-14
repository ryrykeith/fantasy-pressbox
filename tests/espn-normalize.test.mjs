import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EspnCodeError } from '../src/espn/codes.mjs';
import {
  EspnUnsupportedError,
  deriveEspnScoringProfile,
  normalizeLeague,
  normalizePlayer,
  normalizePlayers,
  normalizeTeams,
} from '../src/espn/normalize.mjs';
import { EspnShapeError } from '../src/espn/shape.mjs';
import { deriveScoringProfile } from '../src/sleeper/normalize.mjs';
import { buildContext, buildPrompt } from '../src/promptContext.mjs';
import { createStore } from '../src/store.mjs';
import { assets } from './fixtures/assets.mjs';
import {
  LEAGUE_BY_ID,
  PLAYERS_WL,
  PUBLIC_LEAGUE_ID,
  ROLLING_LEAGUE_ID,
} from './fixtures/mock-espn-league.mjs';

// Everything here runs on the invented fixtures (tests/fixtures/mock-espn-league.mjs).
// Their shapes are guesses from docs/espn-data.md; nothing is a real league.

const views = (id = PUBLIC_LEAGUE_ID) => structuredClone(LEAGUE_BY_ID[id].league.views);
const league = (v = views(), options = {}) => normalizeLeague(v, { leagueId: PUBLIC_LEAGUE_ID, ...options });
const withItems = (items) => items.map(([statId, points, pointsOverrides = {}]) => ({ statId, points, pointsOverrides }));

// --- League ------------------------------------------------------------------

test('the fixture league normalizes to the shared League shape', () => {
  const normalized = league();
  const { format, ...rest } = normalized;
  assert.deepEqual(rest, {
    provider: 'espn',
    id: PUBLIC_LEAGUE_ID,
    name: 'Fixture Pressbox League',
    season: '2026',
    seasonType: null,
    status: null,
    draftStatus: 'complete',
    sport: 'nfl',
    teamCount: 12,
    currentWeek: 5,
    lastScoredWeek: 4,
    previousLeagueId: null,
    draftId: null,
    draftRounds: null,
    // Ordered by ESPN slot ID: QB 0, RB 2, WR 4, TE 6, D/ST 16, K 17, RB/WR/TE 23.
    startingSlots: ['QB', 'RB', 'WR', 'TE', 'DEF', 'K', 'FLEX'],
    benchSlots: 2,
    taxiSlots: 0,
    reserveSlots: 1,
    playoffTeams: 6,
    playoffWeekStart: 14,
    playoffSeeding: 'head_to_head_record',
    tradeDeadline: null,
    tradeDeadlineDate: '2026-11-18T17:00:00.000Z',
    waiverType: 'faab',
    waiverBudget: 100,
  });
  assert.deepEqual(
    { ...format, scoring: undefined },
    { type: 'redraft', source: 'detected', declaredType: null, detectedType: 'redraft', keeper: false, scoring: undefined },
  );
});

test('a rolling-waiver league has no budget', () => {
  const normalized = league(views(ROLLING_LEAGUE_ID));
  assert.equal(normalized.waiverType, 'rolling');
  assert.equal(normalized.waiverBudget, null);
});

test('values ESPN does not report are null, not borrowed defaults', () => {
  const v = views();
  delete v.mSettings.settings.tradeSettings;
  delete v.mSettings.settings.scheduleSettings.playoffSeedingRule;
  // No matchup period after the regular season is listed, so the playoff start is not reported.
  for (const key of ['14', '15', '16']) delete v.mSettings.settings.scheduleSettings.matchupPeriods[key];
  const normalized = league(v);
  assert.equal(normalized.tradeDeadlineDate, null);
  assert.equal(normalized.tradeDeadline, null);
  assert.equal(normalized.playoffSeeding, null);
  assert.equal(normalized.playoffWeekStart, null);
});

test('draftStatus is complete or pre_draft from draftDetail.drafted, never drafting', () => {
  const v = views();
  v.mDraftDetail.draftDetail.drafted = false;
  assert.equal(league(v).draftStatus, 'pre_draft');
  delete v.mDraftDetail.draftDetail.drafted;
  assert.throws(() => league(v), (error) => error instanceof EspnShapeError && error.path === 'draftDetail.drafted');
});

test('the last scored week is the one before the current scoring period, capped at the final week', () => {
  const v = views();
  v.mSettings.scoringPeriodId = 1;
  assert.equal(league(v).lastScoredWeek, null);
  v.mSettings.scoringPeriodId = 18;
  assert.equal(league(v).lastScoredWeek, 17);
  assert.equal(league(v).currentWeek, 17);
});

test('the league ID is required', () => {
  assert.throws(() => normalizeLeague(views(), {}), TypeError);
});

// --- Starting slots and IDP ---------------------------------------------------

test('a league that starts IDP slots is refused, naming the slots', () => {
  const v = views();
  Object.assign(v.mSettings.settings.rosterSettings.lineupSlotCounts, { 10: 2, 15: 1 });
  assert.throws(
    () => league(v),
    (error) =>
      error instanceof EspnUnsupportedError &&
      /\(LB, DP slots\)/.test(error.message) &&
      /Individual defensive players are not covered for ESPN in this version/.test(error.message) &&
      /open question 31/.test(error.message),
  );
  assert.throws(() => normalizeTeams(v), EspnUnsupportedError);
});

test('every IDP slot is refused, one at a time', () => {
  const names = { 8: 'DT', 9: 'DE', 10: 'LB', 11: 'DL', 12: 'CB', 13: 'S', 14: 'DB', 15: 'DP' };
  for (const [id, name] of Object.entries(names)) {
    const v = views();
    v.mSettings.settings.rosterSettings.lineupSlotCounts[id] = 1;
    assert.throws(() => league(v), new RegExp(`\\(${name} slot\\)`), `slot ${id}`);
  }
});

test('an IDP slot with a count of 0 is not started and not refused', () => {
  const v = views();
  v.mSettings.settings.rosterSettings.lineupSlotCounts[10] = 0;
  assert.deepEqual(league(v).startingSlots, ['QB', 'RB', 'WR', 'TE', 'DEF', 'K', 'FLEX']);
});

test('another unmapped starting slot is refused by the code table', () => {
  const v = views();
  v.mSettings.settings.rosterSettings.lineupSlotCounts[1] = 1; // TQB
  assert.throws(() => league(v), EspnCodeError);
});

test('a superflex league is detected from the OP slot', () => {
  const v = views();
  v.mSettings.settings.rosterSettings.lineupSlotCounts[7] = 1;
  const normalized = league(v);
  assert.ok(normalized.startingSlots.includes('SUPER_FLEX'));
  assert.equal(normalized.format.scoring.superflex, true);
});

// --- Format ------------------------------------------------------------------

test('a declared guillotine is refused on ESPN, naming the reason', () => {
  assert.throws(
    () => league(views(), { declaredFormatType: 'guillotine' }),
    (error) => error instanceof EspnUnsupportedError && /not supported on ESPN in this version \(v1\)/.test(error.message),
  );
});

test('a declared dynasty is accepted and wins over detection', () => {
  const { format } = league(views(), { declaredFormatType: 'dynasty' });
  assert.equal(format.type, 'dynasty');
  assert.equal(format.source, 'declared');
  assert.equal(format.declaredType, 'dynasty');
  assert.equal(format.detectedType, 'redraft');
});

test('a misspelled declaration is refused, as on Sleeper', () => {
  assert.throws(() => league(views(), { declaredFormatType: 'dynsaty' }), /not a league format/);
});

test('a keeper league resolves to redraft with a keeper flag', () => {
  const v = views();
  v.mSettings.settings.draftSettings.keeperCount = 3;
  const { format } = league(v);
  assert.equal(format.type, 'redraft');
  assert.equal(format.source, 'detected');
  assert.equal(format.keeper, true);
  // The flag is a fact about the league, kept when a format is declared.
  assert.equal(league(v, { declaredFormatType: 'dynasty' }).format.keeper, true);
});

// --- Scoring -----------------------------------------------------------------

function shapeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null || typeof value !== 'object') return typeof value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shapeOf(value[key])]));
}

test('format.scoring has exactly the deriveScoringProfile shape', () => {
  const espn = league().format.scoring;
  const sleeper = deriveScoringProfile({ rec: 1, pass_td: 4, pass_yd: 0.04, pass_int: -2 }, { startingSlots: ['QB'] });
  assert.deepEqual(shapeOf(espn), shapeOf(sleeper));
});

test('with no defaults table, nonDefault lists every scored item and isDefault is false', () => {
  const v = views();
  const items = v.mSettings.settings.scoringSettings.scoringItems;
  const scoring = league(v).format.scoring;
  assert.equal(scoring.isDefault, false);
  assert.deepEqual(
    scoring.nonDefault.map((entry) => entry.key).sort(),
    ['INTT', 'PTD', 'PY', 'REC', 'RTD'],
  );
  assert.equal(scoring.nonDefault.length, items.length);
  for (const entry of scoring.nonDefault) {
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 0);
    assert.equal(entry.default, null);
    assert.match(entry.note, /default unknown.*open question 5/);
  }
  assert.deepEqual(scoring.nonDefault.find((e) => e.key === 'REC'), {
    key: 'REC',
    label: 'Each reception',
    value: 1,
    default: null,
    note: 'ESPN default unknown (docs/espn-data.md, open question 5)',
  });
});

test('the modelled stats fill the profile and the rest go to notModelled', () => {
  const scoring = league().format.scoring;
  assert.deepEqual(scoring.reception, {
    base: 1,
    tier: 'full PPR',
    byPosition: {
      RB: { perCatch: 1, bonus: 0 },
      WR: { perCatch: 1, bonus: 0 },
      TE: { perCatch: 1, bonus: 0 },
    },
    premiumPositions: [],
  });
  assert.deepEqual(scoring.passing, { touchdown: 4, pointsPerYard: 0.04, yardsPerPoint: 25, interception: -2 });
  assert.deepEqual(scoring.notModelled.map((e) => e.key), ['RTD']);
});

test('a stat ID the table lacks is reported in notModelled, not dropped', () => {
  const scoring = deriveEspnScoringProfile(withItems([[53, 0.5], [999, 2]]));
  const entry = scoring.notModelled.find((e) => e.key === 'STAT_999');
  assert.ok(entry);
  assert.match(entry.label, /ESPN stat 999/);
  assert.equal(scoring.reception.tier, 'half-PPR');
});

test('an override on stat 53 goes to notModelled and makes no premium', () => {
  const scoring = deriveEspnScoringProfile(withItems([[53, 1, { 6: 1.5 }]]));
  assert.deepEqual(scoring.reception.premiumPositions, []);
  assert.deepEqual(scoring.reception.byPosition.TE, { perCatch: 1, bonus: 0 });
  const override = scoring.notModelled.find((e) => e.key === 'REC[override 6]');
  assert.ok(override, 'the override is listed');
  assert.equal(override.value, 1.5);
  assert.match(override.note, /open question 5/);
  assert.ok(scoring.nonDefault.includes(override));
  // The base rate itself is modelled.
  assert.equal(scoring.notModelled.some((e) => e.key === 'REC'), false);
});

test('one every-N-yards passing stat is converted to points per yard', () => {
  const scoring = deriveEspnScoringProfile(withItems([[6, 1]])); // 1 point every 10 yards
  assert.equal(scoring.passing.pointsPerYard, 0.1);
  assert.equal(scoring.passing.yardsPerPoint, 10);
  assert.deepEqual(scoring.notModelled, []);
  assert.equal(deriveEspnScoringProfile(withItems([[8, 1]])).passing.pointsPerYard, 0.04); // every 25
});

test('more than one passing-yard reading leaves the rate null and lists them all', () => {
  for (const items of [[[3, 0.04], [5, 0.2]], [[5, 0.2], [10, 4]]]) {
    const scoring = deriveEspnScoringProfile(withItems(items));
    assert.equal(scoring.passing.pointsPerYard, null);
    assert.equal(scoring.passing.yardsPerPoint, null);
    assert.equal(scoring.notModelled.length, 2);
  }
});

test('an unlisted stat is null, never 0', () => {
  const scoring = deriveEspnScoringProfile(withItems([[25, 6]]));
  assert.equal(scoring.reception.base, null);
  assert.equal(scoring.reception.tier, 'unknown');
  assert.equal(scoring.reception.byPosition.WR.perCatch, null);
  assert.equal(scoring.passing.touchdown, null);
  assert.equal(scoring.passing.interception, null);
  assert.equal(scoring.passing.pointsPerYard, null);
});

test('a stat listed twice is refused', () => {
  assert.throws(() => deriveEspnScoringProfile(withItems([[53, 1], [53, 0.5]])), EspnShapeError);
});

// --- Teams -------------------------------------------------------------------

test('the fixture teams normalize to the shared Team shape', () => {
  const teams = normalizeTeams(views());
  assert.equal(teams.length, 12);
  assert.deepEqual(teams[0], {
    rosterId: 1,
    name: 'Bye Week Blues',
    manager: 'fixture_manager_1',
    record: { wins: 3, losses: 1, ties: 0 },
    seasonPointsFor: 587.57,
    seasonPointsAgainst: 576.07,
    seasonPotentialPoints: null,
    waiverBudgetUsed: 0,
    playerIds: ['9000001', '9000002', '9000003', '9000004', '9000005', '9000006', '9000007', '9000008', '9000009'],
    // Lined up with startingSlots: QB, RB, WR, TE, DEF, K, FLEX.
    starterIds: ['9000001', '9000002', '9000004', '9000005', '9000007', '9000006', '9000003'],
    taxiIds: [],
    reserveIds: [],
  });
  assert.equal(teams.find((t) => t.rosterId === 3).waiverBudgetUsed, 12);
});

test('a rolling-waiver league reports no budget used', () => {
  const teams = normalizeTeams(views(ROLLING_LEAGUE_ID));
  assert.ok(teams.every((t) => t.waiverBudgetUsed === null));
});

test('an empty starting slot is null and an IR player is a reserve', () => {
  const v = views();
  const entries = v.mRoster.teams[0].roster.entries;
  entries.find((e) => e.lineupSlotId === 0).lineupSlotId = 21; // the QB goes to IR
  const [team] = normalizeTeams(v);
  assert.equal(team.starterIds[0], null);
  assert.deepEqual(team.reserveIds, ['9000001']);
  assert.ok(team.playerIds.includes('9000001'));
});

test('a starter in a slot the league has no room for is refused', () => {
  const v = views();
  v.mRoster.teams[0].roster.entries.find((e) => e.lineupSlotId === 20).lineupSlotId = 0; // a second QB
  assert.throws(() => normalizeTeams(v), (error) => error instanceof EspnShapeError && /lineupSlotId$/.test(error.path));
});

// --- Players -----------------------------------------------------------------

test('the fixture players normalize to the shared Player shape', () => {
  const players = normalizePlayers(structuredClone(PLAYERS_WL));
  assert.deepEqual(players['9000001'], { id: '9000001', name: 'Quill Aldermere', position: 'QB', team: 'ATL' });
  // A team defense: the D/ST rule needs the name, and D/ST is printed DEF.
  assert.deepEqual(players['9000007'], { id: '9000007', name: 'Bye Week Blues D/ST', position: 'DEF', team: 'DEN' });
  // Pro team 28 is ESPN's WSH, which the bye-week table spells WAS.
  const thistlewood = Object.values(players).find((p) => p.name === 'Waiver Thistlewood');
  assert.deepEqual(thistlewood, { id: thistlewood.id, name: 'Waiver Thistlewood', position: 'RB', team: 'WAS' });
});

test('no age, yearsExp or status is invented; healthy players carry no injury', () => {
  for (const player of Object.values(normalizePlayers(structuredClone(PLAYERS_WL)))) {
    for (const key of ['age', 'yearsExp', 'status', 'injuryStatus']) assert.equal(key in player, false, key);
  }
});

test('an injury status is printed as a label; an unknown one is refused', () => {
  const raw = { ...structuredClone(PLAYERS_WL[0]), injuryStatus: 'QUESTIONABLE' };
  assert.equal(normalizePlayer(raw).injuryStatus, 'Questionable');
  assert.equal(normalizePlayer({ ...raw, injuryStatus: 'INJURY_RESERVE' }).injuryStatus, 'IR');
  assert.throws(() => normalizePlayer({ ...raw, injuryStatus: 'NOT_A_STATUS' }), EspnCodeError);
});

test('a free agent has no team', () => {
  assert.equal(normalizePlayer({ ...structuredClone(PLAYERS_WL[0]), proTeamId: 0 }).team, null);
});

// --- Manager names ------------------------------------------------------------

const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 1,
    ranking_emoji: '',
    output: { sleeper_max_chars: 500, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: { weights: { redraft: { starting_lineup: 1 } }, weekly: {} },
};

/** Every string a team, a snapshot and a prompt built from these views carry. */
function everythingWritten(v) {
  const normalizedLeague = league(v);
  const teams = normalizeTeams(v);
  const players = {};
  for (const t of v.mRoster.teams) {
    for (const entry of t.roster.entries) {
      const player = normalizePlayer(entry.playerPoolEntry.player);
      players[player.id] = player;
    }
  }
  const context = buildContext({ task: 'rankings', config: CONFIG, league: normalizedLeague, teams, players, week: 4 });
  const prompt = buildPrompt({ task: 'rankings', context, assets });

  const dataDir = mkdtempSync(join(tmpdir(), 'espn-names-'));
  try {
    const store = createStore({ dataDir });
    store.saveSnapshot(normalizedLeague.season, 4, { week: 4, season: normalizedLeague.season, league: normalizedLeague, teams });
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(readFileSync(path, 'utf8'));
      }
    };
    walk(dataDir);
    return { teams, text: [JSON.stringify({ normalizedLeague, teams, players, context }), JSON.stringify(prompt), ...files].join('\n') };
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/** Real-name and owner fields, as the JS client reads them (teams[].owner) and on members. */
function withOwnerNames(v) {
  v.mTeam.teams.forEach((t, i) => {
    t.owner = { firstName: `OwnerFirst${i}`, lastName: `OwnerLast${i}` };
  });
  return v;
}

test('without members[].displayName a team has no manager, and no name or owner reaches output', () => {
  const v = withOwnerNames(views());
  for (const member of v.mTeam.members) delete member.displayName;
  const { teams, text } = everythingWritten(v);
  for (const team of teams) assert.equal('manager' in team, false);
  for (const forbidden of ['Firstname', 'Lastname', 'OwnerFirst', 'OwnerLast', 'FIXTURE-MEMBER', 'fixture_manager']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} reached a team, snapshot or prompt`);
  }
});

test('with displayName present, it is the manager and still no first or last name gets through', () => {
  const { teams, text } = everythingWritten(withOwnerNames(views()));
  assert.equal(teams[0].manager, 'fixture_manager_1');
  assert.ok(text.includes('fixture_manager_1'));
  for (const forbidden of ['Firstname', 'Lastname', 'OwnerFirst', 'OwnerLast', 'FIXTURE-MEMBER']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} reached a team, snapshot or prompt`);
  }
});

// --- A league that lists no reception stat -------------------------------------

test('an unknown reception rate is never printed, priced or ranked as zero', async () => {
  const { describeScoringSummary } = await import('../src/scoringReport.mjs');
  const { marketValueQuery } = await import('../src/fantasycalc/client.mjs');
  const v = views();
  const settings = v.mSettings.settings.scoringSettings;
  settings.scoringItems = settings.scoringItems.filter((item) => item.statId !== 53);
  const normalizedLeague = league(v);
  assert.equal(normalizedLeague.format.scoring.reception.base, null);

  const text = describeScoringSummary(normalizedLeague.format.scoring).join('\n');
  assert.doesNotMatch(text, /null/);
  assert.match(text, /not reported/);

  const { caveats } = marketValueQuery({ format: normalizedLeague.format, teamCount: 12 });
  const caveat = caveats.find((c) => c.factor === 'receptionScoring');
  assert.match(caveat.why, /unknown/);
  assert.match(caveat.why, /assume/);

  const teams = normalizeTeams(v);
  const context = buildContext({ task: 'rankings', config: CONFIG, league: normalizedLeague, teams, players: {}, week: 4 });
  assert.equal(context.league.format.scoring.reception.base, null);
  assert.ok(context.unavailable.some((entry) => entry.field === 'receptionRate'));
  assert.ok(!context.league.positionalValue.some((entry) => entry.factor === 'receptionTier'));
});
