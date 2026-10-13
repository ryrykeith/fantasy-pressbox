/**
 * ESPN's numeric codes, turned into this project's vocabulary.
 *
 * Every table below is transcribed from docs/espn-data.md (generated from the
 * doc's tables, not retyped), which cites the two community clients it was read
 * from. ALL OF IT IS UNVERIFIED: no table has been checked against a live ESPN
 * league (docs/espn-data.md, "How to read this file").
 *
 * An unknown ID throws, naming the table and the ID. It is never skipped and
 * never defaulted. Open and undecided items are left out, not guessed:
 *   - there is no position ID table: the clients disagree on what
 *     defaultPositionId means (doc, open question 2), so a position comes from
 *     eligibleSlots (positionFromEligibleSlots);
 *   - pro team ID -1 ("Bye", JS client only) is not a team and is not listed;
 *   - ESPN's default points per stat and the keys of pointsOverrides are open
 *     (doc, open question 5) and are not modelled here.
 */

import { canonicalTeamCode } from '../nflTeams.mjs';

export class EspnCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EspnCodeError';
  }
}

function refuseUnknown(table, id) {
  throw new EspnCodeError(
    `Unknown ESPN ${table} ${JSON.stringify(id)}. It is not in docs/espn-data.md, so it is refused rather than guessed.`,
  );
}

// Lineup slot IDs. Source: espn-api football/constant.py:1-27 (POSITION_MAP) and
// JS client constants.js:7-34, via docs/espn-data.md "Lineup slot IDs". UNVERIFIED.
// Rows: [slot ID, espn-api name, shared slot (src/analysis/lineup.mjs) or null].
// The shared slot is a project decision; null means "not mapped: refused".
const LINEUP_SLOT_ROWS = [
  [0, "QB", "QB"],
  [1, "TQB", null],
  [2, "RB", "RB"],
  [3, "RB/WR", "WRRB_FLEX"],
  [4, "WR", "WR"],
  [5, "WR/TE", "REC_FLEX"],
  [6, "TE", "TE"],
  [7, "OP", "SUPER_FLEX"],
  [8, "DT", null],
  [9, "DE", null],
  [10, "LB", "LB"],
  [11, "DL", "DL"],
  [12, "CB", null],
  [13, "S", null],
  [14, "DB", "DB"],
  [15, "DP", "IDP_FLEX"],
  [16, "D/ST", "DEF"],
  [17, "K", "K"],
  [18, "P", null],
  [19, "HC", null],
  [20, "BE", "BN"],
  [21, "IR", "IR"],
  [22, "(empty string)", null],
  [23, "RB/WR/TE", "FLEX"],
  [24, "ER", null],
  [25, "Rookie", null],
];

// Pro team IDs. Source: espn-api football/constant.py:46-80 (PRO_TEAM_MAP) and
// JS client constants.js:80-114, via docs/espn-data.md "Pro team IDs". UNVERIFIED.
// Rows: [pro team ID, ESPN's spelling]. The canonical code is resolved through
// src/nflTeams.mjs. ID 0 (free agent, no team) is handled in proTeamCode.
const PRO_TEAM_ROWS = [
  [1, "ATL"],
  [2, "BUF"],
  [3, "CHI"],
  [4, "CIN"],
  [5, "CLE"],
  [6, "DAL"],
  [7, "DEN"],
  [8, "DET"],
  [9, "GB"],
  [10, "TEN"],
  [11, "IND"],
  [12, "KC"],
  [13, "LV"],
  [14, "LAR"],
  [15, "MIA"],
  [16, "MIN"],
  [17, "NE"],
  [18, "NO"],
  [19, "NYG"],
  [20, "NYJ"],
  [21, "PHI"],
  [22, "ARI"],
  [23, "PIT"],
  [24, "LAC"],
  [25, "SF"],
  [26, "SEA"],
  [27, "TB"],
  [28, "WSH"],
  [29, "CAR"],
  [30, "JAX"],
  [33, "BAL"],
  [34, "HOU"],
];

