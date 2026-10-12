/**
 * Turns ESPN responses into the shared League, Team and Player shapes
 * (docs/plans/espn-football.md §6). ESPN's field names stop here.
 *
 * ESPN SUPPORT IS EXPERIMENTAL. Every field read below is one docs/espn-data.md
 * lists, mostly as "assumed", and none has been checked against a live league.
 * Each input passes its shape guard (src/espn/shape.mjs) before anything is
 * read from it, so a wrong guess fails loudly instead of becoming a fact.
 *
 * House rules, all from that doc:
 *   - A value ESPN is not documented to report is null in the League (and absent
 *     from a Player), never borrowed from Sleeper's defaults.
 *   - Manager names come from members[].displayName only. No first or last name,
 *     and no member ID, ever leaves this directory (decision 11, open question 27).
 *   - Leagues this version cannot cover honestly are refused with the reason:
 *     a declared guillotine (decision 9) and a league that starts individual
 *     defensive players (open question 31).
 */
import { parseDeclaredFormatType, resolveFormatType } from '../format.mjs';
import {
  EspnCodeError,
  injuryStatusLabel,
  lineupSlot,
  lineupSlotEntry,
  positionFromEligibleSlots,
  proTeamCode,
  scoringStat,
} from './codes.mjs';
import {
  EspnShapeError,
  guardDraftDetail,
  guardPlayers,
  guardRosters,
  guardSettings,
  guardTeams,
} from './shape.mjs';

/** An ESPN league this version deliberately does not cover. The message says why. */
export class EspnUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EspnUnsupportedError';
  }
}

const BENCH_SLOT_ID = 20;
const IR_SLOT_ID = 21;

/** Lineup slots for individual defensive players: DT, DE, LB, DL, CB, S, DB, DP (doc, "Positions"). */
const IDP_SLOT_IDS = new Set([8, 9, 10, 11, 12, 13, 14, 15]);

/** 0.5 + 0.1 is 0.6000000000000001 in binary floating point. */
function round2(value) {
  return Number(Number(value).toFixed(2));
}

// --- Lineup ------------------------------------------------------------------

/**
 * The league's starting slots, one entry per slot to fill:
 * `[{ slotId, slot }]`, where `slot` is the shared vocabulary
 * (src/analysis/lineup.mjs). Ordered by ESPN slot ID, so the same layout lines
 * up a week's starters (the week normalizer reuses it).
 *
 * Bench (20) and IR (21) are not starting slots. A slot with a count of 0 is
 * not started. A league that starts an IDP slot is refused, naming the slots;
 * any other slot with no shared mapping is refused by the code table.
 */
export function startingSlotLayout(lineupSlotCounts) {
  const started = Object.entries(lineupSlotCounts)
    .map(([key, count]) => [Number(key), count])
    .filter(([id, count]) => count > 0 && id !== BENCH_SLOT_ID && id !== IR_SLOT_ID)
    .sort((a, b) => a[0] - b[0]);

  const idp = started.filter(([id]) => IDP_SLOT_IDS.has(id)).map(([id]) => lineupSlotEntry(id).name);
  if (idp.length > 0) {
    throw new EspnUnsupportedError(
      `This ESPN league starts individual defensive players (${idp.join(', ')} ` +
        `${idp.length === 1 ? 'slot' : 'slots'}). Individual defensive players are not covered for ESPN ` +
        "in this version: the sources don't show which positions may fill ESPN's DL, DB and DP slots, so " +
        'lineup efficiency could not be computed honestly (docs/espn-data.md, "Positions", open question 31).',
    );
  }

  const layout = [];
  for (const [slotId, count] of started) {
    const slot = lineupSlot(slotId);
    for (let i = 0; i < count; i += 1) layout.push({ slotId, slot });
  }
  return layout;
}

/**
 * One team's roster entries, as the shared roster lists: `playerIds` (bench and
 * IR included, ESPN's order), `starterIds` lined up with `layout` (null for an
 * empty slot) and `reserveIds` (IR). Player IDs are strings, as the player
 * dictionary's keys are.
 *
 * An entry in a starting slot the layout lacks, or one more than the layout
 * has room for, is refused: it would be a starter with nowhere to go.
 */
