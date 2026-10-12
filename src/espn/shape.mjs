/**
 * Shape guards for ESPN responses.
 *
 * ESPN's API is unofficial, and no test league exists, so every shape in
 * docs/espn-data.md is a best guess (most are labelled "assumed"). These
 * guards turn a wrong guess into a loud error instead of a wrong fact:
 *
 *   - Each guard checks every field the normalizers read, in one view's response.
 *   - A missing field or a wrong type throws EspnShapeError, naming the view,
 *     the field path and docs/espn-data.md.
 *   - A missing number is never read as 0, a missing string as '', and a
 *     missing list as []. The one place a field may be absent is where the doc
 *     says it may be, and there the guard says so in a comment.
 *   - A guard returns the value it was given, untouched. It never fills in,
 *     coerces or trims anything.
 *   - A message names the *type* found, never the value: a response is
 *     untrusted, and no value from it is worth the risk of echoing.
 *
 * Scope: what the league, team, player and week normalizers will read. Of
 * draft detail (`mDraftDetail`), only `draftDetail.drafted` is read (doc,
 * "Draft picks"; open question 28): the picks themselves are not read in v1.
 */

export class EspnShapeError extends Error {
  /**
   * @param {string} view  the view or endpoint, e.g. "mSettings"
   * @param {string} path  the field path in that response, e.g. "teams[3].record.overall.wins"
   * @param {string} problem  what is wrong, e.g. "is missing"
   */
  constructor(view, path, problem) {
    super(
      `ESPN's ${view} response does not match the documented shape: ${path} ${problem}. ` +
        'ESPN support is experimental and its response shapes are unverified (see docs/espn-data.md). ' +
        'Nothing was guessed: this is the field ESPN did not supply as documented, and it needs checking ' +
        'against a real league response.',
    );
    this.name = 'EspnShapeError';
    this.view = view;
    this.path = path;
  }
}

// --- Documented value lists (docs/espn-data.md; all assumed) -----------------
const TRANSACTION_TYPES = [
  'DRAFT', 'TRADE_ACCEPT', 'WAIVER', 'TRADE_VETO', 'FUTURE_ROSTER', 'ROSTER', 'RETRO_ROSTER',
  'TRADE_PROPOSAL', 'TRADE_UPHOLD', 'FREEAGENT', 'TRADE_DECLINE', 'WAIVER_ERROR', 'TRADE_ERROR',
];
const ITEM_TYPES = ['NONE', 'LINEUP', 'ADD', 'DROP', 'DRAFT', 'UNDRAFT', 'DRAFT_TRADE'];
const WINNERS = ['HOME', 'AWAY', 'TIE', 'UNDECIDED'];
const PLAYOFF_SEEDING_RULES = [
  'UNKNOWN', 'H2H_RECORD', 'TOTAL_POINTS_SCORED', 'INTRA_DIVISION_RECORD', 'TOTAL_POINTS_AGAINST', 'RAW_STAT',
];

// --- Primitives ----------------------------------------------------------------
const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value);

function fail(view, path, problem) {
  throw new EspnShapeError(view, path, problem);
}

function object(view, path, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(view, path, value === undefined ? 'is missing' : `must be an object, found ${typeOf(value)}`);
  }
  return value;
}

function array(view, path, value) {
  if (!Array.isArray(value)) {
    fail(view, path, value === undefined ? 'is missing' : `must be a list, found ${typeOf(value)}`);
  }
  return value;
}

function number(view, path, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(view, path, value === undefined ? 'is missing' : `must be a number, found ${typeOf(value)}`);
  }
  return value;
}

function integer(view, path, value) {
  number(view, path, value);
  if (!Number.isInteger(value)) fail(view, path, 'must be a whole number');
  return value;
}

function string(view, path, value) {
  if (typeof value !== 'string' || value === '') {
    fail(view, path, value === undefined ? 'is missing' : `must be a non-empty string, found ${typeOf(value)}`);
  }
  return value;
}

function boolean(view, path, value) {
  if (typeof value !== 'boolean') {
    fail(view, path, value === undefined ? 'is missing' : `must be true or false, found ${typeOf(value)}`);
  }
  return value;
}