// Scoring stat IDs. Source: espn-api football/constant.py:255-491
// (SETTINGS_SCORING_FORMAT_MAP), via docs/espn-data.md "Scoring stat IDs".
// UNVERIFIED. Rows: [stat ID, abbreviation, label, scoring-profile field or
// null]. The field is set only for the four stats the doc's scoring decision
// names (53, 4, 3, 20): a dotted path into deriveScoringProfile's output.
const SCORING_STAT_ROWS = [
  [0, "PA", "Each Pass Attempted", null],
  [1, "PC", "Each Pass Completed", null],
  [2, "INC", "Each Incomplete Pass", null],
  [3, "PY", "Passing Yards", "passing.pointsPerYard"],
  [4, "PTD", "TD Pass", "passing.touchdown"],
  [5, "PY5", "Every 5 passing yards", null],
  [6, "PY10", "Every 10 passing yards", null],
  [7, "PY20", "Every 20 passing yards", null],
  [8, "PY25", "Every 25 passing yards", null],
  [9, "PY50", "Every 50 passing yards", null],
  [10, "PY100", "Every 100 passing yards", null],
  [11, "PC5", "Every 5 pass completions", null],
  [12, "PC10", "Every 10 pass completions", null],
  [13, "IP5", "Every 5 pass incompletions", null],
  [14, "IP10", "Every 10 pass incompletions", null],
  [15, "PTD40", "40+ yard TD pass bonus", null],
  [16, "PTD50", "50+ yard TD pass bonus", null],
  [17, "P300", "300-399 yard passing game", null],
  [18, "P400", "400+ yard passing game", null],
  [19, "2PC", "2pt Passing Conversion", null],
  [20, "INTT", "Interceptions Thrown", "passing.interception"],
  [21, "CPCT", "Passing Completion Pct", null],
  [22, "PYPG", "Passing Yards Per Game", null],
  [23, "RA", "Rushing Attempts", null],
  [24, "RY", "Rushing Yards", null],
  [25, "RTD", "TD Rush", null],
  [26, "2PR", "2pt Rushing Conversion", null],
  [27, "RY5", "Every 5 rushing yards", null],
  [28, "RY10", "Every 10 rushing yards", null],
  [29, "RY20", "Every 20 rushing yards", null],
  [30, "RY25", "Every 25 rushing yards", null],
  [31, "RY50", "Every 50 rushing yards", null],
  [32, "R100", "Every 100 rushing yards", null],
  [33, "RA5", "Every 5 rush attempts", null],
  [34, "RA10", "Every 10 rush attempts", null],
  [35, "RTD40", "40+ yard TD rush bonus", null],
  [36, "RTD50", "50+ yard TD rush bonus", null],
  [37, "RY100", "100-199 yard rushing game", null],
  [38, "RY200", "200+ yard rushing game", null],
  [39, "RYPA", "Rushing Yards Per Attempt", null],
  [40, "RYPG", "Rushing Yards Per Game", null],
  [41, "RECS", "Receptions", null],
  [42, "REY", "Receiving Yards", null],
  [43, "RETD", "TD Reception", null],
  [44, "2PRE", "2pt Receiving Conversion", null],
  [45, "RETD40", "40+ yard TD rec bonus", null],
  [46, "RETD50", "50+ yard TD rec bonus", null],
  [47, "REY5", "Every 5 receiving yards", null],
  [48, "REY10", "Every 10 receiving yards", null],
  [49, "REY20", "Every 20 receiving yards", null],
  [50, "REY25", "Every 25 receiving yards", null],
  [51, "REY50", "Every 50 receiving yards", null],
  [52, "RE100", "Every 100 receiving yards", null],
  [53, "REC", "Each reception", "reception.base"],
  [54, "REC5", "Every 5 receptions", null],
  [55, "REC10", "Every 10 receptions", null],
  [56, "REY100", "100-199 yard receiving game", null],
  [57, "REY200", "200+ yard receiving game", null],
  [58, "RET", "Receiving Target", null],
  [59, "YAC", "Receiving Yards After Catch", null],
  [60, "YPC", "Receiving Yards Per Catch", null],
  [61, "REYPG", "Receiving Yards Per Game", null],
  [62, "PTL", "Total 2pt Conversions", null],
  [63, "FTD", "Fumble Recovered for TD", null],
  [64, "SKD", "Sacked", null],
  [65, "PFUM", "Passing Fumbles", null],
  [66, "RFUM", "Rushing Fumbles", null],
  [67, "REFUM", "Receiving Fumbles", null],
  [68, "FUM", "Total Fumbles", null],
  [69, "PFUML", "Passing Fumbles Lost", null],
  [70, "RFUML", "Rushing Fumbles Lost", null],
  [71, "REFUML", "Receiving Fumbles Lost", null],
  [72, "FUML", "Total Fumbles Lost", null],
  [73, "TT", "Total Turnovers", null],
  [74, "FG50P", "FG Made (50+ yards)", null],
  [75, "FGA50P", "FG Attempted (50+ yards)", null],
  [76, "FGM50P", "FG Missed (50+ yards)", null],
  [77, "FG40", "FG Made (40-49 yards)", null],
  [78, "FGA40", "FG Attempted (40-49 yards)", null],
  [79, "FGM40", "FG Missed (40-49 yards)", null],
  [80, "FG0", "FG Made (0-39 yards)", null],
  [81, "FGA0", "FG Attempted (0-39 yards)", null],
  [82, "FGM0", "FG Missed (0-39 yards)", null],
  [83, "FG", "Total FG Made", null],
  [84, "FGA", "Total FG Attempted", null],
  [85, "FGM", "Total FG Missed", null],
  [86, "PAT", "Each PAT Made", null],
  [87, "PATA", "Each PAT Attempted", null],
  [88, "PATM", "Each PAT Missed", null],
  [89, "PA0", "0 points allowed", null],
  [90, "PA1", "1-6 points allowed", null],
  [91, "PA7", "7-13 points allowed", null],
  [92, "PA14", "14-17 points allowed", null],
  [93, "BLKKRTD", "Blocked Punt or FG return for TD", null],
  [94, "DEFRETTD", "Fumble or INT Return for TD", null],
  [95, "INT", "Each Interception", null],
  [96, "FR", "Each Fumble Recovered", null],
  [97, "BLKK", "Blocked Punt, PAT or FG", null],
  [98, "SF", "Each Safety", null],
  [99, "SK", "Each Sack", null],
  [100, "HALFSK", "1/2 Sack", null],
  [101, "KRTD", "Kickoff Return TD", null],
  [102, "PRTD", "Punt Return TD", null],
  [103, "INTTD", "Interception Return TD", null],
  [104, "FRTD", "Fumble Return TD", null],
  [105, "TRTD", "Total Return TD", null],
  [106, "FF", "Each Fumble Forced", null],
  [107, "TKA", "Assisted Tackles", null],
  [108, "TKS", "Solo Tackles", null],
  [109, "TK", "Total Tackles", null],
  [110, "TK3", "Every 3 Total Tackles", null],
  [111, "TK5", "Every 5 Total Tackles", null],
  [112, "STF", "Stuffs", null],
  [113, "PD", "Passes Defensed", null],
  [114, "KR", "Kickoff Return Yards", null],
  [115, "PR", "Punt Return Yards", null],
  [116, "KR10", "Every 10 kickoff return yards", null],
  [117, "KR25", "Every 25 kickoff return yards", null],
  [118, "PR10", "Every 10 punt return yards", null],
  [119, "PR25", "Every 25 punt return yards", null],
  [120, "PTSA", "Points Allowed", null],
  [121, "PA18", "18-21 points allowed", null],
  [122, "PA22", "22-27 points allowed", null],
  [123, "PA28", "28-34 points allowed", null],
  [124, "PA35", "35-45 points allowed", null],
  [125, "PA46", "46+ points allowed", null],
  [126, "PAPG", "Points Allowed Per Game", null],
  [127, "YA", "Yards Allowed", null],
  [128, "YA100", "Less than 100 total yards allowed", null],
  [129, "YA199", "100-199 total yards allowed", null],
  [130, "YA299", "200-299 total yards allowed", null],
  [131, "YA349", "300-349 total yards allowed", null],
  [132, "YA399", "350-399 total yards allowed", null],
  [133, "YA449", "400-449 total yards allowed", null],
  [134, "YA499", "450-499 total yards allowed", null],
  [135, "YA549", "500-549 total yards allowed", null],
  [136, "YA550", "550+ total yards allowed", null],
  [137, "YAPG", "Yards Allowed Per Game", null],
  [138, "PT", "Net Punts", null],
  [139, "PTY", "Punt Yards", null],
  [140, "PT10", "Punts Inside the 10", null],
  [141, "PT20", "Punts Inside the 20", null],
  [142, "PTB", "Blocked Punts", null],
  [143, "PTR", "Punts Returned", null],
  [144, "PTRY", "Punt Return Yards", null],
  [145, "PTTB", "Touchbacks", null],
  [146, "PTFC", "Fair Catches", null],
  [147, "PTAVG", "Punt Average", null],
  [148, "PTA44", "Punt Average 44.0+", null],
  [149, "PTA42", "Punt Average 42.0-43.9", null],
  [150, "PTA40", "Punt Average 40.0-41.9", null],
  [151, "PTA38", "Punt Average 38.0-39.9", null],
  [152, "PTA36", "Punt Average 36.0-37.9", null],
  [153, "PTA34", "Punt Average 34.0-35.9", null],
  [154, "PTA33", "Punt Average 33.9 or less", null],
  [155, "TW", "Team Win", null],
  [156, "TL", "Team Loss", null],
  [157, "TIE", "Team Tie", null],
  [158, "PTS", "Points Scored", null],
  [159, "PPG", "Points Scored Per Game", null],
  [160, "MGN", "Margin of Victory", null],
  [161, "WM25", "25+ point Win Margin", null],
  [162, "WM20", "20-24 point Win Margin", null],
  [163, "WM15", "15-19 point Win Margin", null],
  [164, "WM10", "10-14 point Win Margin", null],
  [165, "WM5", "5-9 point Win Margin", null],
  [166, "WM1", "1-4 point Win Margin", null],
  [167, "LM1", "1-4 point Loss Margin", null],
  [168, "LM5", "5-9 point Loss Margin", null],
  [169, "LM10", "10-14 point Loss Margin", null],
  [170, "LM15", "15-19 point Loss Margin", null],
  [171, "LM20", "20-24 point Loss Margin", null],
  [172, "LM25", "25+ point Loss Margin", null],
  [173, "MGNPG", "Margin of Victory Per Game", null],
  [174, "WINPCT", "Winning Pct", null],
  [175, "PTD0", "0-9 yd TD pass bonus", null],
  [176, "PTD10", "10-19 yd TD pass bonus", null],
  [177, "PTD20", "20-29 yd TD pass bonus", null],
  [178, "PTD30", "30-39 yd TD pass bonus", null],
  [179, "RTD0", "0-9 yd TD rush bonus", null],
  [180, "RTD10", "10-19 yd TD rush bonus", null],
  [181, "RTD20", "20-29 yd TD rush bonus", null],
  [182, "RTD30", "30-39 yd TD rush bonus", null],
  [183, "RETD0", "0-9 yd TD rec bonus", null],
  [184, "RETD10", "10-19 yd TD rec bonus", null],
  [185, "RETD20", "20-29 yd TD rec bonus", null],
  [186, "RETD30", "30-39 yd TD rec bonus", null],
  [187, "DPTSA", "D/ST Points Allowed", null],
  [188, "DPA0", "D/ST 0 points allowed", null],
  [189, "DPA1", "D/ST 1-6 points allowed", null],
  [190, "DPA7", "D/ST 7-13 points allowed", null],
  [191, "DPA14", "D/ST 14-17 points allowed", null],
  [192, "DPA18", "D/ST 18-21 points allowed", null],
  [193, "DPA22", "D/ST 22-27 points allowed", null],
  [194, "DPA28", "D/ST 28-34 points allowed", null],
  [195, "DPA35", "D/ST 35-45 points allowed", null],
  [196, "DPA46", "D/ST 46+ points allowed", null],
  [197, "DPAPG", "D/ST Points Allowed Per Game", null],
  [198, "FG50", "FG Made (50-59 yards)", null],
  [199, "FGA50", "FG Attempted (50-59 yards)", null],
  [200, "FGM50", "FG Missed (50-59 yards)", null],
  [201, "FG60", "FG Made (60+ yards)", null],
  [202, "FGA60", "FG Attempted (60+ yards)", null],
  [203, "FGM60", "FG Missed (60+ yards)", null],
  [204, "O2PRET", "Offensive 2pt Return", null],
  [205, "D2PRET", "Defensive 2pt Return", null],
  [206, "2PRET", "2pt Return", null],
  [207, "O1PSF", "Offensive 1pt Safety", null],
  [208, "D1PSF", "Defensive 1pt Safety", null],
  [209, "1PSF", "1pt Safety", null],
  [210, "GP", "Games Played", null],
  [211, "PFD", "Passing First Down", null],
  [212, "RFD", "Rushing First Down", null],
  [213, "REFD", "Receiving First Down", null],
  [214, "FGY", "FG Made Yards", null],
  [215, "FGMY", "FG Missed Yards", null],
  [216, "FGAY", "FG Attempt Yards", null],
  [217, "FGY5", "Every 5 FG Made yards", null],
  [218, "FGY10", "Every 10 FG Made yards", null],
  [219, "FGY20", "Every 20 FG Made yards", null],
  [220, "FGY25", "Every 25 FG Made yards", null],
  [221, "FGY50", "Every 50 FG Made yards", null],
  [222, "FGY100", "Every 100 FG Made yards", null],
  [223, "FGMY5", "Every 5 FG Missed yards", null],
  [224, "FGMY10", "Every 10 FG Missed yards", null],
  [225, "FGMY20", "Every 20 FG Missed yards", null],
  [226, "FGMY25", "Every 25 FG Missed yards", null],
  [227, "FGMY50", "Every 50 FG Missed yards", null],
  [228, "FGMY100", "Every 100 FG Missed yards", null],
  [229, "FGAY5", "Every 5 FG Attempt yards", null],
  [230, "FGAY10", "Every 10 FG Attempt yards", null],
  [231, "FGAY20", "Every 20 FG Attempt yards", null],
  [232, "FGAY25", "Every 25 FG Attempt yards", null],
  [233, "FGAY50", "Every 50 FG Attempt yards", null],
  [234, "FGAY100", "Every 100 FG Attempt yards", null],
];

