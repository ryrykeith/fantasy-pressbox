/**
 * The run order every command shares:
 *
 *   fetch → normalize → snapshot → analyze → build prompt → (generate) → validate → render
 *
 * Each step is a separate module. This file is only the sequence.
 */
import { createClient } from './sleeper/client.mjs';
import {
  futurePickOwnership,
  isFuturePick,
  normalizeLeague,
  normalizeTeams,
  normalizeTransactions,
  normalizeWeekRosters,
} from './sleeper/normalize.mjs';
import { projectDraftOrder, projectedDraftSeason } from './analysis/draftOrder.mjs';
import { isProjectableDraftOrder } from './rookieDraft.mjs';
import { analyzeWeek } from './analysis/week.mjs';
import { buildEliminationLedger } from './analysis/elimination.mjs';
import { buildDangerBoard } from './analysis/danger.mjs';
import { buildFaabMarket, weekBids } from './analysis/faab.mjs';
import { enrichTransactions } from './analysis/transactions.mjs';
import { buildRosterWindow } from './analysis/rosterWindow.mjs';
import { buildPickCapital, pickCapitalSeasons } from './analysis/pickCapital.mjs';
import { byeWeekTableSource, upcomingByeExposure } from './analysis/byeExposure.mjs';
import {
  MarketValuesError,
  fetchMarketValues,
  marketValueQuery,
  normalizeMarketValues,
} from './fantasycalc/client.mjs';
import { hasEliminations, hasFutureDraftCapital } from './format.mjs';
import { createStore } from './store.mjs';
import { loadByeWeekTable } from './config.mjs';

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

/**
 * The chop-line and floor picture (src/analysis/danger.mjs) as far as the
 * weeks already on disk can tell it. Fetches nothing, and reads its own
 * elimination ledger from the same stored weeks rather than trusting a
 * caller's to still match `throughWeek`. Null for a format where nobody is
 * ever eliminated — there is no chop line to report.
 */
export function readDangerBoard({ store, league, teams, config = null, throughWeek }) {
  if (!hasEliminations(league.format)) return null;
  const weeks = storedWeekScores(store, league.season, throughWeek);
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: league.startingSlots,
    declared: config?.guillotine?.eliminations ?? [],
    weeks,
    throughWeek,
  });
  return buildDangerBoard({ teams, weeks, ledger });
}

/**
 * The FAAB market (src/analysis/faab.mjs) as far as the weeks already on
 * disk can tell it: balances for every current survivor, plus each
 * elimination's released pool and any winning bids on it. Fetches nothing.
 * Null for a format where nobody is ever eliminated — there is no chop pool
 * to report.
 */
export function readFaabMarket({ store, league, teams, config = null, throughWeek }) {
  if (!hasEliminations(league.format)) return null;
  const weeks = storedWeekScores(store, league.season, throughWeek);
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: league.startingSlots,
    declared: config?.guillotine?.eliminations ?? [],
    weeks,
    throughWeek,
  });
  return buildFaabMarket({
    teams,
    waiverBudget: league.waiverBudget,
    ledger,
    rawWeeks: store.loadRawThrough(league.season, throughWeek),
    teamsByRosterId: new Map(teams.map((team) => [team.rosterId, team])),
  });
}

/**
 * One week's completed transactions with the context a grade needs
 * (src/analysis/transactions.mjs): each side's roster before and after, the
 * cost of a claim against what the claimant had left, and each moved player's
 * points week by week. Fetches nothing — every week it reads is a raw bundle
 * captureWeek already saved, through `throughWeek` (which defaults to `week`;
 * pass a later week to follow the players past the move).
 *
 * `describePlayer` is the same formatter cli.mjs hands normalizeTransactions,
 * so the readable `moves` match the ones every edition already prints.
 */
export function readTransactions({ store, league, teams, players, describePlayer, week, throughWeek = week }) {
  const raw = store.loadRawThrough(league.season, throughWeek);
  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));
  const normalize = (transactions) =>
    normalizeTransactions(transactions, { teamsByRosterId, players, describePlayer, league });

  // The FAAB a claimant had left is only known from every claim before it.
  const seasonTransactions = raw.filter((bundle) => bundle.week <= week).flatMap((b) => normalize(b.transactions));
  // The week's losing bids exist only in the raw entries, and a chop pool only
  // in a format with eliminations.
  const thisWeek = raw.find((bundle) => bundle.week === week);
  const faab = readFaabMarket({ store, league, teams, throughWeek: week });
  return enrichTransactions({
    market: {
      bids: weekBids({ transactions: thisWeek?.transactions ?? [], week, players, teamsByRosterId }),
      releasedPools: faab?.releasedPools ?? [],
    },
    transactions: seasonTransactions.filter((transaction) => transaction.week === week),
    seasonTransactions,
    league,
    teams,
    players,
    weeks: raw.map((bundle) => ({ week: bundle.week, rosters: normalizeWeekRosters(bundle.matchups) })),
  });
}