export function arrangeLineup(entries, layout, { view, path }) {
  const starterIds = layout.map(() => null);
  const playerIds = [];
  const reserveIds = [];
  entries.forEach((entry, i) => {
    const id = String(entry.playerPoolEntry.player.id);
    playerIds.push(id);
    if (entry.lineupSlotId === BENCH_SLOT_ID) return;
    if (entry.lineupSlotId === IR_SLOT_ID) {
      reserveIds.push(id);
      return;
    }
    const at = layout.findIndex((s, k) => s.slotId === entry.lineupSlotId && starterIds[k] === null);
    if (at === -1) {
      throw new EspnShapeError(
        view,
        `${path}[${i}].lineupSlotId`,
        "names a starting slot the league's lineupSlotCounts do not have room for",
      );
    }
    starterIds[at] = id;
  });
  return { playerIds, starterIds, reserveIds };
}

// --- Format ------------------------------------------------------------------

/**
 * The format ESPN's settings imply: always redraft. ESPN has no dynasty format
 * the sources show (open question 25), and a keeper league is redraft for
 * weights and market values (decision 8). Guillotine is never detected.
 */
export function detectFormatType() {
  return 'redraft';
}

/** A keeper league: one that keeps any players (`draftSettings.keeperCount`, doc "League formats"). */
export function isKeeperLeague(settings) {
  return settings.draftSettings.keeperCount > 0;
}

/**
 * The resolved format. A declaration wins, as on Sleeper (src/format.mjs); a
 * declared dynasty is accepted. A declared guillotine is refused (decision 9).
 *
 * `keeper` flags a keeper league so the editions can mark keeper designations
 * unavailable (decision 8). It is a fact about the league, kept whatever the
 * declared type.
 */
export function resolveEspnFormat(settings, { declaredFormatType = null, startingSlots = [] } = {}) {
  const declared = parseDeclaredFormatType(declaredFormatType);
  if (declared === 'guillotine') {
    throw new EspnUnsupportedError(
      'LEAGUE_FORMAT is guillotine, and guillotine leagues are not supported on ESPN in this version (v1). ' +
        'Remove LEAGUE_FORMAT to cover this league as redraft, or declare dynasty.',
    );
  }
  const detectedType = detectFormatType(settings);
  const resolved = resolveFormatType({ declared, detected: detectedType });
  return {
    type: resolved.type,
    source: resolved.source,
    declaredType: declared,
    detectedType,
    keeper: isKeeperLeague(settings),
    scoring: deriveEspnScoringProfile(settings.scoringSettings.scoringItems, { startingSlots }),
  };
}

// --- Scoring -----------------------------------------------------------------

/** "Every N passing yards" stat IDs and their N (doc, "Scoring stat IDs"). */
const PASSING_YARD_STEPS = new Map([[5, 5], [6, 10], [7, 20], [8, 25], [9, 50], [10, 100]]);
const STAT = { PASSING_YARDS: 3, PASSING_TD: 4, INTERCEPTION_THROWN: 20, RECEPTION: 53 };

/** Why a scored item is listed though it may be ordinary (doc, "Scoring"). */
const NO_DEFAULTS_NOTE = 'ESPN default unknown (docs/espn-data.md, open question 5)';
const OVERRIDE_NOTE = 'a per-position override; what its key means is unknown (docs/espn-data.md, open question 5)';

/** What managers call a per-reception value. Same reading as the Sleeper profile. */
function receptionTier(base) {
  if (base === null) return 'unknown';
  if (base === 0) return 'standard';
  if (base === 0.5) return 'half-PPR';
  if (base === 1) return 'full PPR';
  return 'custom';
}

/** A stat's printable key and label. A stat ID the table lacks is reported, not dropped. */
function statNames(statId) {
  try {
    const stat = scoringStat(statId);
    return { key: stat.abbr, label: stat.label };
  } catch (error) {
    if (!(error instanceof EspnCodeError)) throw error;
    return { key: `STAT_${statId}`, label: `ESPN stat ${statId} (not in docs/espn-data.md)` };
  }
}