const LINEUP_SLOTS = new Map(
  LINEUP_SLOT_ROWS.map(([id, name, slot]) => [id, Object.freeze({ id, name, slot })]),
);
const PRO_TEAMS = new Map(PRO_TEAM_ROWS);
const SCORING_STATS = new Map(
  SCORING_STAT_ROWS.map(([id, abbr, label, field]) => [id, Object.freeze({ id, abbr, label, field })]),
);

export const LINEUP_SLOT_IDS = Object.freeze([...LINEUP_SLOTS.keys()]);
export const PRO_TEAM_IDS = Object.freeze([0, ...PRO_TEAMS.keys()]);
export const SCORING_STAT_IDS = Object.freeze([...SCORING_STATS.keys()]);

function lookup(map, table, id) {
  const entry = map.get(id);
  if (entry === undefined) refuseUnknown(table, id);
  return entry;
}

/** The slot's ESPN name and shared slot, with no refusal (the slot may be unmapped). */
export function lineupSlotEntry(id) {
  return lookup(LINEUP_SLOTS, 'lineup slot ID', id);
}

/**
 * Lineup slot ID to the shared slot vocabulary (QB, FLEX, BN, ...). A slot the
 * doc marks "not mapped: refused" throws, naming the slot.
 */
export function lineupSlot(id) {
  const entry = lineupSlotEntry(id);
  if (entry.slot === null) {
    throw new EspnCodeError(
      `ESPN lineup slot ${id} (${JSON.stringify(entry.name)}) is not mapped to the shared slot vocabulary ` +
        'and is refused (docs/espn-data.md, "Lineup slot IDs"). A league that starts it is not supported.',
    );
  }
  return entry.slot;
}