/**
 * The trade-value market for a week (src/fantasycalc/client.mjs), fetched
 * once and then read back from disk.
 *
 * The first fetch for a week is saved and every later run reuses it, so
 * re-running a trade report grades against the same numbers rather than
 * whatever the market says that afternoon. `refresh` fetches again anyway.
 *
 * A failed fetch never fails the edition: it returns `{ unavailable }` with the
 * reason, and src/promptContext.mjs turns that into an `unavailable` entry
 * telling the model not to quote any value.
 */
export async function readMarketValues({ store, league, teams, week, refresh = false, fetchImpl = fetch }) {
  if (!refresh) {
    const saved = store.loadMarketValues(league.season, week);
    if (saved) return saved;
  }
  const query = marketValueQuery({ format: league.format, teamCount: teams.length });
  try {
    const { players, picks } = normalizeMarketValues(await fetchMarketValues(query, { fetchImpl }));
    const snapshot = {
      source: 'FantasyCalc',
      label: query.label,
      fetchedAt: new Date().toISOString(),
      week,
      params: query.params,
      caveats: query.caveats,
      players,
      picks,
    };
    store.saveMarketValues(league.season, week, snapshot);
    return snapshot;
  } catch (error) {
    // Only a market that could not be read degrades; a bug still throws.
    if (!(error instanceof MarketValuesError)) throw error;
    return { unavailable: error.message };
  }
}

/**
 * How many rostered starters each survivor is about to lose to a bye
 * (src/analysis/byeExposure.mjs), for the next few weeks. Fetches nothing —
 * `league.players` is already fetched once per run by `openLeague`, and the
 * bye-week table is a committed config file, not something this reads over the
 * network. Null for a format where nobody is ever eliminated, the same rule
 * `readDangerBoard`/`readFaabMarket` follow.
 *
 * `throughWeek` and `fromWeek` are separate questions and only look like the
 * same one. `throughWeek` is how far the elimination ledger knows — which
 * teams are still alive to be exposed at all. `fromWeek` is the first week to
 * report exposure for, and for a backward-looking edition it is the week
 * *after* the last one played: that week's byes already happened, and counting
 * them would both report history as risk and push a genuinely upcoming week
 * off the end of the report. It defaults to `throughWeek`, which is right for
 * a forward-looking caller asking about the week it is previewing.
 */
export function readByeExposure({
  store,
  league,
  teams,
  players,
  config = null,
  throughWeek,
  fromWeek = throughWeek,
  weekCount,
}) {
  if (!hasEliminations(league.format)) return null;
  const weeks = storedWeekScores(store, league.season, throughWeek);
  const ledger = buildEliminationLedger({
    teams,
    startingSlots: league.startingSlots,
    declared: config?.guillotine?.eliminations ?? [],
    weeks,
    throughWeek,
  });
  return upcomingByeExposure({
    teams,
    players,
    byeWeeks: loadByeWeekTable({ season: league.season }),
    fromWeek,
    weekCount,
    ledger,
    source: byeWeekTableSource(league.season),
  });
}

/**
 * The projected rookie draft order (src/analysis/draftOrder.mjs) for the draft
 * this season's standings decide, or null when there is none to project: a
 * format without future picks, no projectable rule declared in
 * config/rookie-draft.yml, or a league that does not report its playoff field.
 * Null rather than a refusal, because every week's snapshot calls this and an
 * undeclared rule must not stop a recap; an edition that needs the order
 * calls requireDraftOrderRule itself and refuses there.
 */
export function readDraftOrder({ league, teams, config = null, tradedPicks = [] }) {
  const rule = config?.rookieDraft?.order ?? null;
  if (!hasFutureDraftCapital(league.format)) return null;
  if (!isProjectableDraftOrder(rule)) return null;
  if (!Number.isInteger(league.playoffTeams) || league.playoffTeams < 1) return null;
  const picks = futurePickOwnership({
    tradedPicks,
    rosterIds: teams.map((team) => team.rosterId),
    roundsPerDraft: league.draftRounds,
    season: projectedDraftSeason(league),
  });
  return projectDraftOrder({ league, teams, rule, picks, roundOrder: config?.rookieDraft?.rounds ?? null });
}

/**
 * Each team's future draft capital across the tradeable drafts, priced
 * (src/analysis/pickCapital.mjs). Fetches nothing: `market` is the week's
 * readMarketValues result (or null), so a caller without a market still gets
 * every team's picks, unpriced.
 *
 * The horizon is the seasons Sleeper reports a future pick moving in plus the
 * seasons the market prices, never a fixed count. Ownership is
 * futurePickOwnership per season, so a team absent from Sleeper's traded picks
 * holds its full complement. Null for a format with no future draft capital,
 * for the reason src/cli.mjs gives at normalizeFutureDraftCapital.
 */
