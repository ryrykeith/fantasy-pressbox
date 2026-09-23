/**
 * Who is still alive in a guillotine league, and who was chopped in which week.
 *
 * This is the spine of every guillotine edition: there are no matchups, no
 * records and no standings in the ordinary sense, only a shrinking field. Get
 * this wrong and the publication reports on teams that are not in the league.
 *
 * Sleeper has no elimination field, and never will — commissioners run the
 * format by hand, removing the chopped team's owner and force-dropping its
 * players to the waiver pool each week. Over the API the league still looks
 * like an ordinary head-to-head one. So elimination has to come from two
 * unreliable signals and one reliable declaration:
 *
 *   derived    the lowest scorer among the teams still alive that week,
 *              confirmed by that roster now being ownerless or unable to field
 *              a lineup. Both halves depend on a human having done manual work
 *              promptly and correctly.
 *   declared   an operator-maintained week -> team ledger in
 *              config/guillotine.yml. Nothing about it can go stale.
 *
 * The declaration always wins. But a derivation that contradicts it is
 * reported, never swallowed: the two disagreeing means one of them is wrong,
 * and deciding which is not something this module can do from numbers.
 *
 * When neither settles a week, the week is left UNRESOLVED with its candidate
 * named. An edition that says "we do not know yet who was chopped" is
 * recoverable; one that names the wrong team is not — and in this format that
 * error compounds, because every later week is computed against the wrong set
 * of survivors.
 *
 * One known limitation, and the strongest argument for writing the ledger down:
 * a roster's state is only ever *current*. Sleeper does not report what a
 * roster looked like in week 2, so re-running an old week reads today's rosters
 * for the confirmation. That is harmless while the chops and the scores agree —
 * the lowest scorer in a week is the team that was emptied — and it is exactly
 * the case where they *disagree* that a derivation should not be trusted at all.
 *
 * This module produces data only, never prose. The lines doctor prints live in
 * src/eliminationReport.mjs.
 */

/** Where an operator declares eliminations. Named in every error this module throws. */
export const DECLARED_LEDGER_SOURCE = 'config/guillotine.yml';

/**
 * What is known about one week.
 *
 * `unresolved` is the load-bearing one. It is not an error state — it is the
 * honest answer for a week that has been played but whose chop has not been
 * processed in Sleeper, which is every Monday in every guillotine league.
 */
export const WEEK_STATUS = {
  /** No scores for this week yet. */
  NOT_PLAYED: 'not-played',
  /** Played, but nothing settles who was chopped. The candidate is still named. */
  UNRESOLVED: 'unresolved',
  /** A team is out, either declared or derived-and-confirmed. */
  ELIMINATED: 'eliminated',
  /** Fewer than two teams are still alive: there is no chop left to make. */
  DECIDED: 'decided',
};

/**
 * Reads the declared ledger out of config/guillotine.yml.
 *
 * The shape is a map of week number to team name, mirroring `ranking_emoji` in
 * config/editorial.yml — a table an operator edits by hand, where the keys are
 * numbers and the whole thing is one value rather than a bag of independent
 * ones.
 *
 * Every complaint here is about a typo in a file a human wrote, so all of them
 * stop the run. A ledger that silently skipped the line it could not read
 * would report the wrong survivors for every week after it, with nothing
 * saying so.
 */
export function parseDeclaredEliminations(eliminations, { source = DECLARED_LEDGER_SOURCE } = {}) {
  if (eliminations === null || eliminations === undefined) return [];
  if (typeof eliminations !== 'object' || Array.isArray(eliminations)) {
    throw new Error(
      `${source} "eliminations" must be a map of week number to team name, like:\n\n` +
        '  eliminations:\n    1: "Bye Week Blues"\n    2: "Faab Hoarders"\n',
    );
  }

  const entries = [];
  for (const [rawWeek, rawTeam] of Object.entries(eliminations)) {
    const key = String(rawWeek).trim();
    if (!/^\d+$/.test(key) || Number.parseInt(key, 10) < 1) {
      throw new Error(
        `${source} "eliminations" has a key "${rawWeek}" that is not a week number. ` +
          'Keys are the week the chop happened: 1, 2, 3...',
      );
    }
    const week = Number.parseInt(key, 10);
    const team = rawTeam === null || rawTeam === undefined ? '' : String(rawTeam).trim();
    if (team === '') {
      throw new Error(
        `${source} "eliminations" week ${week} names no team. Write the name Sleeper shows ` +
          '(or the roster id), or delete the line until you know it — a blank line here would ' +
          'quietly shift every later week onto the wrong survivors.',
      );
    }
    entries.push({ week, team });
  }

  return entries.sort((a, b) => a.week - b.week);
}

/**
 * Turns a declared team reference into a roster id.
 *
 * Operators write the name the league uses, because that is the handle they
 * can actually see in Sleeper. A roster id is accepted too, for the league
 * whose teams rename themselves mid-season — a name wins over an id when both
 * could match, since a team really called "7" is the more likely intent than a
 * roster number typed without saying so.
 */