/**
 * Pro team ID to the canonical NFL code, through src/nflTeams.mjs. ID 0 is the
 * doc's "free agent (no team)" and returns null; anything else unknown throws.
 */
export function proTeamCode(id) {
  if (id === 0) return null;
  return canonicalTeamCode(lookup(PRO_TEAMS, 'pro team ID', id));
}

/** Scoring stat ID to { id, abbr, label, field }. `field` is null when no profile field matches. */
export function scoringStat(id) {
  return lookup(SCORING_STATS, 'scoring stat ID', id);
}

// Injury statuses. Source: JS client constants.js INJURY_STATUSES, via
// docs/espn-data.md "Players". UNVERIFIED. Rows: [ESPN value, printed label or
// null]. The label is a project decision (doc, "Players"): ACTIVE means no
// injury and prints nothing, as Sleeper's healthy null does; INJURY_RESERVE and
// SUSPENSION take Sleeper's spellings IR and Sus; the rest are spelled out.
const INJURY_STATUS_ROWS = [
  ['ACTIVE', null],
  ['BEREAVEMENT', 'Bereavement'],
  ['DAY_TO_DAY', 'Day to day'],
  ['DOUBTFUL', 'Doubtful'],
  ['FIFTEEN_DAY_DL', '15-day DL'],
  ['INJURY_RESERVE', 'IR'],
  ['OUT', 'Out'],
  ['PATERNITY', 'Paternity'],
  ['PROBABLE', 'Probable'],
  ['QUESTIONABLE', 'Questionable'],
  ['SEVEN_DAY_DL', '7-day DL'],
  ['SIXTY_DAY_DL', '60-day DL'],
  ['SUSPENSION', 'Sus'],
  ['TEN_DAY_DL', '10-day DL'],
];
const INJURY_STATUSES = new Map(INJURY_STATUS_ROWS);