function oneOf(view, path, value, allowed) {
  string(view, path, value);
  if (!allowed.includes(value)) fail(view, path, `is not one of the values the doc lists (${allowed.join(', ')})`);
  return value;
}

/** Runs `check` on the field only when it is present. Absence is allowed only where the doc says so. */
function optional(value, check) {
  if (value !== undefined) check(value);
}

function each(view, path, list, check) {
  array(view, path, list).forEach((item, i) => check(`${path}[${i}]`, item));
}

// --- Players -----------------------------------------------------------------
/** One player: players_wl, or playerPoolEntry.player in a roster or lineup. */
function player(view, path, p) {
  object(view, path, p);
  integer(view, `${path}.id`, p.id);
  string(view, `${path}.fullName`, p.fullName);
  integer(view, `${path}.defaultPositionId`, p.defaultPositionId);
  each(view, `${path}.eligibleSlots`, p.eligibleSlots, (at, slot) => integer(view, at, slot));
  integer(view, `${path}.proTeamId`, p.proTeamId);
  // injuryStatus is assumed (doc, "Players"); when ESPN omits it, the field is simply absent downstream.
  optional(p.injuryStatus, (v) => string(view, `${path}.injuryStatus`, v));
  return p;
}

/** The players_wl list. */
export function guardPlayers(body) {
  const view = 'players_wl';
  each(view, '(response)', body, (path, p) => player(view, path, p));
  return body;
}

// --- Season endpoint --------------------------------------------------------
/**
 * `seasons/<year>`. The doc says only that it carries `currentScoringPeriod`;
 * `{ id }` is the shape the fixture guessed (open question 19), so anything
 * else is refused rather than interpreted.
 */
export function guardSeason(body) {
  const view = 'season';
  object(view, '(response)', body);
  object(view, 'currentScoringPeriod', body.currentScoringPeriod);
  integer(view, 'currentScoringPeriod.id', body.currentScoringPeriod.id);
  return body;
}

// --- League views ------------------------------------------------------------
/** Top-level fields every league response carries (doc, "League views"; "Working out the week"). */
function envelope(view, body) {
  object(view, '(response)', body);
  integer(view, 'seasonId', body.seasonId);
  integer(view, 'scoringPeriodId', body.scoringPeriodId);
  object(view, 'status', body.status);
  integer(view, 'status.currentMatchupPeriod', body.status.currentMatchupPeriod);
  integer(view, 'status.firstScoringPeriod', body.status.firstScoringPeriod);
  integer(view, 'status.finalScoringPeriod', body.status.finalScoringPeriod);
  // status.latestScoringPeriod is not checked: nothing reads it (doc, open question 18).
}

/** `mSettings`. */
export function guardSettings(body) {
  const view = 'mSettings';
  envelope(view, body);
  const s = object(view, 'settings', body.settings);
  string(view, 'settings.name', s.name);
  integer(view, 'settings.size', s.size);
  optional(s.isPublic, (v) => boolean(view, 'settings.isPublic', v));

  const sched = object(view, 'settings.scheduleSettings', s.scheduleSettings);
  integer(view, 'settings.scheduleSettings.matchupPeriodCount', sched.matchupPeriodCount);
  integer(view, 'settings.scheduleSettings.playoffTeamCount', sched.playoffTeamCount);
  const periods = object(view, 'settings.scheduleSettings.matchupPeriods', sched.matchupPeriods);
  for (const [key, scoringPeriods] of Object.entries(periods)) {
    const path = `settings.scheduleSettings.matchupPeriods.${key}`;
    if (!/^\d+$/.test(key)) fail(view, path, 'is keyed by something other than a matchup period number');
    each(view, path, scoringPeriods, (at, id) => integer(view, at, id));
  }
  // The seeding rule is read when present; the doc does not say it is always sent.
  optional(sched.playoffSeedingRule, (v) =>
    oneOf(view, 'settings.scheduleSettings.playoffSeedingRule', v, PLAYOFF_SEEDING_RULES));

  // tradeSettings.deadlineDate is absent when the league has no deadline (doc, "League settings").
  optional(s.tradeSettings, (trade) => {
    object(view, 'settings.tradeSettings', trade);
    optional(trade.deadlineDate, (v) => integer(view, 'settings.tradeSettings.deadlineDate', v));
  });

  const draft = object(view, 'settings.draftSettings', s.draftSettings);
  string(view, 'settings.draftSettings.type', draft.type);
  integer(view, 'settings.draftSettings.keeperCount', draft.keeperCount);
  boolean(view, 'settings.draftSettings.isTradingEnabled', draft.isTradingEnabled);

  const acq = object(view, 'settings.acquisitionSettings', s.acquisitionSettings);
  const faab = boolean(view, 'settings.acquisitionSettings.isUsingAcquisitionBudget', acq.isUsingAcquisitionBudget);
  // The budget is only meaningful, and only required, in a FAAB league.
  if (faab) number(view, 'settings.acquisitionSettings.acquisitionBudget', acq.acquisitionBudget);

  const counts = object(view, 'settings.rosterSettings.lineupSlotCounts', object(view, 'settings.rosterSettings', s.rosterSettings).lineupSlotCounts);
  for (const [key, count] of Object.entries(counts)) {
    const path = `settings.rosterSettings.lineupSlotCounts.${key}`;
    if (!/^\d+$/.test(key)) fail(view, path, 'is keyed by something other than a lineup slot ID');
    integer(view, path, count);
  }

  const scoring = object(view, 'settings.scoringSettings', s.scoringSettings);
  each(view, 'settings.scoringSettings.scoringItems', scoring.scoringItems, (path, item) => {
    object(view, path, item);
    integer(view, `${path}.statId`, item.statId);
    number(view, `${path}.points`, item.points);
    object(view, `${path}.pointsOverrides`, item.pointsOverrides);
  });
  return body;
}

