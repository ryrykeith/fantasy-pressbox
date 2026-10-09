/**
 * The projected rookie draft order: where every pick lands if the season ended
 * today, who holds it, and how far it would move if its team crossed the
 * playoff line.
 *
 * The draft projected is next season's (league.season + 1), the one this
 * season's standings decide. The order comes from the DECLARED rule
 * (src/rookieDraft.mjs) applied to the projected playoff field
 * (src/analysis/playoffField.mjs). Mid-season every number here is a
 * projection; `status` says so, inherited from the field.
 *
 * Pick ownership comes in already normalized
 * (src/sleeper/normalize.mjs#futurePickOwnership), so a traded pick is
 * reported by who holds it now — `owner` — everywhere it appears. The team
 * whose finish decides the slot is `originalTeam`.
 *
 * A slot is the original team's position in the order, and `pick` labels it in
 * round 1 ("1.07"). Later rounds are reported per slot with their owners but
 * without a pick number: whether the draft is linear or snakes is not declared,
 * and guessing would put round-2 picks in the wrong place.
 *
 * Numbers only, never prose — src/promptContext.mjs is where a fact turns into
 * an instruction to a model, the same separation src/analysis/danger.mjs keeps.
 */
import { draftOrderGroupSizes, requireDraftOrderRule } from '../rookieDraft.mjs';
import { projectPlayoffField } from './playoffField.mjs';
import { winScore } from './standings.mjs';

/** The race a tank watch reports: the picks that headline a class. */
export const TOP_PICKS_LINE = 3;

/** Each sort's value for a team. The value picks are measured apart in. */
const SORT_VALUE = {
  max_points_for: (team) => team.seasonPotentialPoints ?? 0,
  points_for: (team) => team.seasonPointsFor ?? 0,
  record: winScore,
};

/**
 * Ties break on the next measure in the same direction, then on roster id so
 * the order is stable: max points-for, then points-for; record, then
 * points-for; points-for, then max points-for.
 */
const TIEBREAK = {
  max_points_for: SORT_VALUE.points_for,
  points_for: SORT_VALUE.max_points_for,
  record: SORT_VALUE.points_for,
};

const round2 = (value) => Math.round(value * 100) / 100;

/** "1.07": round, then the slot zero-padded to two digits. */
export function pickLabel(round, slot) {
  return `${round}.${String(slot).padStart(2, '0')}`;
}

/** The draft season the current standings decide. */
export function projectedDraftSeason(league) {
  return String(Number(league.season) + 1);
}

/**
 * Teams in draft order under the rule, for one playoff field.
 *
 * @param playoffIds roster ids in the playoff field
 * @returns {{ team, group: number, groupTeams: string, sort: string, value: number }[]}
 */
function orderTeams(rule, sizes, teams, playoffIds) {
  const ordered = [];
  rule.groups.forEach((group, index) => {
    const members = teams.filter((team) => {
      if (group.teams === 'all') return true;
      return playoffIds.has(team.rosterId) === (group.teams === 'playoff');
    });
    if (members.length !== sizes[index].size) {
      throw new Error(
        `The rookie draft order expected ${sizes[index].size} teams in its ${group.teams} group but the ` +
          `projected field put ${members.length} there.`,
      );
    }
    const sign = group.direction === 'descending' ? -1 : 1;
    const value = SORT_VALUE[group.sort];
    const tiebreak = TIEBREAK[group.sort];
    const sorted = [...members].sort(
      (a, b) =>
        sign * (value(a) - value(b)) || sign * (tiebreak(a) - tiebreak(b)) || a.rosterId - b.rosterId,
    );
    for (const team of sorted) {
      ordered.push({ team, group: index + 1, groupTeams: group.teams, sort: group.sort, value: value(team) });
    }
  });
  return ordered;
}

/** Slot (1-based) of each original roster, for one playoff field. */
function slotsByRoster(ordered) {
  return new Map(ordered.map((entry, index) => [entry.team.rosterId, index + 1]));
}

