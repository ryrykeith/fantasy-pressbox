/**
 * The run order every command shares:
 *
 *   fetch → normalize → snapshot → analyze → build prompt → (generate) → validate → render
 *
 * Each step is a separate module. This file is only the sequence.
 */
import { createClient } from './sleeper/client.mjs';
import { normalizeLeague, normalizeTeams } from './sleeper/normalize.mjs';
import { analyzeWeek } from './analysis/week.mjs';
import { buildEliminationLedger } from './analysis/elimination.mjs';
import { hasEliminations } from './format.mjs';
import { createStore } from './store.mjs';

export async function openLeague(config, { refreshPlayers = false } = {}) {
  const client = createClient({ leagueId: config.leagueId, dataDir: config.dataDir });
  const store = createStore({ dataDir: config.dataDir });

  const [rawLeague, users, rosters, tradedPicks] = await Promise.all([
    client.league(),
    client.users(),
    client.rosters(),
    client.tradedPicks(),
  ]);
  const players = await client.players({ refresh: refreshPlayers });

  const league = normalizeLeague(rawLeague, { declaredFormatType: config.leagueFormat });
  const teams = normalizeTeams({ rosters, users });

  return {
    client,
    store,
    league,
    teams,
    players,
    // The settings the league was opened with travel with it. Every step below
    // is called as `step({ ...ctx, ... })`, and some of them — the elimination
    // ledger's declared source, for one — need a setting rather than a fact
    // about the league.
    config,
    tradedPicks: tradedPicks ?? [],
    raw: { league: rawLeague, users, rosters },
  };
}

/**
 * Which week are we talking about?
 *
 * Explicit flag wins, then .env, then Sleeper's own idea of the current week.
 * `offset` is how far back a command naturally looks: a recap is about the week
 * that just finished, a preview is about the one starting.
 */
export async function resolveWeek({ client, league, config, requested, offset = 0 }) {
  if (Number.isInteger(requested) && requested > 0) return { week: requested, source: '--week' };
  if (Number.isInteger(config.week) && config.week > 0) {
    return { week: config.week, source: 'FANTASY_WEEK in .env' };
  }

  // Recaps and rankings look backwards. Sleeper tracks the last week it
  // finished scoring, which is exactly the week they are about — and unlike
  // "current week minus one" it keeps up once a week finishes.
  if (offset < 0 && Number.isInteger(league.lastScoredWeek) && league.lastScoredWeek > 0) {
    return { week: league.lastScoredWeek, source: 'Sleeper (last completed week)' };
  }

  let current = league.currentWeek;
  if (!current) {
    const state = await client.state();
    current = state?.week ?? null;
  }
  if (!current) throw new Error('Could not determine the current week. Pass --week explicitly.');
  return { week: Math.max(1, current + offset), source: 'Sleeper (current week)' };
}

/** Every week already written down, reduced to the scores the ledger reads. */
function storedWeekScores(store, season, throughWeek) {
  return store.loadSnapshotsThrough(season, throughWeek).map((snapshot) => ({
    week: snapshot.week,
    played: snapshot.played,
    scores: (snapshot.analysis?.teamWeeks ?? []).map((entry) => ({
      rosterId: entry.rosterId,
      points: entry.points,
    })),
  }));
}

/**
 * The elimination ledger as far as the weeks already on disk can tell it.
 *
 * Fetches nothing. Doctor uses this to show a commissioner what the tool
 * currently believes about who is still alive, and a check that downloads a
 * season of matchups first is a check nobody runs. Null for a format where
 * nobody is ever eliminated.
 */
export function readEliminationLedger({ store, league, teams, config = null, throughWeek }) {
  if (!hasEliminations(league.format)) return null;
  return buildEliminationLedger({
    teams,
    startingSlots: league.startingSlots,
    declared: config?.guillotine?.eliminations ?? [],
    weeks: storedWeekScores(store, league.season, throughWeek),
    throughWeek,
  });
}

/** Fetch one week, save the raw bundle and the analyzed snapshot. */
export async function captureWeek({ client, store, league, teams, players, week, config = null }) {
  const [matchups, transactions] = await Promise.all([
    client.matchups(week),
    client.transactions(week),
  ]);

  const rawPath = store.saveRaw(league.season, week, {
    fetchedAt: new Date().toISOString(),
    leagueId: league.id,
    week,
    matchups,
    transactions,
  });

  const analysis = analyzeWeek({ league, teams, matchups, players, week });
  const played = analysis.teamWeeks.some((entry) => entry.points > 0);

  // Who is still in the league, for the formats where that changes. Built from
  // the weeks already written down plus this one, and written into the snapshot
  // beside them: the field a week was judged against is as much a part of that
  // week's record as the scores are, and history is not rewritten here.
  const elimination = hasEliminations(league.format)
    ? buildEliminationLedger({
        teams,
        startingSlots: league.startingSlots,
        declared: config?.guillotine?.eliminations ?? [],
        weeks: [
          ...storedWeekScores(store, league.season, week - 1),
          {
            week,
            played,
            scores: analysis.teamWeeks.map((entry) => ({
              rosterId: entry.rosterId,
              points: entry.points,
            })),
          },
        ],
        throughWeek: week,
      })
    : null;

  const snapshotPath = store.saveSnapshot(league.season, week, {
    week,
    season: league.season,
    played,
    teams: teams.map((team) => ({
      rosterId: team.rosterId,
      name: team.name,
      manager: team.manager,
      record: team.record,
      seasonPointsFor: team.seasonPointsFor,
    })),
    // Absent rather than null in a format where nobody is ever eliminated: an
    // absent key cannot be printed, a null one invites a guess.
    ...(elimination ? { elimination } : {}),
    analysis,
  });

  return { analysis, transactions, played, ...(elimination ? { elimination } : {}), rawPath, snapshotPath };
}
