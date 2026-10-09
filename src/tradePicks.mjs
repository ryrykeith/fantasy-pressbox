/**
 * Traded picks at their projected slot: what a trade grade knows about a pick
 * once the league's rookie draft order can be projected.
 *
 * A pick's market price (FantasyCalc's generic and Early/Mid/Late values) is
 * the same for every pick of its round. What separates Rebuild Szn's 1.02 from a
 * 1.07 is the declared draft-order rule applied to the standings
 * (src/analysis/draftOrder.mjs), the cliff a bubble team's pick falls off, and
 * the declared prospects around the slot (src/prospectBoard.mjs). This module
 * turns those into the facts each traded pick carries, and the `unavailable`
 * entries that go with them; src/promptContext.mjs places them.
 *
 * Only the draft this season's standings decide is projected. Only round 1 has
 * pick numbers, for the reason src/analysis/draftOrder.mjs gives.
 */
import { draftOrderInWords } from './rookieDraft.mjs';
import { PLAYOFF_SIDE_IN_WORDS } from './tankWatch.mjs';
import { prospectBoardUnavailable } from './prospectBoard.mjs';

/** How many board ranks either side of a pick's slot count as "around" it. */
export const BOARD_WINDOW = 1;

/**
 * The board entries ranked within BOARD_WINDOW of a round-1 slot: the class a
 * pick there is in range of, by the board's own ranking. Empty with no board.
 */
export function prospectsAroundPick(board, slot) {
  if (!board) return [];
  return board.entries.filter((entry) => Math.abs(entry.rank - slot) <= BOARD_WINDOW);
}

const boardLine = ({ rank, name, position }) => ({ rank, name, position });

/**
 * One traded pick's projection, or null when its draft is not the one
 * projected.
 *
 * @param pick       { season, round, originalRosterId }
 * @param draftOrder src/analysis/draftOrder.mjs#projectDraftOrder
 * @param board      the declared prospect board for that class, or null
 */
export function pickProjection(pick, { draftOrder, board = null }) {
  if (!draftOrder || String(pick.season) !== draftOrder.draftSeason) return null;
  const slot = draftOrder.slots.find((entry) => entry.originalRosterId === pick.originalRosterId);
  if (!slot) return null;

  const base = {
    projectedPick: pick.round === 1 ? slot.pick : null,
    of: draftOrder.slots.length,
    ...(PLAYOFF_SIDE_IN_WORDS[slot.groupTeams] ? { originalTeamSide: PLAYOFF_SIDE_IN_WORDS[slot.groupTeams] } : {}),
  };
  if (pick.round !== 1) return { ...base, originalTeamRound1Pick: slot.pick };

  const cliff = draftOrder.cliff.find((entry) => entry.originalRosterId === pick.originalRosterId);
  const around = prospectsAroundPick(board, slot.slot).map(boardLine);
  const aroundIfCrossed = cliff ? prospectsAroundPick(board, cliff.slotIfCrossed).map(boardLine) : [];
  return {
    ...base,
    ...(cliff
      ? {
          ifOriginalTeamCrosses: {
            pick: cliff.pickIfCrossed,
            picksMoved: cliff.slotsMoved,
            gamesFromLine: cliff.gamesFromLine,
            swappedWith: cliff.swappedWith.originalTeam,
          },
        }
      : {}),
    ...(board ? { boardAroundPick: around } : {}),
    ...(board && cliff ? { boardAroundPickIfCrossed: aroundIfCrossed } : {}),
  };
}

/** The projection every traded pick's slot comes from, labelled. */
export function draftProjectionView(draftOrder, { rule, teamCount, playoffTeams, asOfWeek }) {
  return {
    draftSeason: draftOrder.draftSeason,
    status: draftOrder.status,
    asOfWeek: asOfWeek ?? null,
    rule: draftOrderInWords(rule, { teamCount, playoffTeams }),
  };
}

/**
 * The board cut down to the entries some traded pick is around, so the trade
 * report carries every prospect it may name with its source and nothing else.
 * Null when there is no board, or no traded round-1 pick of its class.
 */