export const INJURY_STATUS_VALUES = Object.freeze([...INJURY_STATUSES.keys()]);

/**
 * ESPN's injuryStatus as the label a player line prints, or null for a healthy
 * player (ACTIVE). A value the doc does not list throws.
 */
export function injuryStatusLabel(value) {
  return lookup(INJURY_STATUSES, 'injury status', value);
}

/**
 * A player's position, from eligibleSlots and the player's full name, by
 * espn-api's rule (football/player.py:30-34, docs/espn-data.md "Positions"):
 * the first eligible slot for which either the slot is not 25 (Rookie) and its
 * name has no '/', or the player's own name has a '/'. The second clause gives
 * a team defense ("... D/ST", eligibleSlots like [16, 20, 21]) its position:
 * it takes the first slot whatever it is.
 *
 * Returns the espn-api slot NAME, never the shared slot. A position is not a
 * starting slot, so DT, DE, CB, S, P and HC are positions, not refusals. 'D/ST'
 * is rewritten to 'DEF'; no other name is rewritten. An unknown slot ID throws.
 * A chosen slot of BE (20), IR (21) or 22 means no position was found, and
 * throws, naming the player.
 */
export function positionFromEligibleSlots(eligibleSlots, fullName) {
  if (!Array.isArray(eligibleSlots)) {
    throw new EspnCodeError(
      `ESPN eligibleSlots must be an array of slot IDs, got ${JSON.stringify(eligibleSlots)}.`,
    );
  }
  const slashInName = typeof fullName === 'string' && fullName.includes('/');
  for (const id of eligibleSlots) {
    const entry = lineupSlotEntry(id);
    if (!slashInName && (id === 25 || entry.name.includes('/'))) continue;
    if (id === 20 || id === 21 || id === 22) break;
    return entry.name === 'D/ST' ? 'DEF' : entry.name;
  }
  throw new EspnCodeError(
    `ESPN player ${JSON.stringify(fullName)} has no position: eligibleSlots ${JSON.stringify(eligibleSlots)} ` +
      'reach no slot that is a position (a bench, IR or empty slot came first, or none qualified).',
  );
}
