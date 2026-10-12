/**
 * Everything factual the publication knows about one week.
 *
 * This module produces numbers and names only. It never produces prose, never
 * ranks teams on opinion, and never decides what is funny. Downstream, the
 * model editorialises on top of this; if a fact is not here, it may not be
 * claimed.
 */
import { pairOnKey } from '../league/pairing.mjs';
import { emptySlotPlayer, playerFor } from '../league/players.mjs';
import { hasMatchups } from '../format.mjs';
import { bestLineup, lineupEfficiency } from './lineup.mjs';

/** How many bench performances to carry forward per team. */
const BENCH_REPORT_LIMIT = 5;

/**
 * One WeekData roster's starters, in slot order, and its bench. A null starter id is an empty slot.
 *
 * A roster may list `noPointsIds`: players its provider reported no points for
 * that week (ESPN). Their points are null, never 0, and those also in `byeIds`
 * (their NFL team had no game, from the bye table) are flagged `onBye`. A
 * roster without the list (Sleeper's) reads a missing value as 0, as it always
 * has.
 */
function entriesFor(roster, players) {
  const playerPoints = roster.playerPoints || {};
  const starterIds = roster.starterIds || [];
  const starterPoints = roster.starterPoints || [];
  const noPoints = new Set(roster.noPointsIds || []);
  const onBye = new Set(roster.byeIds || []);
  const unknown = (id) => ({ points: null, ...(onBye.has(id) ? { onBye: true } : {}) });

  const starters = starterIds.map((id, index) => ({
    id,
    ...(id !== null && noPoints.has(id)
      ? unknown(id)
      : { points: Number((starterPoints[index] ?? (id === null ? undefined : playerPoints[id]) ?? 0).toFixed(2)) }),
    player: id === null ? emptySlotPlayer() : playerFor(players, id),
  }));

  const starterIdSet = new Set(starterIds.filter(Boolean));
  const bench = (roster.playerIds || [])
    .filter((id) => !starterIdSet.has(id))
    .map((id) => ({
      id,
      ...(noPoints.has(id) ? unknown(id) : { points: Number((playerPoints[id] ?? 0).toFixed(2)) }),
      player: playerFor(players, id),
    }));

  return { starters, bench };
}

const hasPoints = (entry) => typeof entry.points === 'number';

/**
 * The best lineup a roster could have fielded, or null when it cannot be
 * known. A player on his bye counts as 0, because a player whose team had no
 * game cannot score. Any other player with no points makes the whole lineup
 * unknowable for the week: it is not computed around the gap.
 */
function optimalLineup(slots, candidates) {
  if (candidates.some((entry) => !hasPoints(entry) && !entry.onBye)) return null;
  return bestLineup({ slots, candidates: candidates.map((entry) => (hasPoints(entry) ? entry : { ...entry, points: 0 })) });
}

/**
 * @param rosters WeekData rosters (a provider's normalizeWeek), one per team
 *                that played the week
 */
export function analyzeWeek({ league, teams, rosters, players, week }) {
  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));
  // A roster with no reported score scored nothing, as it always has here.
  const sides = (rosters || []).map((roster) => ({ ...roster, points: roster.points ?? 0 }));

  // A provider can pair every league into matchups, including the formats
  // that never play one. Those pairings are discarded here, at the point they
  // are made, rather than filtered out of each thing built from them later.
  const headToHead = hasMatchups(league.format);
  const { games, unpaired } = headToHead ? pairOnKey(sides) : { games: [], unpaired: [] };
  const slots = league.startingSlots;

  const teamWeeks = [];

  /**
   * One roster's week. Without an opponent there is no result to record, and
   * the matchup fields are left out of the record entirely rather than set to
   * null: an absent key cannot be printed, a null one invites a guess.
   */
  const buildSide = (side, opponentSide = null) => {
    const team = teamsByRosterId.get(side.rosterId);
    const { starters, bench } = entriesFor(side, players);
    const optimal = optimalLineup(slots, [...starters, ...bench]);
    const unreported = [...starters, ...bench].filter((entry) => entry.id !== null && !hasPoints(entry));
    const scored = Number((side.points ?? 0).toFixed(2));

    const record = {
      rosterId: side.rosterId,
      team: team?.name ?? `Roster ${side.rosterId}`,
      manager: team?.manager ?? null,
      record: team?.record ?? null,
      points: scored,
      ...(opponentSide
        ? {
            opponent:
              teamsByRosterId.get(opponentSide.rosterId)?.name ?? `Roster ${opponentSide.rosterId}`,
            opponentPoints: Number((opponentSide.points ?? 0).toFixed(2)),
            result:
              scored > opponentSide.points ? 'W' : scored < opponentSide.points ? 'L' : 'T',
            margin: Number(Math.abs(scored - opponentSide.points).toFixed(2)),
          }
        : {}),
      starters: starters.map((entry, index) => ({
        slot: slots[index] ?? 'FLEX',
        name: entry.player.name,
        position: entry.player.position,
        nflTeam: entry.player.team,
        injuryStatus: entry.player.injuryStatus,
        points: entry.points,
        ...(entry.onBye ? { onBye: true } : {}),
      })),
      // Only players with points: a bench player with none has no performance to report.
      benchHighlights: bench
        .filter(hasPoints)
        .sort((a, b) => b.points - a.points)
        .slice(0, BENCH_REPORT_LIMIT)
        .map((entry) => ({
          name: entry.player.name,
          position: entry.player.position,
          nflTeam: entry.player.team,
          points: entry.points,
        })),
      // Unknowable when a player other than one on his bye has no points:
      // left out of the record, never computed around the gap.
      ...(optimal
        ? {
            potentialPoints: optimal.total,
            lineupEfficiency: lineupEfficiency(scored, optimal.total),
            optimalLineup: optimal.lineup.map(({ slot, entry }) => ({
              slot,
              name: entry?.player.name ?? null,
              points: entry?.points ?? 0,
            })),
          }
        : {}),
      // The players the provider reported no points for, so an edition can say why.
      ...(unreported.length
        ? {
            pointsUnreported: unreported.map((entry) => ({
              name: entry.player.name,
              position: entry.player.position,
              nflTeam: entry.player.team,
              started: starters.includes(entry),
              ...(entry.onBye ? { onBye: true } : {}),
            })),
          }
        : {}),
    };
    teamWeeks.push(record);
    return record;
  };

  const analyzedGames = games.map((game) => {
    const [a, b] = game.sides;
    const sideA = buildSide(a, b);
    const sideB = buildSide(b, a);
    const winner = sideA.points === sideB.points ? null : sideA.points > sideB.points ? sideA : sideB;
    return {
      matchupId: game.pairingKey,
      teams: [sideA, sideB],
      winner: winner?.team ?? null,
      loser: winner ? (winner === sideA ? sideB.team : sideA.team) : null,
      margin: Number(Math.abs(sideA.points - sideB.points).toFixed(2)),
      combinedPoints: Number((sideA.points + sideB.points).toFixed(2)),
    };
  });

  // No games to walk, so the rosters are scored straight from the week's
  // list: every roster is a team's week, and nobody has an opponent.
  if (!headToHead) {
    for (const side of sides) buildSide(side);
  }

  return {
    week,
    season: league.season,
    games: analyzedGames,
    teamWeeks,
    unpairedRosterIds: unpaired.map((roster) => roster.rosterId),
    awards: computeAwardFacts(analyzedGames, teamWeeks),
    scoringOrder: [...teamWeeks]
      .sort((a, b) => b.points - a.points)
      .map((entry, index) => ({ rank: index + 1, team: entry.team, points: entry.points })),
  };
}

