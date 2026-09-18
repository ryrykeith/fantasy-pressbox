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

  const league = normalizeLeague(rawLeague);
  const teams = normalizeTeams({ rosters, users });

  return {
    client,
    store,
    league,
    teams,
    players,
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

/** Fetch one week, save the raw bundle and the analyzed snapshot. */
export async function captureWeek({ client, store, league, teams, players, week }) {
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
    analysis,
  });

  return { analysis, transactions, played, rawPath, snapshotPath };
}
