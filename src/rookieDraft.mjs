/**
 * How a league's rookie draft is ordered.
 *
 * Sleeper does not report this. A league's settings carry the number of draft
 * rounds and playoff teams, and nothing about whether the order follows max
 * points-for, record or a lottery — and next season's rookie draft does not
 * exist in Sleeper until long after the order matters. So the rule is
 * DECLARED, in config/rookie-draft.yml, the way a guillotine league is.
 *
 * A rule is an ordered list of groups, each picking in sequence: which teams
 * the group holds, and how the group is sorted. Ascending means the lowest
 * value picks first. Group sizes are not declared — they come from the
 * league's number of playoff teams, which Sleeper does report.
 *
 * With no rule declared there is no projected draft order at all. Assuming the
 * usual "worst record picks first" would project picks to the wrong slots in
 * any league that does something else, with nothing to say so.
 *
 * This module is the declaration and nothing else: no provider field names and
 * no projection. It knows teams only through the normalized concepts
 * (`seasonPotentialPoints` is max points-for).
 */

/** Where the rule is declared, for error messages and doctor. */
export const DRAFT_ORDER_CONFIG_FILE = 'config/rookie-draft.yml';

/** Which teams a group holds. */
export const DRAFT_ORDER_TEAMS = ['non_playoff', 'playoff', 'all'];

/** How a group is sorted. */
export const DRAFT_ORDER_SORTS = ['max_points_for', 'points_for', 'record', 'lottery'];

/**
 * Sorts that are recognised but not projected.
 *
 * A lottery is common enough that refusing the word as a typo would be wrong,
 * but there is no honest way to project one as a single order: approximating
 * it with the pre-lottery standings would print picks in slots they will
 * probably not land in. So it is accepted at config load and refused when a
 * draft order is actually needed.
 */
export const UNSUPPORTED_DRAFT_ORDER_SORTS = ['lottery'];

/** Which end of a sort picks first. */
export const DRAFT_ORDER_DIRECTIONS = ['ascending', 'descending'];

const GROUP_KEYS = ['teams', 'sort', 'direction'];

/** The rule an error message offers as an example: the operator's own league. */
const EXAMPLE_RULE = `order:
  - teams: non_playoff
    sort: max_points_for
    direction: ascending
  - teams: playoff
    sort: max_points_for
    direction: ascending`;

const TEAMS_IN_WORDS = {
  non_playoff: (size) => `the ${size ?? ''} teams that miss the playoffs`,
  playoff: (size) => `the ${size ?? ''} playoff teams`,
  all: (size) => `all ${size ?? ''} teams`,
};

const SORT_IN_WORDS = {
  max_points_for: { ascending: 'lowest max points-for first', descending: 'highest max points-for first' },
  points_for: { ascending: 'lowest points-for first', descending: 'highest points-for first' },
  record: { ascending: 'worst record first', descending: 'best record first' },
};

function oneOf(source, label, value, valid) {
  const text = value === undefined || value === null ? '' : String(value).trim().toLowerCase();
  if (valid.includes(text)) return text;
  const shown = text === '' ? 'missing' : `"${String(value).trim()}"`;
  throw new Error(`${source}: ${label} is ${shown}. Use one of: ${valid.join(', ')}.`);
}

/**
 * Reads the declared `order`, or refuses it.
 *
 * Absent means "not declared" and returns null — never a default rule. Anything
 * present is checked in full here, at config load, so a typo stops every
 * command rather than surfacing weeks later in the one edition that projects
 * picks.
 */