export function resolveTeamReference(reference, teams, { week, source = DECLARED_LEDGER_SOURCE } = {}) {
  const text = String(reference ?? '').trim();
  const exact = teams.filter((team) => team.name === text);
  const loose = teams.filter((team) => String(team.name).trim().toLowerCase() === text.toLowerCase());
  const matched = exact.length ? exact : loose;

  if (matched.length === 1) return matched[0].rosterId;
  if (matched.length > 1) {
    throw new Error(
      `${source} week ${week} names "${text}", but ${matched.length} teams in this league are ` +
        `called that. Use the roster id instead: ${matched.map((t) => t.rosterId).join(' or ')}.`,
    );
  }

  if (/^\d+$/.test(text)) {
    const byRosterId = teams.find((team) => String(team.rosterId) === text);
    if (byRosterId) return byRosterId.rosterId;
  }

  throw new Error(
    `${source} week ${week} names "${text}", which is not a team in this league.\n` +
      `Teams: ${teams.map((t) => `${t.name} (roster ${t.rosterId})`).join(', ')}`,
  );
}

/**
 * Does this roster look like one the commissioner has already chopped?
 *
 * Both signals are side effects of the manual work the format requires: the
 * owner is removed, and the players are force-dropped to the waiver pool.
 * Either alone is enough — a commissioner half way through the job has still
 * chopped the team.
 *
 * "Emptied" is measured against the league's own starting lineup rather than a
 * fixed number of players, because the fact that matters is that the roster
 * can no longer field a legal lineup. That is true of a stripped roster in a
 * nine-slot league and in a three-slot one, and it does not need a threshold
 * invented for it.
 */
export function chopSignature(team, { startingSlotCount = 0 } = {}) {
  const signals = [];
  const players = team?.playerIds?.length ?? 0;

  if (!team?.ownerId) signals.push('no owner');
  if (startingSlotCount > 0) {
    if (players < startingSlotCount) {
      signals.push(`${players} player${players === 1 ? '' : 's'} for ${startingSlotCount} starting slots`);
    }
  } else if (players === 0) {
    signals.push('no players');
  }

  return { chopped: signals.length > 0, signals };
}

/** Did this week actually happen? A stored `played` flag wins over guessing from the scores. */
function wasPlayed(weekData) {
  if (!weekData) return false;
  if (typeof weekData.played === 'boolean') return weekData.played;
  return (weekData.scores ?? []).some((entry) => entry.points > 0);
}

/**
 * Builds the ledger.
 *
 * @param teams          normalized teams (src/sleeper/normalize.mjs#normalizeTeams)
 * @param weeks          `[{ week, played, scores: [{ rosterId, points }] }]`, any order
 * @param declared       `[{ week, team }]` from parseDeclaredEliminations
 * @param startingSlots  the league's starting lineup, for the chop signature
 * @param throughWeek    the last week to account for; defaults to the latest supplied
 */
