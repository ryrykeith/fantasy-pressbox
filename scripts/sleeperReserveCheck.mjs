/**
 * The logic behind scripts/check-sleeper-reserve.mjs: does Sleeper's matchup
 * `players` list include players on IR (reserve) or the taxi squad, and does
 * leaving them out of the optimal-lineup solver reproduce Sleeper's ppts?
 *
 * Pure: it takes already-loaded data and returns counts. Nothing here names a
 * team, manager or player, or carries an ID or a point value out: the report
 * is the only thing the operator sees, and it is counts.
 */
import { analyzeWeek } from '../src/analysis/week.mjs';

const TOLERANCE = 0.01;

/** Today's reserve and taxi players, per roster id. */
function heldOut(teams) {
  return new Map(
    teams.map((team) => [
      team.rosterId,
      { reserve: new Set(team.reserveIds || []), taxi: new Set(team.taxiIds || []) },
    ]),
  );
}

/** Each roster's summed optimal lineup over these weeks; null when a week's lineup was unknowable. */
function optimalSums({ league, teams, players, weeks, leaveOut }) {
  const sums = new Map(teams.map((team) => [team.rosterId, 0]));
  const held = heldOut(teams);
  for (const { week, rosters } of weeks) {
    const sides = leaveOut
      ? rosters.map((roster) => {
          const out = held.get(roster.rosterId);
          return { ...roster, reserveIds: out ? [...out.reserve, ...out.taxi] : [] };
        })
      : rosters;
    const { teamWeeks } = analyzeWeek({ league, teams, rosters: sides, players, week });
    for (const entry of teamWeeks) {
      if (!sums.has(entry.rosterId)) continue;
      const so_far = sums.get(entry.rosterId);
      const total = typeof entry.potentialPoints === 'number' ? entry.potentialPoints : null;
      sums.set(entry.rosterId, total === null || so_far === null ? null : so_far + total);
    }
  }
  return sums;
}

/**
 * @param league  normalized League (`lastScoredWeek`, `startingSlots`, `format`)
 * @param teams   today's normalized teams (`reserveIds`, `taxiIds`, `seasonPotentialPoints`)
 * @param players the player dictionary
 * @param weeks   `[{ week, rosters }]`: every saved week as WeekData
 * @returns counts only
 */
export function checkSleeperReserve({ league, teams, players, weeks }) {
  const saved = [...weeks].sort((a, b) => a.week - b.week);
  const held = heldOut(teams);

  // Question 1: the latest saved week.
  const latest = saved[saved.length - 1] ?? null;
  let reserveInMatchup = 0;
  let taxiInMatchup = 0;
  if (latest) {
    for (const roster of latest.rosters) {
      const out = held.get(roster.rosterId);
      if (!out) continue;
      for (const id of roster.playerIds || []) {
        if (out.reserve.has(id)) reserveInMatchup += 1;
        if (out.taxi.has(id)) taxiInMatchup += 1;
      }
    }
  }
  const question1 = {
    rostersChecked: latest ? latest.rosters.length : 0,
    rostersWithReserveToday: teams.filter((team) => (team.reserveIds || []).length > 0).length,
    rostersWithTaxiToday: teams.filter((team) => (team.taxiIds || []).length > 0).length,
    reserveInMatchup,
    taxiInMatchup,
  };

  // Question 2: only when the saved weeks cover every scored week.
  const lastScored = Number.isInteger(league.lastScoredWeek) ? league.lastScoredWeek : null;
  const scoredWeeks = lastScored === null ? [] : saved.filter((entry) => entry.week >= 1 && entry.week <= lastScored);
  const savedNumbers = new Set(scoredWeeks.map((entry) => entry.week));
  const missingWeeks =
    lastScored === null ? null : Array.from({ length: lastScored }, (_, i) => i + 1).filter((w) => !savedNumbers.has(w)).length;
  const question2 = { scoredWeeksInSeason: lastScored, weeksSummed: scoredWeeks.length, missingWeeks, comparable: false };

  if (lastScored === null) {
    question2.refusal = 'the league reports no last scored week, so there is no season to cover';
  } else if (lastScored === 0) {
    question2.refusal = 'no week has been scored yet';
  } else if (missingWeeks > 0) {
    question2.refusal =
      `${missingWeeks} of the ${lastScored} scored weeks are not saved. Sleeper's ppts covers every scored week, so a partial sum cannot match it`;
  } else {
    const matches = (sums) =>
      teams.filter((team) => {
        const total = sums.get(team.rosterId);
        return total !== null && total !== undefined && Math.abs(total - (team.seasonPotentialPoints ?? 0)) <= TOLERANCE;
      }).length;
    const common = { league, teams, players, weeks: scoredWeeks };
    question2.comparable = true;
    question2.rosters = teams.length;
    question2.matchAsToday = matches(optimalSums({ ...common, leaveOut: false }));
    question2.matchLeavingOut = matches(optimalSums({ ...common, leaveOut: true }));
  }
  return { question1, question2 };
}

/** The report as lines. Counts and sentences only. */
export function formatReport({ question1: q1, question2: q2 }) {
  const lines = [];
  lines.push('QUESTION 1: are reserve and taxi players in the latest saved matchup list?');
  if (q1.rostersChecked === 0) {
    lines.push('  No saved week was found, so there is nothing to check.');
  } else {
    lines.push(`  Rosters checked: ${q1.rostersChecked}`);
    lines.push(`  Matchup entries who are in their roster's reserve today: ${q1.reserveInMatchup}`);
    lines.push(`  Matchup entries who are in their roster's taxi squad today: ${q1.taxiInMatchup}`);
    lines.push(
      `  Rosters with reserve players today: ${q1.rostersWithReserveToday}; with taxi players today: ${q1.rostersWithTaxiToday}`,
    );
    const anyToday = q1.rostersWithReserveToday + q1.rostersWithTaxiToday > 0;
    if (q1.reserveInMatchup + q1.taxiInMatchup > 0) {
      lines.push("  Reading: Sleeper's matchup list includes reserve and/or taxi players.");
    } else if (anyToday) {
      lines.push(
        "  Reading: 0 and 0 while rosters hold reserve or taxi players today suggests Sleeper's matchup list already leaves them out.",
      );
    } else {
      lines.push('  Reading: no roster has a reserve or taxi player today, so this week cannot say either way.');
    }
    lines.push("  Caveat: today's reserve and taxi lists may differ from that week's.");
  }
  lines.push('');
  lines.push("QUESTION 2: does the optimal lineup reproduce Sleeper's season potential points (ppts)?");
  if (!q2.comparable) {
    lines.push(`  Not compared: ${q2.refusal}.`);
    if (q2.scoredWeeksInSeason) lines.push(`  Scored weeks saved: ${q2.weeksSummed} of ${q2.scoredWeeksInSeason}`);
  } else {
    lines.push(`  Weeks summed: ${q2.weeksSummed}`);
    lines.push(`  Rosters matching ppts within 0.01, as today: ${q2.matchAsToday} of ${q2.rosters}`);
    lines.push(
      `  Rosters matching ppts within 0.01, leaving out reserve and taxi players: ${q2.matchLeavingOut} of ${q2.rosters}`,
    );
  }
  return lines;
}
