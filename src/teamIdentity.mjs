/**
 * Which roster a team name refers to.
 *
 * Sleeper lets a manager rename their team at any moment, and plenty do in the
 * middle of a season. Everything this project publishes is written in names —
 * rankings, called games, called chops — because names are what the league
 * reads. But a name is not an identity: "user4817" ranked third one week
 * and "Pick Six Appeal" first the next are the same roster, and anything that
 * matches the two by name concludes they are different teams.
 *
 * roster_id is the only identity that survives a rename. This module turns the
 * names in published history back into roster ids, so history can be compared
 * across renames without ever being rewritten. Published files keep the name
 * that was printed; the roster id is worked out when they are read.
 */

const normalise = (name) => String(name ?? '').trim().toLowerCase();

/**
 * @param teams    the league's teams now: `[{ rosterId, name, manager }]`
 * @param history  every name a roster has been published under, as recorded
 *                 in weekly snapshots: `[{ week, rosterId, name }]`
 */
export function createTeamIdentity({ teams, history = [] }) {
  const current = new Map(teams.map((team) => [team.rosterId, team]));

  // A name that has meant more than one roster cannot be resolved by name
  // alone — one team may have taken another's old name. Those resolve to null
  // here and are only settled by the week-specific lookup below, if at all.
  const indexOf = (pairs) => {
    const index = new Map();
    for (const { rosterId, name } of pairs) {
      const key = normalise(name);
      if (!key) continue;
      if (!index.has(key)) index.set(key, rosterId);
      else if (index.get(key) !== rosterId) index.set(key, null);
    }
    return index;
  };

  const byCurrentName = indexOf(teams.map((team) => ({ rosterId: team.rosterId, name: team.name })));
  const byPastName = indexOf(history);
  // Sleeper shows a manager's username until they name their team, so a team
  // that was never named was published under its manager's username. That is
  // exactly how "user4817" became "Pick Six Appeal".
  const byManager = indexOf(teams.map((team) => ({ rosterId: team.rosterId, name: team.manager })));
  const byWeek = new Map();
  for (const entry of history) {
    if (!byWeek.has(entry.week)) byWeek.set(entry.week, []);
    byWeek.get(entry.week).push(entry);
  }

  return {
    /**
     * The roster a name refers to, or null when it cannot be told.
     *
     * @param week  the week the name was published, when known. The names a
     *              week's own snapshot recorded are the most direct evidence of
     *              what a name meant that week, so they are tried first.
     */
    rosterIdFor(name, { week = null } = {}) {
      const key = normalise(name);
      if (!key) return null;
      if (week !== null && byWeek.has(week)) {
        const hit = indexOf(byWeek.get(week)).get(key);
        if (hit !== undefined && hit !== null) return hit;
      }
      for (const index of [byCurrentName, byPastName, byManager]) {
        const hit = index.get(key);
        if (hit !== undefined) return hit; // null here means ambiguous: stop, do not guess
      }
      return null;
    },

    /** The name a roster goes by now. */
    currentNameOf(rosterId) {
      return current.get(rosterId)?.name ?? null;
    },

    teams,
  };
}

/**
 * Attaches a roster id to every entry that names a team.
 *
 * Entries that already carry one keep it — a roster id recorded at publication
 * time is better evidence than any name lookup made afterwards.
 *
 * @returns `{ entries, unresolved }` — `unresolved` lists the names no roster
 *          could be found for, so the caller can refuse rather than guess
 */
export function attachRosterIds(entries, identity, { week = null } = {}) {
  const unresolved = [];
  const resolved = (entries || []).map((entry) => {
    if (entry.rosterId !== undefined && entry.rosterId !== null) return entry;
    const rosterId = identity.rosterIdFor(entry.team, { week });
    if (rosterId === null) unresolved.push(entry.team);
    return { ...entry, rosterId };
  });
  return { entries: resolved, unresolved };
}

/**
 * Last week's ranking, ready to show this week's model.
 *
 * Each team is listed under the name it goes by now, so the model can match it
 * against this week's rosters, and `formerly` keeps the name it was published
 * under so a rename can be noticed and mentioned rather than mistaken for a new
 * team. The published file itself is never changed.
 *
 * @returns `{ rankings, renamed, unresolved }` alongside the original fields
 */
export function presentPreviousRankings(previous, identity) {
  if (!previous) return null;
  const { entries, unresolved } = attachRosterIds(previous.rankings, identity, { week: previous.week ?? null });
  const renamed = [];
  const rankings = entries.map((entry) => {
    const now = entry.rosterId === null ? null : identity.currentNameOf(entry.rosterId);
    if (!now || now === entry.team) return { ...entry };
    renamed.push({ from: entry.team, to: now });
    return { ...entry, team: now, formerly: entry.team };
  });
  return { ...previous, rankings, renamed, unresolved };
}

/**
 * Explains a name nobody can be matched to, in terms an operator can act on.
 */
export function describeUnresolved(names, identity) {
  const known = identity.teams.map((team) => `  ${team.name} (manager ${team.manager})`).join('\n');
  return (
    `These team names do not match any team in the league: ${names.map((n) => `"${n}"`).join(', ')}.\n` +
    'Fix the spelling in the JSON block and record again. The teams are:\n' +
    known
  );
}