export function buildEliminationLedger({
  teams = [],
  weeks = [],
  declared = [],
  startingSlots = [],
  throughWeek = null,
  source = DECLARED_LEDGER_SOURCE,
} = {}) {
  const startingSlotCount = startingSlots.length;
  const roster = teams.map((team) => ({ rosterId: team.rosterId, team: team.name }));
  const nameOf = new Map(roster.map((entry) => [entry.rosterId, entry.team]));

  // Before a ball is kicked every roster is empty, so every roster carries the
  // chop signature. Reading it then would eliminate the whole league in week 1.
  const seasonStarted = weeks.some(wasPlayed);
  const choppedNow = new Map(
    seasonStarted
      ? teams
          .map((team) => [team.rosterId, chopSignature(team, { startingSlotCount })])
          .filter(([, signature]) => signature.chopped)
          .map(([rosterId, signature]) => [rosterId, signature.signals])
      : [],
  );

  const declaredByWeek = new Map(
    declared.map((entry) => [
      entry.week,
      {
        rosterId: resolveTeamReference(entry.team, teams, { week: entry.week, source }),
        declaredAs: String(entry.team).trim(),
      },
    ]),
  );

  const byWeek = new Map(weeks.map((entry) => [entry.week, entry]));
  const lastWeek = Number.isInteger(throughWeek) && throughWeek > 0
    ? throughWeek
    : weeks.reduce((max, entry) => Math.max(max, entry.week), 0);

  const alive = new Set(roster.map((entry) => entry.rosterId));
  const history = [];
  const warnings = [];
  const weekRecords = [];

  for (let week = 1; week <= lastWeek; week++) {
    const data = byWeek.get(week);
    const played = wasPlayed(data);
    const scores = data?.scores ?? [];
    const contenders = scores.filter((entry) => alive.has(entry.rosterId));
    const record = { week, status: null };

    if (played) {
      const scored = new Set(scores.map((entry) => entry.rosterId));
      const missing = [...alive].filter((rosterId) => !scored.has(rosterId));
      if (missing.length) {
        warnings.push(
          `Week ${week}: no score for ${missing.map((id) => nameOf.get(id)).join(', ')}, ` +
            'so they were left out of that week\'s chop.',
        );
      }
    }

    // A chop needs at least two teams to choose between. With one left the
    // league has its survivor and nothing more can happen.
    const lowest = contenders.length >= 2 ? Math.min(...contenders.map((e) => e.points)) : null;
    const tied = lowest === null ? [] : contenders.filter((entry) => entry.points === lowest);
    const asCandidate = (entry) => ({
      rosterId: entry.rosterId,
      team: nameOf.get(entry.rosterId) ?? `Roster ${entry.rosterId}`,
      points: entry.points,
    });
    const candidate = played && tied.length === 1 ? asCandidate(tied[0]) : null;

    const declaredEntry = declaredByWeek.get(week) ?? null;
    let eliminated = null;

    if (declaredEntry && !alive.has(declaredEntry.rosterId)) {
      warnings.push(
        `${source} says ${nameOf.get(declaredEntry.rosterId)} was chopped in week ${week}, but ` +
          'that team was already out. Either a week is declared twice or the weeks are off by one.',
      );
      record.status = WEEK_STATUS.UNRESOLVED;
      record.note = 'the declared team was already eliminated';
    } else if (declaredEntry) {
      eliminated = {
        rosterId: declaredEntry.rosterId,
        team: nameOf.get(declaredEntry.rosterId),
        source: 'declared',
      };
      if (candidate && candidate.rosterId !== declaredEntry.rosterId) {
        warnings.push(
          `Week ${week}: ${source} says ${eliminated.team} was chopped, but that week's scores ` +
            `make ${candidate.team} the lowest scorer (${candidate.points}). The declaration is ` +
            'being used. One of the two is wrong — check the week in Sleeper.',
        );
      }
    } else if (candidate && choppedNow.has(candidate.rosterId)) {
      // Derivation needs both halves: the scores say who should be gone, and
      // the roster says the commissioner agreed.
      eliminated = { rosterId: candidate.rosterId, team: candidate.team, source: 'derived' };
    }

    if (eliminated) {
      alive.delete(eliminated.rosterId);
      history.push({ week, ...eliminated });
      record.status = WEEK_STATUS.ELIMINATED;
      record.eliminated = eliminated;
    } else if (record.status === null) {
      if (alive.size < 2) {
        record.status = WEEK_STATUS.DECIDED;
      } else if (!played) {
        record.status = WEEK_STATUS.NOT_PLAYED;
      } else {
        record.status = WEEK_STATUS.UNRESOLVED;
        record.note =
          tied.length > 1
            ? `${tied.length} teams tied on ${lowest}, so the lowest scorer is not a fact`
            : 'the chop has not been processed in Sleeper yet';
      }
    }

    if (candidate) record.candidate = candidate;
    if (tied.length > 1) record.tiedCandidates = tied.map(asCandidate);
    record.survivorCount = alive.size;
    weekRecords.push(record);
  }

  // A roster Sleeper shows as chopped that no week explains. Usually a week
  // nobody declared; occasionally a commissioner who emptied the wrong roster.
  for (const [rosterId, signals] of choppedNow) {
    if (history.some((entry) => entry.rosterId === rosterId)) continue;
    warnings.push(
      `${nameOf.get(rosterId)} looks chopped in Sleeper (${signals.join('; ')}) but no week ` +
        `accounts for it. Add the week to ${source}.`,
    );
  }

  const survivors = roster.filter((entry) => alive.has(entry.rosterId));

  return {
    throughWeek: lastWeek,
    source,
    hasDeclaredLedger: declared.length > 0,
    declaredWeeks: declared.map((entry) => entry.week),
    teams: roster,
    weeks: weekRecords,
    history,
    survivors,
    survivorCount: survivors.length,
    eliminatedCount: history.length,
    unresolvedWeeks: weekRecords
      .filter((entry) => entry.status === WEEK_STATUS.UNRESOLVED)
      .map((entry) => entry.week),
    warnings,
  };
}

/**
 * Who was still alive at the end of a given week.
 *
 * The ledger stores the full roster and the ordered history rather than a
 * survivor list per week, because those two answer the question for every week
 * without writing eighteen names out eighteen times in every snapshot. Team
 * order is the league's own, so a survivor list reads the same every week.
 */
export function survivorsAt(ledger, week) {
  const out = new Set(
    (ledger?.history ?? []).filter((entry) => entry.week <= week).map((entry) => entry.rosterId),
  );
  return (ledger?.teams ?? []).filter((entry) => !out.has(entry.rosterId));
}