/**
 * Candidate awards, derived strictly from the week's numbers.
 *
 * A category is omitted when the data does not support it — there is no
 * "closest game" in a week with one game, no bench pain when nobody's bench
 * outscored a starter, and none of the head-to-head categories at all in a
 * format where no team plays another.
 */
function computeAwardFacts(games, teamWeeks) {
  if (teamWeeks.length === 0) return {};
  const byPoints = [...teamWeeks].sort((a, b) => b.points - a.points);
  const withEfficiency = teamWeeks.filter((t) => typeof t.lineupEfficiency === 'number');
  const byEfficiency = [...withEfficiency].sort((a, b) => b.lineupEfficiency - a.lineupEfficiency);
  const byMargin = [...games].sort((a, b) => b.margin - a.margin);
  const losers = teamWeeks.filter((t) => t.result === 'L');

  // A starter with no points (null) is in no comparison: his score is not known.
  const scoredStarters = (t) => t.starters.filter((s) => typeof s.points === 'number');
  const allStarters = teamWeeks.flatMap((t) =>
    scoredStarters(t).map((s) => ({ ...s, team: t.team })),
  );
  const topStarter = allStarters.sort((a, b) => b.points - a.points)[0] ?? null;

  const benchPain = teamWeeks
    .map((t) => {
      const best = t.benchHighlights[0];
      if (!best) return null;
      const worstStarter = [...scoredStarters(t)].sort((a, b) => a.points - b.points)[0];
      if (!worstStarter || best.points <= worstStarter.points) return null;
      return { team: t.team, ...best, replacedStarter: worstStarter.name, replacedPoints: worstStarter.points };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points)[0] ?? null;

  const facts = {
    teamOfTheWeek: { team: byPoints[0].team, points: byPoints[0].points },
    lowestScore: { team: byPoints.at(-1).team, points: byPoints.at(-1).points },
    playerOfTheWeek: topStarter
      ? { name: topStarter.name, position: topStarter.position, points: topStarter.points, team: topStarter.team }
      : null,
    benchPain,
  };

  // Awards that only exist because two teams played each other. A format with
  // no matchups is not offered them at all: "no blowout happened this week" and
  // "a blowout is not a thing here" are different facts, and only the second one
  // is safe to leave a model holding.
  if (games.length) {
    facts.biggestBlowout = {
      winner: byMargin[0].winner,
      loser: byMargin[0].loser,
      margin: byMargin[0].margin,
    };
    facts.closestGame =
      byMargin.length > 1
        ? {
            winner: byMargin.at(-1).winner,
            loser: byMargin.at(-1).loser,
            margin: byMargin.at(-1).margin,
          }
        : null;
  }

  if (byEfficiency.length) {
    facts.managerOfTheWeek = {
      team: byEfficiency[0].team,
      lineupEfficiency: byEfficiency[0].lineupEfficiency,
    };
    facts.lineupMalpractice = {
      team: byEfficiency.at(-1).team,
      lineupEfficiency: byEfficiency.at(-1).lineupEfficiency,
      pointsLeftOnBench: Number(
        (byEfficiency.at(-1).potentialPoints - byEfficiency.at(-1).points).toFixed(2),
      ),
    };
  }

  if (losers.length) {
    const unluckiest = [...losers].sort((a, b) => b.points - a.points)[0];
    facts.highestLosingScore = { team: unluckiest.team, points: unluckiest.points };
  }

  return facts;
}