/**
 * How this league scores, in exactly the shape deriveScoringProfile returns
 * (src/sleeper/normalize.mjs): superflex, reception, passing, nonDefault,
 * notModelled and isDefault. Built from `scoringItems`, per the doc's
 * "Scoring" decision:
 *
 *   - reception base rate: stat 53; passing TD: stat 4; interceptions: stat 20;
 *   - passing yards: stat 3 as points per yard, or exactly one of the
 *     every-N-yards stats 5-10 converted to points per yard. Anything else
 *     (both, or several steps) leaves the rate null and sends those items to
 *     notModelled;
 *   - a stat the league does not list is null, not 0: whether an unlisted stat
 *     is unscored is open question 5;
 *   - pointsOverrides keys are not understood, so premiumPositions stays empty
 *     and every override goes to notModelled.
 *
 * There is no ESPN defaults table, so nonDefault cannot be a real difference:
 * it lists every scored item (and every override), each with a note saying
 * why, and isDefault is false. That is the safe direction: an ordinary setting
 * shown, never an unusual one hidden.
 */
export function deriveEspnScoringProfile(scoringItems, { startingSlots = [] } = {}) {
  const byStat = new Map();
  scoringItems.forEach((item, i) => {
    if (byStat.has(item.statId)) {
      throw new EspnShapeError('mSettings', `settings.scoringSettings.scoringItems[${i}].statId`, 'appears more than once');
    }
    byStat.set(item.statId, item);
  });
  const points = (statId) => (byStat.has(statId) ? byStat.get(statId).points : null);

  // Passing yards: one reading or none.
  const steps = [...PASSING_YARD_STEPS.keys()].filter((id) => byStat.has(id));
  let pointsPerYard = null;
  let passingYardStat = null;
  if (byStat.has(STAT.PASSING_YARDS) && steps.length === 0) {
    passingYardStat = STAT.PASSING_YARDS;
    pointsPerYard = points(STAT.PASSING_YARDS);
  } else if (!byStat.has(STAT.PASSING_YARDS) && steps.length === 1) {
    passingYardStat = steps[0];
    pointsPerYard = Number((points(steps[0]) / PASSING_YARD_STEPS.get(steps[0])).toPrecision(12));
  }
  const modelled = new Set([STAT.RECEPTION, STAT.PASSING_TD, STAT.INTERCEPTION_THROWN]);
  if (passingYardStat !== null) modelled.add(passingYardStat);

  const nonDefault = [];
  const notModelled = [];
  const sorted = [...byStat.values()].sort((a, b) => a.statId - b.statId);
  for (const item of sorted) {
    const { key, label } = statNames(item.statId);
    const entry = { key, label, value: item.points, default: null, note: NO_DEFAULTS_NOTE };
    nonDefault.push(entry);
    if (!modelled.has(item.statId)) notModelled.push(entry);
    for (const [overrideKey, value] of Object.entries(item.pointsOverrides)) {
      const override = {
        key: `${key}[override ${overrideKey}]`,
        label: `${label}, override under key ${overrideKey}`,
        value,
        default: null,
        note: OVERRIDE_NOTE,
      };
      nonDefault.push(override);
      notModelled.push(override);
    }
  }

  const base = points(STAT.RECEPTION);
  const byPosition = {};
  for (const position of ['RB', 'WR', 'TE']) {
    byPosition[position] = { perCatch: base === null ? null : round2(base), bonus: 0 };
  }

  return {
    superflex: startingSlots.includes('SUPER_FLEX') || startingSlots.filter((s) => s === 'QB').length > 1,
    reception: {
      base,
      tier: receptionTier(base),
      byPosition,
      premiumPositions: [],
    },
    passing: {
      touchdown: points(STAT.PASSING_TD),
      pointsPerYard,
      yardsPerPoint: pointsPerYard ? round2(1 / pointsPerYard) : null,
      interception: points(STAT.INTERCEPTION_THROWN),
    },
    nonDefault,
    notModelled,
    isDefault: false,
  };
}

// --- League ------------------------------------------------------------------