/** Gap in the group's sort value to a neighbouring slot; null across a group boundary. */
function gap(entry, neighbour) {
  if (!neighbour || neighbour.group !== entry.group) return null;
  return round2(Math.abs(entry.value - neighbour.value));
}

/**
 * How far a slot sits from the top-`line` picks.
 *
 * `margin` is in the group's sort value: for a pick inside the line, how far
 * it is from the first pick outside it; for a pick outside, how far from the
 * last pick inside. Null when the two sit in different groups — a playoff
 * team does not reach the top picks on max points-for, only by missing the
 * playoffs, which is what `cliff` reports.
 */
function topLineDistance(ordered, index, line) {
  const slot = index + 1;
  const inside = slot <= line;
  const other = inside ? ordered[line] : ordered[line - 1];
  return {
    line,
    inside,
    slotsOutside: Math.max(0, slot - line),
    margin: gap(ordered[index], other),
  };
}

/**
 * The slots that would change if one team swapped sides of the playoff line
 * with another — the minimum it takes for a team to cross: someone takes its
 * place.
 */
function slotsIfSwapped({ rule, sizes, teams, playoffIds, a, b }) {
  const swapped = new Set(playoffIds);
  for (const rosterId of [a, b]) {
    if (swapped.has(rosterId)) swapped.delete(rosterId);
    else swapped.add(rosterId);
  }
  return slotsByRoster(orderTeams(rule, sizes, teams, swapped));
}

/**
 * @param league  normalized league: season, playoffTeams, playoffWeekStart,
 *                lastScoredWeek, draftRounds
 * @param teams   normalized teams (record, seasonPointsFor, seasonPotentialPoints)
 * @param rule    the declared rule, config.rookieDraft.order
 * @param picks   futurePickOwnership for the projected draft season; a pick
 *                absent from it is still owned by its original team
 * @param topLine how many picks the tank-watch race is for
 * @param bubbleGames how many games from the playoff line still counts as the
 *                bubble. The teams either side of the line are always on it,
 *                as is anyone tied with them.
 */
export function projectDraftOrder({
  league,
  teams,
  rule,
  picks = [],
  topLine = TOP_PICKS_LINE,
  bubbleGames = 0,
}) {
  requireDraftOrderRule(rule);
  const field = projectPlayoffField({ league, teams });
  const sizes = draftOrderGroupSizes(rule, { teamCount: teams.length, playoffTeams: league.playoffTeams });
  const playoffIds = new Set(field.field.map((entry) => entry.rosterId));
  const draftSeason = projectedDraftSeason(league);

  const nameOf = new Map(teams.map((team) => [team.rosterId, team.name]));
  const name = (rosterId) => nameOf.get(rosterId) ?? `Roster ${rosterId}`;
  const seasonPicks = picks.filter((pick) => String(pick.season) === draftSeason);
  const ownerOf = new Map(seasonPicks.map((pick) => [`${pick.round}:${pick.originalRosterId}`, pick.ownerRosterId]));
  const owner = (round, rosterId) => ownerOf.get(`${round}:${rosterId}`) ?? rosterId;
  const rounds = Math.max(
    Number.isInteger(league.draftRounds) && league.draftRounds > 0 ? league.draftRounds : 1,
    ...seasonPicks.map((pick) => pick.round),
  );

  /** A pick's identity: whose finish decides it, and who holds it now. */
  const holding = (rosterId) => {
    const ownerRosterId = owner(1, rosterId);
    return {
      originalRosterId: rosterId,
      originalTeam: name(rosterId),
      ownerRosterId,
      owner: name(ownerRosterId),
      traded: ownerRosterId !== rosterId,
    };
  };

  const ordered = orderTeams(rule, sizes, teams, playoffIds);
  const slots = ordered.map((entry, index) => {
    const { team } = entry;
    return {
      slot: index + 1,
      pick: pickLabel(1, index + 1),
      ...holding(team.rosterId),
      group: entry.group,
      groupTeams: entry.groupTeams,
      sort: entry.sort,
      record: team.record,
      pointsFor: team.seasonPointsFor ?? 0,
      maxPointsFor: team.seasonPotentialPoints ?? 0,
      gapToPrevious: gap(entry, ordered[index - 1]),
      gapToNext: gap(entry, ordered[index + 1]),
      topLine: topLineDistance(ordered, index, topLine),
      rounds: Array.from({ length: rounds }, (_, i) => {
        const ownerRosterId = owner(i + 1, team.rosterId);
        return { round: i + 1, ownerRosterId, owner: name(ownerRosterId), traded: ownerRosterId !== team.rosterId };
      }),
    };
  });

  return {
    draftSeason,
    status: field.status,
    topLine,
    rounds,
    slots,
    cliff: buildCliff({ rule, sizes, teams, field, playoffIds, slots, holding, bubbleGames }),
  };
}

