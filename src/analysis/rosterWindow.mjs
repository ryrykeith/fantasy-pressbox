/**
 * Roster age structure and where a team's points came from, by age.
 *
 * Facts only. Whether a 31-year-old running back is a problem is a judgement,
 * and judgements belong to the prompt — the same split src/analysis/danger.mjs
 * and src/analysis/byeExposure.mjs keep. Everything here is read from data
 * already fetched: the normalized player records (age) and the week rosters
 * captured with each matchup (who started, and what they scored).
 *
 * Three views per team, because one mean age across a roster says almost
 * nothing:
 *
 *   positions   age summary for each position, since running backs age out
 *               years before quarterbacks and tight ends. Each carries a
 *               starters-only summary beside the whole-roster one.
 *   starters    the age of today's starting lineup, and the same lineup
 *               weighted by the points each starter has scored.
 *   production  season points to date split into age bands — the number that
 *               tells "old and winning" from "young and winning" without
 *               projecting anything.
 *
 * Age is the age on each player's record today. A player's production in
 * week 1 is therefore binned by his age now, not his age then; for a season
 * to date that is a difference of at most a year and it keeps one consistent
 * yardstick across the whole table.
 */

/** Upper-exclusive band edges: under 25, 25 through 28, 29 and over. */
export const DEFAULT_AGE_BAND_EDGES = [25, 29];

/** Positions a roster age summary is not meaningful for: the "player" is a franchise or has no career arc worth aging. */
const AGELESS_POSITIONS = new Set(['DEF']);

/** Sleeper marks an empty starting slot with the string "0". */
const EMPTY_SLOT = '0';

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;

function median(sortedAges) {
  const mid = Math.floor(sortedAges.length / 2);
  return sortedAges.length % 2 ? sortedAges[mid] : (sortedAges[mid - 1] + sortedAges[mid]) / 2;
}

/**
 * Count, mean, median, youngest and oldest of a list of ages. Null ages are
 * counted separately as `unknownAge` and never enter the statistics — a
 * player with no age is a gap in the data, not a zero.
 */
export function summarizeAges(ages) {
  const known = ages.filter((age) => Number.isFinite(age)).sort((a, b) => a - b);
  const base = { count: ages.length, unknownAge: ages.length - known.length };
  if (known.length === 0) return { ...base, meanAge: null, medianAge: null, youngest: null, oldest: null };
  return {
    ...base,
    meanAge: round1(known.reduce((sum, age) => sum + age, 0) / known.length),
    medianAge: median(known),
    youngest: known[0],
    oldest: known[known.length - 1],
  };
}

/**
 * The age bands for a list of upper-exclusive edges, plus a bucket for
 * players with no age. [25, 29] gives `<25`, `25-28` and `29+`.
 */
export function ageBandsFor(edges = DEFAULT_AGE_BAND_EDGES) {
  const sorted = [...edges];
  if (sorted.length === 0 || sorted.some((edge, i) => !Number.isInteger(edge) || (i > 0 && edge <= sorted[i - 1]))) {
    throw new Error(`Age band edges must be strictly increasing whole numbers, got [${edges.join(', ')}].`);
  }
  return [
    { label: `<${sorted[0]}`, min: -Infinity, max: sorted[0] },
    ...sorted.slice(0, -1).map((edge, i) => ({
      label: `${edge}-${sorted[i + 1] - 1}`,
      min: edge,
      max: sorted[i + 1],
    })),
    { label: `${sorted[sorted.length - 1]}+`, min: sorted[sorted.length - 1], max: Infinity },
  ];
}

/**
 * @param teams        normalizeTeams output; `playerIds` and `starterIds` are today's roster
 * @param players      the raw Sleeper player dictionary, keyed by player id
 * @param weeks        `[{ week, rosters: normalizeWeekRosters(...) }]` — each stored week's
 *                     fielded starters and their points. Only starters' points count: they are
 *                     the points that went on the team's score.
 * @param ageBandEdges upper-exclusive edges for the production split
 * @returns `{ ageBandEdges, bands, weeksCovered, teams }`, teams in the order given
 */
export function buildRosterWindow({ teams = [], players = {}, weeks = [], ageBandEdges = DEFAULT_AGE_BAND_EDGES } = {}) {
  const bands = ageBandsFor(ageBandEdges);
  const ageOf = (id) => {
    const age = players[id]?.age;
    return Number.isFinite(age) ? age : null;
  };
  const positionOf = (id) => players[id]?.position ?? null;

  return {
    ageBandEdges: [...ageBandEdges],
    bands: bands.map((band) => band.label),
    weeksCovered: weeks.map((entry) => entry.week).sort((a, b) => a - b),
    teams: teams.map((team) => {
      const starterIds = new Set((team.starterIds || []).filter((id) => id !== EMPTY_SLOT));

      // Production: each stored week's starters, binned by age, for the
      // roster that fielded them that week (a player traded away keeps
      // counting for the team he scored for).
      const bandPoints = new Map([...bands.map((band) => [band.label, 0]), ['unknown', 0]]);
      const starterPoints = new Map();
      let totalPoints = 0;
      for (const { rosters = [] } of weeks) {
        const fielded = rosters.find((roster) => roster.rosterId === team.rosterId);
        for (const id of (fielded?.starterIds || []).filter((slot) => slot !== EMPTY_SLOT)) {
          const points = fielded.playerPoints?.[id] ?? 0;
          const age = ageOf(id);
          const band = age === null ? 'unknown' : bands.find((b) => age >= b.min && age < b.max).label;
          bandPoints.set(band, bandPoints.get(band) + points);
          starterPoints.set(id, (starterPoints.get(id) ?? 0) + points);
          totalPoints += points;
        }
      }

      const production = {
        totalPoints: round2(totalPoints),
        bands: [...bandPoints].map(([label, points]) => ({
          label,
          points: round2(points),
          share: totalPoints > 0 ? round2(points / totalPoints) : null,
        })),
      };

      // The lineup as it stands, and the same lineup weighted by output.
      const lineupAges = [...starterIds].map(ageOf);
      let weighted = 0;
      let weight = 0;
      for (const [id, points] of starterPoints) {
        const age = ageOf(id);
        if (age === null || points <= 0) continue;
        weighted += age * points;
        weight += points;
      }
      const starters = {
        ...summarizeAges(lineupAges),
        pointsWeightedMeanAge: weight > 0 ? round1(weighted / weight) : null,
      };

      // Per-position, whole roster and current starters side by side.
      const byPosition = new Map();
      for (const id of team.playerIds || []) {
        const position = positionOf(id);
        if (!position || AGELESS_POSITIONS.has(position)) continue;
        if (!byPosition.has(position)) byPosition.set(position, { all: [], starting: [] });
        const entry = byPosition.get(position);
        entry.all.push(ageOf(id));
        if (starterIds.has(id)) entry.starting.push(ageOf(id));
      }
      const positions = Object.fromEntries(
        [...byPosition]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([position, { all, starting }]) => [
            position,
            { ...summarizeAges(all), starters: summarizeAges(starting) },
          ]),
      );

      return { rosterId: team.rosterId, name: team.name, positions, starters, production };
    }),
  };
}
