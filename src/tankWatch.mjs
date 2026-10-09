/**
 * The tank watch: a dynasty edition for the second half of the season about
 * the race for the top rookie picks, who owns them, and which picks jump if
 * their team crosses the playoff line.
 *
 * This module is the edition's gates and its facts. It decides whether a tank
 * watch may be written at all (a dynasty league, a declared rookie draft rule,
 * on or after its start week), and turns the projected draft order
 * (src/analysis/draftOrder.mjs) into the compact view the model reads. Every
 * absence becomes an `unavailable` entry with an instruction, as everywhere
 * else in src/promptContext.mjs.
 */
import { draftOrderMovement, pickLabel } from './analysis/draftOrder.mjs';
import { DRAFT_ORDER_CONFIG_FILE, draftOrderInWords, requireDraftOrderRule } from './rookieDraft.mjs';
import { prospectBoardUnavailable } from './prospectBoard.mjs';

/** The edition's task name, and the command that builds it. */
export const TANK_WATCH_TASK = 'tank-watch';

/** Where the start week is declared, for error messages. */
export const TANK_WATCH_START_WEEK_KEY = `tank_watch.start_week in ${DRAFT_ORDER_CONFIG_FILE}`;

/** The command-line flag that runs a tank watch before its start week. */
export const TANK_WATCH_EARLY_FLAG = '--early';

/** What each sort measures, in the words a gap between two picks is printed in. */
const SORT_UNITS = {
  max_points_for: 'max points-for',
  points_for: 'points-for',
  record: 'wins (a tie counts as half a win)',
};

/** Which side of the projected playoff line a pick's original team is on, in words. */
export const PLAYOFF_SIDE_IN_WORDS = { playoff: 'projected playoff team', non_playoff: 'projected to miss the playoffs' };

/**
 * Reads the declared start week, or refuses it. Absent means "open at the
 * regular season's midpoint"; anything present must be a week number.
 */
export function parseTankWatchStartWeek(value, { source = TANK_WATCH_START_WEEK_KEY } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `${source} is "${value}". Use a week number from 1, or leave it empty to open the tank watch ` +
        'at the midpoint of the regular season.',
    );
  }
  return value;
}

/**
 * The first completed week a tank watch may be written about: the declared
 * one, or else the midpoint of the regular season (which ends the week before
 * the playoffs start). With neither, there is no honest week to open on.
 */
export function resolveTankWatchStartWeek({ declared, league }) {
  if (declared) return { week: declared, source: 'declared' };
  const playoffWeekStart = league?.playoffWeekStart;
  if (!Number.isInteger(playoffWeekStart) || playoffWeekStart < 2) {
    throw new Error(
      'The league does not report when its playoffs start, so the middle of the regular season cannot be ' +
        `worked out. Set ${TANK_WATCH_START_WEEK_KEY} to the first week a tank watch should cover.`,
    );
  }
  return { week: Math.ceil((playoffWeekStart - 1) / 2), source: 'midpoint' };
}

const NOT_DYNASTY_BECAUSE = {
  redraft:
    'this is a redraft league, so there is no rookie draft: rosters are re-drafted every season and no ' +
    'pick carries over. There is nothing to tank for.',
  guillotine:
    'this is a guillotine league, where the lowest score each week is eliminated. A team that tanks is ' +
    'chopped, and there is no rookie draft order to race for.',
};

/**
 * Refuses a tank watch that cannot be written. Each check runs only when its
 * input is known, so the same gate serves twice: before Sleeper is contacted
 * (the declared format and the rule) and again once the league is open (the
 * resolved format and the week).
 *
 * @param formatType the league's format, or null when not yet known
 * @param rule       config.rookieDraft.order
 * @param week       the completed week the edition is about, or null
 * @param startWeek  from resolveTankWatchStartWeek, or null
 * @param early      the operator asked to run it before the start week
 */
export function refuseTankWatch({ formatType, rule, week = null, startWeek = null, early = false }) {
  if (formatType && formatType !== 'dynasty') {
    const because = NOT_DYNASTY_BECAUSE[formatType] ?? `this is a ${formatType} league, with no rookie draft.`;
    throw new Error(`\`${TANK_WATCH_TASK}\` is a dynasty edition: ${because}`);
  }

  requireDraftOrderRule(rule);

  if (week !== null && startWeek && week < startWeek.week && !early) {
    const where =
      startWeek.source === 'declared'
        ? `(${TANK_WATCH_START_WEEK_KEY})`
        : `(the middle of the regular season; set ${TANK_WATCH_START_WEEK_KEY} to change it)`;
    throw new Error(
      `The tank watch opens after week ${startWeek.week} has been played ${where}, and this is week ${week}. ` +
        'Before then the race for the top picks is mostly noise.\n\n' +
        `Run it again then, or pass ${TANK_WATCH_EARLY_FLAG} to run it now anyway.`,
    );
  }
}

const recordText = (record) =>
  record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : null;

/** A pick's holder, only when someone other than its original team holds it. */
const ownedBy = (slot) => (slot.traded ? { ownedBy: slot.owner } : {});

/** Every slot, compactly: the whole order, with each team's season so far. */
function orderView(draftOrder) {
  return draftOrder.slots.map((slot) => ({
    pick: slot.pick,
    team: slot.originalTeam,
    ...ownedBy(slot),
    ...(PLAYOFF_SIDE_IN_WORDS[slot.groupTeams] ? { side: PLAYOFF_SIDE_IN_WORDS[slot.groupTeams] } : {}),
    record: recordText(slot.record),
    pointsFor: slot.pointsFor,
    maxPointsFor: slot.maxPointsFor,
  }));
}