export function tradeProspectBoard(board, projections) {
  if (!board) return null;
  const ranks = new Set(
    projections.flatMap((projection) =>
      [...(projection.boardAroundPick ?? []), ...(projection.boardAroundPickIfCrossed ?? [])].map((entry) => entry.rank),
    ),
  );
  const projectsRound1 = projections.some((projection) => projection.projectedPick !== null);
  if (!projectsRound1) return null;
  return { ...board, entries: board.entries.filter((entry) => ranks.has(entry.rank)) };
}

const seasonsIn = (picks) => [...new Set(picks.map((pick) => String(pick.season)))].sort();

/** The refusal to place a pick, for the picks nothing projects. */
function noSlotEntry(why, scope) {
  return {
    field: 'projectedDraftSlot',
    why,
    instruction:
      `${scope}Do not place any pick in a tier (Early, Mid or Late), do not name a draft slot, and do not ` +
      'say a pick will land early or late. You may report the original team\'s record, points-for, max ' +
      'points-for and current seed, and quote the generic and tiered market values as the range a pick ' +
      'of that round trades for.',
  };
}

/**
 * What a trade grade does not know about the traded picks, each with its
 * instruction.
 *
 * @param picks           every pick that moved in the edition's trades
 * @param draftProjection draftProjectionView, or null when no order is projected
 * @param board           the board as it reached the context (tradeProspectBoard), or null
 */
export function tradePicksUnavailable({ picks, draftProjection, board }) {
  if (!picks.length) return [];
  if (!draftProjection) {
    return [
      noSlotEntry(
        "This league's rookie draft order is not projected for this edition: no projectable rule is " +
          'declared in config/rookie-draft.yml, or the league does not report how many teams make the ' +
          'playoffs. A pick\'s Early/Mid/Late tier cannot be read off its original team\'s record or points-for.',
        '',
      ),
    ];
  }

  const { draftSeason } = draftProjection;
  const projected = picks.filter((pick) => String(pick.season) === draftSeason);
  const unprojected = seasonsIn(picks.filter((pick) => String(pick.season) !== draftSeason));
  const missing = [];

  if (unprojected.length) {
    const seasons = unprojected.join(' and ');
    missing.push(
      noSlotEntry(
        `Only the ${draftSeason} draft is projected, from this season's standings. The ${seasons} ` +
          `draft${unprojected.length > 1 ? 's are' : ' is'} decided by seasons not yet played.`,
        `For a ${seasons} pick: `,
      ),
    );
  }

  if (!projected.length) return missing;

  if (draftProjection.status !== 'actual') {
    missing.push({
      field: 'finalDraftOrder',
      why:
        `Every \`projectedPick\` is the league's declared rule applied to the standings after week ` +
        `${draftProjection.asOfWeek}. The regular season is not over, so no pick's slot is settled.`,
      instruction:
        'Call every slot projected. Never say a pick is secured, locked in or guaranteed to land anywhere. ' +
        'Where `ifOriginalTeamCrosses` is present, say where the pick would move if its original team ' +
        'crossed the playoff line.',
    });
  }

  missing.push({
    field: 'projectedSlotAtTradeTime',
    why: 'The projection is from the current standings, not the standings on the day each trade was made.',
    instruction:
      'Do not say what either manager expected a pick to be when they traded it, or that a slot was known ' +
      'at the time. Grade the pick on where it projects now.',
  });

  if (projected.some((pick) => pick.round !== 1)) {
    missing.push({
      field: 'laterRoundPickNumbers',
      why:
        'The league has not declared whether later rounds run in the same order or snake, so only round 1 ' +
        'picks have numbers.',
      instruction:
        'Give pick numbers (like 1.07) for round 1 only. Name a later-round pick by its round and original ' +
        'team, never as 2.07 or similar. `originalTeamRound1Pick` says where that team picks in round 1, ' +
        'and only that.',
    });
  }

  if (projected.some((pick) => pick.round === 1)) {
    missing.push(prospectBoardUnavailable(board, { draftYear: Number(draftSeason) }));
    if (board) {
      missing.push({
        field: 'boardRankIsNotAvailability',
        why:
          "`boardAroundPick` lists the prospects the declared board ranks near the pick's slot. The board " +
          'ranks the class; it is not a mock draft, and who is left at a pick depends on every pick before it.',
        instruction:
          'Say a pick is in the range of those board prospects, as the board ranks them and naming its ' +
          'source. Do not say a pick will be, or will not be, any particular player.',
      });
    }
  }

  return missing;
}