/** ESPN's playoffSeedingRule in plain words (doc, "League settings"). UNKNOWN is null. */
const PLAYOFF_SEEDING = {
  UNKNOWN: null,
  H2H_RECORD: 'head_to_head_record',
  TOTAL_POINTS_SCORED: 'total_points_scored',
  INTRA_DIVISION_RECORD: 'intra_division_record',
  TOTAL_POINTS_AGAINST: 'total_points_against',
  RAW_STAT: 'raw_stat',
};

/**
 * The first week of the playoffs: the first scoring period of the matchup
 * period after the regular season's last (`matchupPeriodCount`), when
 * `matchupPeriods` lists it. Otherwise null: no field reports it directly.
 */
function playoffWeekStart(scheduleSettings) {
  const first = scheduleSettings.matchupPeriods[String(scheduleSettings.matchupPeriodCount + 1)];
  return Array.isArray(first) && first.length > 0 ? Math.min(...first) : null;
}

/**
 * The last week that counts as scored (plan §9, R6; doc "Working out the
 * week"): ESPN reports no last fully scored week, so a week is settled only
 * once the league's current scoring period is past it. The season's final
 * week caps it. Null before any week has passed.
 */
function lastScoredWeek(body) {
  const week = Math.min(body.scoringPeriodId - 1, body.status.finalScoringPeriod);
  return week >= body.status.firstScoringPeriod ? week : null;
}

/**
 * The shared League from `mSettings` and `mDraftDetail` (the same request may
 * carry both).
 *
 * @param {{ mSettings: object, mDraftDetail: object }} responses
 * @param {{ leagueId: string|number, declaredFormatType?: string|null }} options
 *        `leagueId` is the configured ESPN_LEAGUE_ID; the declaration wins
 *        over detection and a misspelling throws.
 */
export function normalizeLeague({ mSettings, mDraftDetail }, { leagueId, declaredFormatType = null } = {}) {
  if (leagueId === undefined || leagueId === null || String(leagueId) === '') {
    throw new TypeError('normalizeLeague needs { leagueId }: the configured ESPN league ID');
  }
  guardSettings(mSettings);
  guardDraftDetail(mDraftDetail);

  const settings = mSettings.settings;
  const counts = settings.rosterSettings.lineupSlotCounts;
  const layout = startingSlotLayout(counts);
  const startingSlots = layout.map(({ slot }) => slot);
  const faab = settings.acquisitionSettings.isUsingAcquisitionBudget;
  const seeding = settings.scheduleSettings.playoffSeedingRule;
  const deadline = settings.tradeSettings?.deadlineDate;

  return {
    provider: 'espn',
    id: String(leagueId),
    name: settings.name,
    season: String(mSettings.seasonId),
    // Not reported by ESPN in any documented field.
    seasonType: null,
    status: null,
    // Only draftDetail.drafted is documented (open question 28): never 'drafting'.
    draftStatus: mDraftDetail.draftDetail.drafted ? 'complete' : 'pre_draft',
    sport: 'nfl',
    teamCount: settings.size,
    // espn-api takes the current week as scoringPeriodId, capped at the final one (doc, "Working out the week").
    currentWeek: Math.min(mSettings.scoringPeriodId, mSettings.status.finalScoringPeriod),
    lastScoredWeek: lastScoredWeek(mSettings),
    previousLeagueId: null,
    draftId: null,
    draftRounds: null,
    startingSlots,
    benchSlots: counts[BENCH_SLOT_ID] ?? 0,
    // ESPN has no taxi squad (doc, "Rosters and lineups"; assumed).
    taxiSlots: 0,
    reserveSlots: counts[IR_SLOT_ID] ?? 0,
    playoffTeams: settings.scheduleSettings.playoffTeamCount,
    playoffWeekStart: playoffWeekStart(settings.scheduleSettings),
    playoffSeeding: seeding === undefined ? null : PLAYOFF_SEEDING[seeding],
    // Sleeper's tradeDeadline is a week; ESPN reports a date, so it goes in its own field.
    tradeDeadline: null,
    tradeDeadlineDate: deadline === undefined ? null : new Date(deadline).toISOString(),
    waiverType: faab ? 'faab' : 'rolling',
    waiverBudget: faab ? settings.acquisitionSettings.acquisitionBudget : null,
    format: resolveEspnFormat(settings, { declaredFormatType, startingSlots }),
  };
}