export function readPickCapital({ league, teams, tradedPicks = [], market = null, config = null }) {
  if (!hasFutureDraftCapital(league.format)) return null;
  const future = tradedPicks.filter((pick) => isFuturePick(pick, league));
  const priced = Object.values(market?.picks ?? {}).filter((pick) => isFuturePick(pick, league));
  const seasons = pickCapitalSeasons({
    tradedSeasons: future.map((pick) => String(pick.season)),
    pricedSeasons: priced.map((pick) => String(pick.season)),
    nextDraft: projectedDraftSeason(league),
  });
  const rosterIds = teams.map((team) => team.rosterId);
  const picks = seasons.flatMap((season) =>
    futurePickOwnership({ tradedPicks: future, rosterIds, roundsPerDraft: league.draftRounds, season }),
  );
  const draftOrder = readDraftOrder({ league, teams, config, tradedPicks: future });
  return buildPickCapital({ teams, seasons, picks, market, draftOrder });
}

/**
 * Each team's age structure and production by age band
 * (src/analysis/rosterWindow.mjs), from the weeks already on disk. Fetches
 * nothing. Null for a format with no future draft capital: a redraft roster
 * has no window to look through.
 */
export function readRosterWindow({ store, league, teams, players, throughWeek, ageBandEdges }) {
  if (!hasFutureDraftCapital(league.format)) return null;
  return buildRosterWindow({
    teams,
    players,
    weeks: store
      .loadRawThrough(league.season, throughWeek)
      .map((bundle) => ({ week: bundle.week, rosters: normalizeWeekRosters(bundle.matchups) })),
    ageBandEdges,
  });
}

/** Fetch one week, save the raw bundle and the analyzed snapshot. */
export async function captureWeek({ client, store, league, teams, players, week, config = null, tradedPicks = [] }) {
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

  // Who is still in the league, and how close each survivor is to joining
  // them, for the formats where that changes. Built from the weeks already
  // written down plus this one — shared between the elimination ledger and
  // the danger board so both read the identical weekly scores — and written
  // into the snapshot beside them: the field a week was judged against is as
  // much a part of that week's record as the scores are, and history is not
  // rewritten here.
  const weeksThroughNow = hasEliminations(league.format)
    ? [
        ...storedWeekScores(store, league.season, week - 1),
        {
          week,
          played,
          scores: analysis.teamWeeks.map((entry) => ({
            rosterId: entry.rosterId,
            points: entry.points,
          })),
        },
      ]
    : null;

  const elimination = weeksThroughNow
    ? buildEliminationLedger({
        teams,
        startingSlots: league.startingSlots,
        declared: config?.guillotine?.eliminations ?? [],
        weeks: weeksThroughNow,
        throughWeek: week,
      })
    : null;

  // The chop line, this week's survival margin, and every team's rolling
  // floor (src/analysis/danger.mjs) — computed against the elimination
  // ledger just built above, so a roster already chopped this week never
  // sets or clears the chop line for the teams still alive.
  const danger = weeksThroughNow ? buildDangerBoard({ teams, weeks: weeksThroughNow, ledger: elimination }) : null;

  // The waiver market (src/analysis/faab.mjs): what every survivor has left
  // to spend, and what each chop in the ledger just built above released.
  // The raw bundle for this week was already saved above, so loadRawThrough
  // picks it straight back up alongside every earlier week already on disk —
  // no second fetch, no separate "this week" case to special-case in.
  const faab = elimination
    ? buildFaabMarket({
        teams,
        waiverBudget: league.waiverBudget,
        ledger: elimination,
        rawWeeks: store.loadRawThrough(league.season, week),
        teamsByRosterId: new Map(teams.map((team) => [team.rosterId, team])),
      })
    : null;

  // How many rostered starters each survivor is about to lose to an NFL bye,
  // for the next few weeks starting at this one (src/analysis/byeExposure.mjs).
  // Reads the season's committed config/bye-weeks.<season>.yml table rather
  // than anything fetched above; the elimination ledger just built restricts
  // this to teams still alive, the same convention `danger` and `faab` follow.
  const byeExposure = elimination
    ? upcomingByeExposure({
        teams,
        players,
        byeWeeks: loadByeWeekTable({ season: league.season }),
        fromWeek: week,
        ledger: elimination,
        source: byeWeekTableSource(league.season),
      })
    : null;

  // Where every rookie pick would land if the season ended now, and who holds
  // it. Saved with the week so next week's movement is measured against what
  // was projected then, not recomputed from later standings.
  const draftOrder = readDraftOrder({ league, teams, config, tradedPicks });

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
    ...(danger ? { danger } : {}),
    ...(faab ? { faab } : {}),
    ...(byeExposure ? { byeExposure } : {}),
    ...(draftOrder ? { draftOrder } : {}),
    analysis,
  });

  return {
    analysis,
    transactions,
    played,
    ...(elimination ? { elimination } : {}),
    ...(danger ? { danger } : {}),
    ...(faab ? { faab } : {}),
    ...(byeExposure ? { byeExposure } : {}),
    ...(draftOrder ? { draftOrder } : {}),
    rawPath,
    snapshotPath,
  };
}