/**
 * The race for the top picks: every pick in the group that holds them, with
 * the gaps between neighbours in that group's own measure. A team further down
 * the order reaches the top picks only by changing groups — the cliff.
 */
function raceView(draftOrder) {
  const first = draftOrder.slots[0];
  const contenders = draftOrder.slots.filter((slot) => slot.group === first.group);
  return {
    measuredIn: SORT_UNITS[first.sort] ?? first.sort,
    picks: contenders.map((slot) => ({
      pick: slot.pick,
      team: slot.originalTeam,
      ...ownedBy(slot),
      record: recordText(slot.record),
      maxPointsFor: slot.maxPointsFor,
      pointsFor: slot.pointsFor,
      inTopPicks: slot.topLine.inside,
      gapToPickAbove: slot.gapToPrevious,
      gapToPickBelow: slot.gapToNext,
      marginToTopLine: slot.topLine.margin,
    })),
  };
}

/**
 * Every pick in the projected draft held by someone other than the team whose
 * finish decides it. Only round 1 carries a projected pick number; see
 * src/analysis/draftOrder.mjs for why later rounds do not.
 */
function stakesView(draftOrder) {
  return draftOrder.slots.flatMap((slot) =>
    slot.rounds
      .filter((round) => round.traded)
      .map((round) => ({
        pick: `${draftOrder.draftSeason} round ${round.round}`,
        round: round.round,
        originalTeam: slot.originalTeam,
        ownedBy: round.owner,
        projectedPick: round.round === 1 ? slot.pick : null,
      })),
  );
}

function cliffView(draftOrder) {
  return draftOrder.cliff.map((entry) => ({
    team: entry.originalTeam,
    ...ownedBy(entry),
    side: PLAYOFF_SIDE_IN_WORDS[entry.side],
    gamesFromLine: entry.gamesFromLine,
    pick: entry.pick,
    pickIfCrossed: entry.pickIfCrossed,
    picksMoved: entry.slotsMoved,
    swappedWith: entry.swappedWith.originalTeam,
  }));
}

function movementView(draftOrder, previousTankWatch) {
  const movement = draftOrderMovement(draftOrder, previousTankWatch?.draftOrder ?? null);
  if (!movement) return null;
  return {
    sinceWeek: previousTankWatch.week,
    picks: movement.map((entry) => ({
      team: entry.originalTeam,
      ...(entry.ownerRosterId !== entry.originalRosterId ? { ownedBy: entry.owner } : {}),
      pick: pickLabel(1, entry.slot),
      previousPick: entry.previousSlot === null ? null : pickLabel(1, entry.previousSlot),
      change: entry.change,
    })),
  };
}

/**
 * Everything a tank watch says about the draft, as facts.
 *
 * @param draftOrder        src/analysis/draftOrder.mjs#projectDraftOrder
 * @param rule              the declared rule the order came from
 * @param previousTankWatch the last tank watch before this one, as saved by
 *                          store.saveTankWatch, or null
 */
export function tankWatchView({ draftOrder, rule, teamCount, playoffTeams, previousTankWatch = null }) {
  const movement = movementView(draftOrder, previousTankWatch);
  return {
    draftSeason: draftOrder.draftSeason,
    status: draftOrder.status,
    rule: draftOrderInWords(rule, { teamCount, playoffTeams }),
    topPicks: `${pickLabel(1, 1)}-${pickLabel(1, draftOrder.topLine)}`,
    race: raceView(draftOrder),
    stakes: stakesView(draftOrder),
    cliff: cliffView(draftOrder),
    order: orderView(draftOrder),
    ...(movement ? { movement } : {}),
  };
}

/**
 * The prospects a tank watch may name: the top of the board, one per top
 * pick. The rest of the board is not part of this edition's prize.
 */
export function tankWatchPrize(board, topLine) {
  if (!board) return null;
  return { ...board, entries: board.entries.slice(0, topLine) };
}

/** What a tank watch does not know, each with the instruction that goes with it. */
export function tankWatchUnavailable({ tankWatch, prize, week }) {
  const missing = [];

  if (!tankWatch.movement) {
    missing.push({
      field: 'previousTankWatch',
      why: `No earlier tank watch has been recorded for the ${tankWatch.draftSeason} draft, so there is nothing to measure movement against.`,
      instruction:
        'Report no movement: no arrows, no "up" or "down", no previous picks. Say this is the first ' +
        'tank watch of the season if you mention it at all.',
    });
  }

  if (tankWatch.status !== 'actual') {
    missing.push({
      field: 'finalDraftOrder',
      why:
        `The order is projected from the standings after week ${week}. The regular season is not over, ` +
        'so no team has clinched or lost any pick.',
      instruction:
        'Call every pick projected. Never say a team has secured, locked up or clinched a pick, or that ' +
        'one is out of reach.',
    });
  }

  missing.push(
    {
      field: 'laterRoundPickNumbers',
      why:
        "The league has not declared whether later rounds run in the same order or snake, so only round 1 " +
        'picks have numbers.',
      instruction:
        'Give pick numbers (like 1.02) for round 1 only. Name a later-round pick by its round and original ' +
        'team, never as 2.07 or similar.',
    },
    {
      field: 'pickTradeHistory',
      why: 'Who holds each pick is known; when it was traded and what was given for it are not included.',
      instruction:
        'Say who holds a pick and whose finish decides it. Do not say when it moved, what it cost, or who ' +
        'won the deal.',
    },
    prospectBoardUnavailable(prize, { draftYear: Number(tankWatch.draftSeason) }),
  );

  return missing;
}