/**
 * `mDraftDetail`. Only `draftDetail.drafted` is documented (doc, "Draft picks");
 * other draft states are open question 28, so nothing else is read.
 */
export function guardDraftDetail(body) {
  const view = 'mDraftDetail';
  envelope(view, body);
  const detail = object(view, 'draftDetail', body.draftDetail);
  boolean(view, 'draftDetail.drafted', detail.drafted);
  return body;
}

function teamEntry(view, path, entry, { week } = {}) {
  object(view, path, entry);
  integer(view, `${path}.lineupSlotId`, entry.lineupSlotId);
  const pool = object(view, `${path}.playerPoolEntry`, entry.playerPoolEntry);
  const p = player(view, `${path}.playerPoolEntry.player`, pool.player);
  if (week !== undefined) {
    // The week's points live in the stats entry with this scoringPeriodId and statSourceId 0 (doc, "Matchups").
    // A player may have no actual-points entry (bye, inactive, IR: open question 32). That is allowed and
    // left absent, never 0; the week normalizer decides per player. A present entry is type-checked.
    const stats = array(view, `${path}.playerPoolEntry.player.stats`, p.stats);
    const at = stats.findIndex((s) => s && s.scoringPeriodId === week && s.statSourceId === 0);
    if (at === -1) return;
    const statPath = `${path}.playerPoolEntry.player.stats[${at}]`;
    number(view, `${statPath}.appliedTotal`, stats[at].appliedTotal);
    // That week's team: not the player's current one (doc, "Matchups").
    integer(view, `${statPath}.proTeamId`, stats[at].proTeamId);
  }
}

/**
 * `mTeam`. `faab` says whether the league uses a FAAB budget (from mSettings):
 * only then must each team report what it has spent. Without FAAB, each must report its
 * waiver rank instead.
 */
export function guardTeams(body, { faab }) {
  const view = 'mTeam';
  if (typeof faab !== 'boolean') throw new TypeError('guardTeams needs { faab } from the settings');
  envelope(view, body);
  each(view, 'teams', body.teams, (path, t) => {
    object(view, path, t);
    integer(view, `${path}.id`, t.id);
    string(view, `${path}.name`, t.name);
    each(view, `${path}.owners`, t.owners, (at, owner) => string(view, at, owner));
    // Waiver order only matters to rolling-waiver coverage. The doc cannot say whether ESPN
    // spells it waiverRank or wavierRank (open question 33), so a FAAB league never needs it.
    if (!faab) integer(view, `${path}.waiverRank`, t.waiverRank);
    const overall = object(view, `${path}.record.overall`, object(view, `${path}.record`, t.record).overall);
    for (const field of ['wins', 'losses', 'ties']) integer(view, `${path}.record.overall.${field}`, overall[field]);
    for (const field of ['pointsFor', 'pointsAgainst']) number(view, `${path}.record.overall.${field}`, overall[field]);
    if (faab) {
      const counter = object(view, `${path}.transactionCounter`, t.transactionCounter);
      number(view, `${path}.transactionCounter.acquisitionBudgetSpent`, counter.acquisitionBudgetSpent);
    }
  });
  each(view, 'members', body.members, (path, m) => {
    object(view, path, m);
    string(view, `${path}.id`, m.id);
    // displayName: no source shows it (doc, open question 27). Absent means the manager
    // name is unavailable, which the doc allows; a present one must be a string.
    optional(m.displayName, (v) => string(view, `${path}.displayName`, v));
  });
  return body;
}