export function parseDeclaredDraftOrder(value, { source = `order in ${DRAFT_ORDER_CONFIG_FILE}` } = {}) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${source} must be a list of groups, each picking in turn. For example:\n\n${EXAMPLE_RULE}`);
  }

  const groups = value.map((group, index) => {
    const where = `${source}, group ${index + 1}`;
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      throw new Error(`${where} must have teams, sort and direction. For example:\n\n${EXAMPLE_RULE}`);
    }
    const unknown = Object.keys(group).filter((key) => !GROUP_KEYS.includes(key));
    if (unknown.length) {
      throw new Error(`${where}: unrecognised ${unknown.join(', ')}. A group has only ${GROUP_KEYS.join(', ')}.`);
    }
    const teams = oneOf(where, 'teams', group.teams, DRAFT_ORDER_TEAMS);
    const sort = oneOf(where, 'sort', group.sort, DRAFT_ORDER_SORTS);
    // A lottery has no direction to declare; every other sort must say which
    // end picks first rather than have one assumed.
    const direction = UNSUPPORTED_DRAFT_ORDER_SORTS.includes(sort) && group.direction == null
      ? null
      : oneOf(where, 'direction', group.direction, DRAFT_ORDER_DIRECTIONS);
    return { teams, sort, direction };
  });

  checkCoverage(groups, source);
  return { groups };
}

/** Every team must land in exactly one group: either `all`, or both halves of the playoff line. */
function checkCoverage(groups, source) {
  const named = groups.map((group) => group.teams);
  const repeated = named.find((teams, index) => named.indexOf(teams) !== index);
  if (repeated) {
    throw new Error(`${source}: "${repeated}" is named more than once, which would put its teams in the draft twice.`);
  }
  if (named.includes('all') && named.length > 1) {
    throw new Error(
      `${source}: "all" already holds every team, so it cannot be combined with ` +
        `${named.filter((teams) => teams !== 'all').join(', ')}. Use "all" on its own, or ` +
        'split the league with non_playoff and playoff.',
    );
  }
  if (!named.includes('all')) {
    const missing = ['non_playoff', 'playoff'].filter((teams) => !named.includes(teams));
    if (missing.length) {
      throw new Error(
        `${source}: no group for ${missing.join(', ')}, so those teams would have no pick. ` +
          'Add a group for them, or use a single "all" group.',
      );
    }
  }
}

/**
 * The gate every draft-order projection passes through.
 *
 * Returns the rule when one is declared and can be projected; otherwise refuses,
 * saying exactly what to set.
 */
export function requireDraftOrderRule(rule) {
  if (!rule) {
    throw new Error(
      'No rookie draft order is declared, so Fantasy Pressbox cannot project where picks will land.\n\n' +
        'Sleeper does not report how a rookie draft is ordered, so it has to be written down: set ' +
        `\`order\` in ${DRAFT_ORDER_CONFIG_FILE}. For example, a league where the teams that miss the ` +
        'playoffs pick first and each group picks lowest max points-for first:\n\n' +
        `${EXAMPLE_RULE}\n\n` +
        `teams is one of ${DRAFT_ORDER_TEAMS.join(', ')}; sort is one of ` +
        `${DRAFT_ORDER_SORTS.filter((sort) => !UNSUPPORTED_DRAFT_ORDER_SORTS.includes(sort)).join(', ')}; ` +
        `direction is ${DRAFT_ORDER_DIRECTIONS.join(' or ')} (ascending: lowest picks first).`,
    );
  }
  const unsupported = rule.groups.find((group) => UNSUPPORTED_DRAFT_ORDER_SORTS.includes(group.sort));
  if (unsupported) {
    throw new Error(
      `The rookie draft order in ${DRAFT_ORDER_CONFIG_FILE} uses a ${unsupported.sort} for ` +
        `${unsupported.teams}, and a ${unsupported.sort} is not yet supported. Fantasy Pressbox will not ` +
        'approximate one with the standings, because that would print picks in slots they may not land in.',
    );
  }
  return rule;
}

/** Is the league's playoff field size usable for this rule's groups? */
function canSizeGroups(rule, { teamCount, playoffTeams }) {
  if (!Number.isInteger(teamCount) || teamCount <= 0) return false;
  if (rule.groups.every((group) => group.teams === 'all')) return true;
  return Number.isInteger(playoffTeams) && playoffTeams > 0 && playoffTeams <= teamCount;
}

/**
 * How many picks each group holds, and which.
 *
 * A group split on the playoff line needs the league's number of playoff
 * teams; without it (or with one that does not fit the league) there is no
 * honest size to give, so this refuses rather than guessing half.
 */
export function draftOrderGroupSizes(rule, { teamCount, playoffTeams }) {
  if (!canSizeGroups(rule, { teamCount, playoffTeams })) {
    throw new Error(
      `The rookie draft order splits teams on the playoff line, but the league's number of playoff ` +
        `teams is ${playoffTeams ?? 'not known'} for a ${teamCount}-team league.`,
    );
  }
  const sizeOf = { all: teamCount, playoff: playoffTeams, non_playoff: teamCount - playoffTeams };

  let nextPick = 1;
  return rule.groups.map((group) => {
    const size = sizeOf[group.teams];
    const slot = { teams: group.teams, size, firstPick: nextPick, lastPick: nextPick + size - 1 };
    nextPick += size;
    return slot;
  });
}

/**
 * The rule in plain words, for doctor.
 *
 * Pick ranges are shown when the league's size is known; otherwise each group
 * is described without them.
 */
export function describeDraftOrder(rule, { teamCount, playoffTeams } = {}) {
  if (!rule) {
    return [
      `Rookie draft order ✗ not declared — set \`order\` in ${DRAFT_ORDER_CONFIG_FILE} ` +
        'to project where picks will land',
    ];
  }

  // Without a usable playoff field size the groups are still worth showing,
  // just without pick numbers; draftOrderGroupSizes refuses loudly wherever a
  // projection actually depends on them.
  const sizes = canSizeGroups(rule, { teamCount, playoffTeams })
    ? draftOrderGroupSizes(rule, { teamCount, playoffTeams })
    : null;

  return [
    `Rookie draft order declared in ${DRAFT_ORDER_CONFIG_FILE}:`,
    ...rule.groups.map((group, index) => {
      const slot = sizes?.[index];
      const picks = slot ? `picks ${slot.firstPick}-${slot.lastPick}: ` : `group ${index + 1}: `;
      const who = TEAMS_IN_WORDS[group.teams](slot?.size).replace(/\s+/g, ' ');
      const how = UNSUPPORTED_DRAFT_ORDER_SORTS.includes(group.sort)
        ? `by ${group.sort} (not yet supported — no draft order can be projected)`
        : SORT_IN_WORDS[group.sort][group.direction];
      return `  ${picks}${who}, ${how}`;
    }),
  ];
}