/**
 * Where each bubble team's pick would land if it crossed the playoff line,
 * swapping places with the team on the other side of it (the first team out
 * for a playoff team, the last team in for one outside). Empty when no group
 * of the rule depends on the playoff line, since then crossing it moves
 * nothing.
 *
 * `slotsMoved` is positive when the pick gets earlier.
 */
function buildCliff({ rule, sizes, teams, field, playoffIds, slots, holding, bubbleGames }) {
  if (!field.bubble || rule.groups.every((group) => group.teams === 'all')) return [];
  const { lastIn, firstOut, gamesApart } = field.bubble;
  const reach = Math.max(bubbleGames, gamesApart);
  const slotOf = new Map(slots.map((slot) => [slot.originalRosterId, slot.slot]));

  const candidates = [
    ...field.field.map((entry) => ({
      entry,
      side: 'playoff',
      gamesFromLine: winScore(entry) - winScore(firstOut),
      partner: firstOut,
    })),
    ...field.out.map((entry) => ({
      entry,
      side: 'non_playoff',
      gamesFromLine: winScore(lastIn) - winScore(entry),
      partner: lastIn,
    })),
  ].filter((candidate) => candidate.gamesFromLine <= reach);

  return candidates
    .map(({ entry, side, gamesFromLine, partner }) => {
      const crossed = slotsIfSwapped({ rule, sizes, teams, playoffIds, a: entry.rosterId, b: partner.rosterId });
      const slot = slotOf.get(entry.rosterId);
      const slotIfCrossed = crossed.get(entry.rosterId);
      const partnerHolding = holding(partner.rosterId);
      return {
        ...holding(entry.rosterId),
        side,
        gamesFromLine,
        pick: slots[slot - 1].pick,
        slot,
        slotIfCrossed,
        pickIfCrossed: pickLabel(1, slotIfCrossed),
        slotsMoved: slot - slotIfCrossed,
        swappedWith: {
          originalRosterId: partnerHolding.originalRosterId,
          originalTeam: partnerHolding.originalTeam,
          ownerRosterId: partnerHolding.ownerRosterId,
          owner: partnerHolding.owner,
          slot: slotOf.get(partner.rosterId),
          slotIfCrossed: crossed.get(partner.rosterId),
        },
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

/**
 * Each pick's move since an earlier projection of the same draft, keyed by
 * the original team (a pick's identity does not change when it is traded).
 * `change` is positive when the pick got earlier. Null when there is nothing
 * comparable to measure against.
 */
export function draftOrderMovement(current, previous) {
  if (!current || !previous || previous.draftSeason !== current.draftSeason) return null;
  const before = new Map(previous.slots.map((slot) => [slot.originalRosterId, slot.slot]));
  return current.slots.map((slot) => {
    const previousSlot = before.get(slot.originalRosterId) ?? null;
    return {
      originalRosterId: slot.originalRosterId,
      originalTeam: slot.originalTeam,
      ownerRosterId: slot.ownerRosterId,
      owner: slot.owner,
      slot: slot.slot,
      previousSlot,
      change: previousSlot === null ? null : previousSlot - slot.slot,
    };
  });
}