/** `mRoster`: every team's current roster. */
export function guardRosters(body) {
  const view = 'mRoster';
  envelope(view, body);
  each(view, 'teams', body.teams, (path, t) => {
    object(view, path, t);
    integer(view, `${path}.id`, t.id);
    const roster = object(view, `${path}.roster`, t.roster);
    each(view, `${path}.roster.entries`, roster.entries, (at, entry) => teamEntry(view, at, entry));
  });
  return body;
}

/**
 * The matchup views (`mMatchup`, `mMatchupScore`, `mScoreboard`), for the whole
 * season or, with `week`, one scoring period with each side's lineup.
 */
export function guardSchedule(body, { week } = {}) {
  const view = 'mMatchup/mMatchupScore/mScoreboard';
  envelope(view, body);
  if (week !== undefined) integer(view, 'week (argument)', week);
  each(view, 'schedule', body.schedule, (path, m) => {
    object(view, path, m);
    integer(view, `${path}.matchupPeriodId`, m.matchupPeriodId);
    oneOf(view, `${path}.winner`, m.winner, WINNERS);
    string(view, `${path}.playoffTierType`, m.playoffTierType);
    const side = (name, s) => {
      object(view, `${path}.${name}`, s);
      integer(view, `${path}.${name}.teamId`, s.teamId);
      number(view, `${path}.${name}.totalPoints`, s.totalPoints);
      if (week !== undefined) {
        const lineup = object(view, `${path}.${name}.rosterForCurrentScoringPeriod`, s.rosterForCurrentScoringPeriod);
        each(view, `${path}.${name}.rosterForCurrentScoringPeriod.entries`, lineup.entries, (at, entry) => teamEntry(view, at, entry, { week }));
      }
    };
    side('home', m.home);
    // A matchup with no away side is a bye (doc, "Matchups and weekly scores"): the one allowed absence.
    if (m.away !== undefined) side('away', m.away);
  });
  return body;
}

/** `mTransactions2`, for one scoring period. */
export function guardTransactions(body) {
  const view = 'mTransactions2';
  envelope(view, body);
  each(view, 'transactions', body.transactions, (path, t) => {
    object(view, path, t);
    string(view, `${path}.id`, typeof t.id === 'number' ? String(t.id) : t.id);
    oneOf(view, `${path}.type`, t.type, TRANSACTION_TYPES);
    string(view, `${path}.status`, t.status); // values unknown (doc, open question 6)
    integer(view, `${path}.scoringPeriodId`, t.scoringPeriodId);
    integer(view, `${path}.teamId`, t.teamId);
    // bidAmount: present on FAAB claims only (doc, "Transactions and waivers").
    optional(t.bidAmount, (v) => number(view, `${path}.bidAmount`, v));
    // processDate: when the move cleared, in epoch milliseconds (assumed). Absent means unknown, never now.
    optional(t.processDate, (v) => integer(view, `${path}.processDate`, v));
    // `items` may be an empty list (doc: TRADE_ACCEPT rows often are), but never absent.
    each(view, `${path}.items`, t.items, (at, item) => {
      object(view, at, item);
      oneOf(view, `${at}.type`, item.type, ITEM_TYPES);
      integer(view, `${at}.playerId`, item.playerId);
      integer(view, `${at}.fromTeamId`, item.fromTeamId);
      integer(view, `${at}.toTeamId`, item.toTeamId);
    });
  });
  return body;
}