// --- Teams -------------------------------------------------------------------

/**
 * The shared Teams from `mTeam` and `mRoster`, with `mSettings` for the
 * starting slots and the waiver type.
 *
 * `rosterId` is the ESPN team ID and `name` the team name. `manager` is the
 * owning member's `displayName` when ESPN sends one, and absent otherwise
 * (open question 27): it is never built from a first or last name, from
 * `teams[].owner`, or from anything else.
 *
 * Member IDs are not carried (no `ownerId` or `coOwnerIds`): they are in the
 * same braced form as the SWID cookie, and may be one, so they stay inside
 * src/espn/. Season potential points are not reported (null).
 */
export function normalizeTeams({ mTeam, mRoster, mSettings }) {
  guardSettings(mSettings);
  const faab = mSettings.settings.acquisitionSettings.isUsingAcquisitionBudget;
  guardTeams(mTeam, { faab });
  guardRosters(mRoster);
  const layout = startingSlotLayout(mSettings.settings.rosterSettings.lineupSlotCounts);

  const displayNames = new Map(
    mTeam.members.filter((m) => m.displayName !== undefined).map((m) => [m.id, m.displayName]),
  );
  const rosterIndex = new Map(mRoster.teams.map((t, i) => [t.id, i]));

  return mTeam.teams.map((team, i) => {
    const at = rosterIndex.get(team.id);
    if (at === undefined) {
      throw new EspnShapeError('mRoster', 'teams', `has no roster for the team at mTeam teams[${i}]`);
    }
    const lineup = arrangeLineup(mRoster.teams[at].roster.entries, layout, {
      view: 'mRoster',
      path: `teams[${at}].roster.entries`,
    });
    const manager = team.owners.length > 0 ? displayNames.get(team.owners[0]) : undefined;
    const overall = team.record.overall;
    return {
      rosterId: team.id,
      name: team.name,
      ...(manager !== undefined ? { manager } : {}),
      record: { wins: overall.wins, losses: overall.losses, ties: overall.ties },
      seasonPointsFor: round2(overall.pointsFor),
      seasonPointsAgainst: round2(overall.pointsAgainst),
      seasonPotentialPoints: null,
      waiverBudgetUsed: faab ? team.transactionCounter.acquisitionBudgetSpent : null,
      playerIds: lineup.playerIds,
      starterIds: lineup.starterIds,
      taxiIds: [],
      reserveIds: lineup.reserveIds,
    };
  });
}

// --- Players -----------------------------------------------------------------

/**
 * One ESPN player as the shared Player record: `{ id, name, position, team }`,
 * plus `injuryStatus` when the player has one.
 *
 * - position: positionFromEligibleSlots(eligibleSlots, fullName), the doc's
 *   rule; the name is needed for team defenses.
 * - team: the canonical NFL code through src/nflTeams.mjs; null for a free agent.
 * - injuryStatus: the printed label; absent when ESPN sends none or ACTIVE.
 * - age, yearsExp and status are absent: no source shows ESPN supplying an age
 *   or a birth date (open question 10), and absent is not null.
 *
 * Takes a player that has passed its shape guard (guardPlayers, or a roster's).
 */
export function normalizePlayer(player) {
  const injury = player.injuryStatus === undefined ? null : injuryStatusLabel(player.injuryStatus);
  return {
    id: String(player.id),
    name: player.fullName,
    position: positionFromEligibleSlots(player.eligibleSlots, player.fullName),
    team: proTeamCode(player.proTeamId),
    ...(injury ? { injuryStatus: injury } : {}),
  };
}

/** The players_wl list as the player dictionary, keyed by string ID. */
export function normalizePlayers(playersWl) {
  guardPlayers(playersWl);
  const players = {};
  for (const player of playersWl) players[String(player.id)] = normalizePlayer(player);
  return players;
}
