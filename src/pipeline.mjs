/**
 * The run order every command shares:
 *
 *   fetch → normalize → snapshot → analyze → build prompt → (generate) → validate → render
 *
 * Each step is a separate module. This file is only the sequence.
 */
import { futurePickOwnership, isFuturePick } from './league/draftCapital.mjs';
import { DEFAULT_PROVIDER, openProvider, providerDisplayName, providerInstance, providerOf } from './providers.mjs';
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
import { buildStrength } from './analysis/strength.mjs';
import { LEAGUE_FIRST_SEASON_KEY, resolveStrengthChoice } from './settings.mjs';
import {
  MARKET_ID_SPACES,
  MarketValuesError,
  fetchMarketValues,
  marketValueQuery,
  normalizeMarketValues,
  snapshotIdSpace,
} from './fantasycalc/client.mjs';
import { capabilityGap, hasEliminations, hasFutureDraftCapital } from './format.mjs';

/**
 * The season's bye-week table from the loaded assets. A step reads it only
 * when it needs it, so a caller that never reaches one (a Sleeper week) may
 * leave `assets` out; one that does is told what to pass.
 */
function byeTable(assets, season) {
  if (!assets) throw new Error('This step needs the shipped bye-week table: pass assets, loadAssets(readText) (src/assets.mjs).');
  return assets.byeWeekTable(season);
}

/** Are teams knocked out of this league, by its format and its provider's capabilities? */
const eliminates = (league) => hasEliminations(league.format, providerOf(league).capabilities);

/** Does this league hold future draft capital, by its format and its provider's capabilities? */
const holdsFutureDraftCapital = (league) => hasFutureDraftCapital(league.format, providerOf(league).capabilities);

/**
 * The league, opened through its provider. A provider with an import route
 * refuses a saved league page older than its saved week pages (ESPN under
 * ESPN_ROUTE=import), so no edition is built from stale standings and rosters.
 * `allowStaleLeague` opens it anyway, for the commands that only report on it
 * (doctor, import-espn); no edition passes it.
 *
 * `store` is where this league's history lives (src/storeCore.mjs). The caller
 * makes it: the CLI passes the file store, the browser a memory store.
 *
 * `assets` is the package's shipped text (src/assets.mjs, loadAssets): the
 * prompts and the season's bye-week table. It travels with the league in the
 * returned context, so each step below that needs a table reads it from there.
 */
export async function openLeague(config, { store, assets, refreshPlayers = false, allowStaleLeague = false } = {}) {
  if (!store) throw new Error('openLeague needs a store: pass the file store or a memory store (src/storeCore.mjs).');
  // The league's provider (src/providers.mjs), bound to this league. Nothing
  // past it reads a provider's own field names.
  const provider = openProvider(config, { store });
  const { league, teams, players, draftCapital } = await provider.openLeague({ refreshPlayers, allowStaleLeague });

  return {
    provider,
    // The provider's client, for the callers that have not moved to the
    // provider yet.
    client: provider.client,
    store,
    assets,
    league,
    teams,
    players,
    // The settings the league was opened with travel with it. Every step below
    // is called as `step({ ...ctx, ... })`, and some of them — the elimination
    // ledger's declared source, for one — need a setting rather than a fact
    // about the league.
    config,
    draftCapital,
  };
}

/** How a league's age is credited when the operator declared it. */
export const DECLARED_HISTORY_SOURCE = `${LEAGUE_FIRST_SEASON_KEY} in the league's .env`;

/**
 * How long the league itself has existed, apart from this publication:
 * `{ firstSeason, seasonNumber, source }`, or `{ unavailable }` with the
 * reason it is not known. `seasonNumber` is 1 in the league's first season.
 *
 * LEAGUE_FIRST_SEASON (`config.leagueFirstSeason`) wins, for a league that was
 * recreated rather than renewed or a provider that reports no earlier seasons.
 * Otherwise the provider's `leagueHistory` walks the league's earlier seasons
 * once, and the answer is cached in the store (league-history/<season>/) for
 * every later edition of the season; a cached walk for another league ID is
 * walked again. A walk that fails is not cached, so the next edition tries
 * again. A provider without `leagueHistory` (ESPN) is unavailable.
 *
 * `provider` is openLeague's; a caller holding only a `client` gets the
 * league's provider wrapped around it.
 */
export async function readLeagueHistory({ provider = null, client = null, store, league, config = null }) {
  const season = Number.parseInt(league.season, 10);
  if (!Number.isInteger(season)) {
    return { unavailable: "The league's season is not known, so neither is how many seasons it has run." };
  }
  const view =(firstSeason, source) => ({ firstSeason, seasonNumber: season - firstSeason + 1, source });

  const declared = config?.leagueFirstSeason ?? null;
  if (declared !== null) {
    if (declared > season) {
      throw new Error(
        `${LEAGUE_FIRST_SEASON_KEY} in .env is ${declared}, after this league's ${league.season} season. ` +
          "Set it to the year of the league's first season, or remove the line.",
      );
    }
    return view(declared, DECLARED_HISTORY_SOURCE);
  }

  const saved = store.loadLeagueHistory(league.season);
  if (saved && saved.leagueId === (league.id ?? null)) return view(saved.firstSeason, saved.source);

  const instance = providerInstance({ provider, client, league, config });
  if (typeof instance.leagueHistory !== 'function') {
    return {
      unavailable:
        `${instance.displayName} does not report a league's earlier seasons, so how long this league has run ` +
        `is not known. ${LEAGUE_FIRST_SEASON_KEY} in the league's .env can say.`,
    };
  }
  const walked = await instance.leagueHistory({ league });
  if (walked.unavailable) return { unavailable: walked.unavailable };

  const history = view(walked.firstSeason, walked.source);
  store.saveLeagueHistory(league.season, {
    leagueId: league.id ?? null,
    season,
    ...history,
    seasons: walked.seasons,
    walkedAt: new Date().toISOString(),
  });
  return history;
}

/**
 * Saves pages the operator downloaded from the platform themselves, for a
 * provider with a manual import route (ESPN under ESPN_ROUTE=import):
 * `files` is `[{ file, text }]`, already read from disk by the caller. The
 * provider checks every file before it saves any, under the league folder's
 * data/. Nothing is fetched.
 *
 * → the provider's summary: `{ leaguePath, rawPath, week, transactionsUnavailable, files }`
 */
export function importSavedFiles(config, { store, files, week = null }) {
  const provider = openProvider(config, { store });
  if (typeof provider.importFiles !== 'function') {
    throw new Error(`${provider.displayName} has no import route: its league data is fetched.`);
  }
  return provider.importFiles({ files, week });
}

/**
 * Which week are we talking about?
 *
 * Explicit flag wins, then .env, then the provider's own idea of the current
 * week. `offset` is how far back a command naturally looks: a recap is about
 * the week that just finished, a preview is about the one starting.
 *
 * `provider` is openLeague's; a caller holding only a `client` gets the
 * league's provider wrapped around it.
 */
export async function resolveWeek({ provider = null, client = null, league, config, requested, offset = 0 }) {
  if (Number.isInteger(requested) && requested > 0) return { week: requested, source: '--week' };
  if (Number.isInteger(config.week) && config.week > 0) {
    return { week: config.week, source: 'FANTASY_WEEK in .env' };
  }

  const source = providerInstance({ provider, client, league, config });

  // Recaps and rankings look backwards. A provider that tracks the last week
  // it finished scoring names exactly the week they are about — and unlike
  // "current week minus one" it keeps up once a week finishes.
  if (
    offset < 0 &&
    source.capabilities.lastScoredWeek &&
    Number.isInteger(league.lastScoredWeek) &&
    league.lastScoredWeek > 0
  ) {
    return { week: league.lastScoredWeek, source: `${source.displayName} (last completed week)` };
  }

  const current = await source.currentWeek({ league });
  if (!current.week) throw new Error('Could not determine the current week. Pass --week explicitly.');
  return { week: Math.max(1, current.week + offset), source: current.source };
}

/**
 * A saved raw bundle as WeekData, through the league's provider.
 *
 * A bundle with no `provider` was saved before bundles were tagged, when
 * every league was Sleeper, so it is read as Sleeper and an existing league
 * folder needs no migration. A bundle tagged with another provider than the
 * league's is refused, naming both: reading one platform's week as another's
 * would invent a season.
 */
function readBundle(bundle, { store, assets, league, teams = [], players = {}, describePlayer }) {
  const provider = providerOf(league);
  const tag = bundle?.provider ?? DEFAULT_PROVIDER;
  if (tag !== provider.name) {
    const path = store.rawPath(league.season, bundle.week);
    throw new Error(
      `${path} was saved from ${providerDisplayName(tag)}, but this league is on ${provider.displayName}. ` +
        'A league folder holds one league.\n\n' +
        `If this folder is the ${providerDisplayName(tag)} league, set LEAGUE_PROVIDER=${tag} in its .env. ` +
        `Otherwise move ${path} out of this folder.`,
    );
  }
  // The bye table is handed over unread: a provider reads it only when it
  // needs it (ESPN, for a player with no points that week), so a Sleeper week
  // never touches it.
  const byeWeeks = () => byeTable(assets, league.season);
  return provider.normalizeWeek(bundle, { league, teams, players, byeWeeks, ...(describePlayer ? { describePlayer } : {}) });
}

/**
 * Every raw bundle on disk through `throughWeek`, oldest first, read as
 * WeekData. The bundles stay exactly as they were saved; normalizing happens
 * here, on read, so a league folder written before WeekData existed needs no
 * migration.
 */
export function savedWeeks({ store, assets, league, teams = [], players = {}, describePlayer, throughWeek }) {
  return store
    .loadRawThrough(league.season, throughWeek)
    .map((bundle) => readBundle(bundle, { store, assets, league, teams, players, describePlayer }));
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
  if (!eliminates(league)) return null;
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
  if (!eliminates(league)) return null;
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
export function readFaabMarket({ store, assets, league, teams, config = null, throughWeek }) {
  if (!eliminates(league)) return null;
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
    weeks: savedWeeks({ store, assets, league, teams, throughWeek }),
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
 * `describePlayer` is the same formatter prepareEdition hands normalizeTransactions,
 * so the readable `moves` match the ones every edition already prints.
 */
export function readTransactions({ store, assets, league, teams, players, describePlayer, week, throughWeek = week }) {
  const weeks = savedWeeks({ store, assets, league, teams, players, describePlayer, throughWeek });
  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));

  // The FAAB a claimant had left is only known from every claim before it.
  const seasonTransactions = weeks.filter((weekData) => weekData.week <= week).flatMap((w) => w.transactions);
  // The week's losing bids are only in its bids, and a chop pool only in a
  // format with eliminations.
  const thisWeek = weeks.find((weekData) => weekData.week === week);
  const faab = readFaabMarket({ store, assets, league, teams, throughWeek: week });
  return enrichTransactions({
    market: {
      bids: weekBids({ bids: thisWeek?.bids ?? [], week, players, teamsByRosterId }),
      releasedPools: faab?.releasedPools ?? [],
    },
    transactions: seasonTransactions.filter((transaction) => transaction.week === week),
    seasonTransactions,
    league,
    teams,
    players,
    weeks: weeks.map((weekData) => ({ week: weekData.week, rosters: weekData.rosters })),
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
 *
 * Players are keyed by the league provider's ID space (`playerIdSpace`), and the
 * snapshot records it as `idSpace`. A saved snapshot with no `idSpace` predates
 * the field and was keyed by Sleeper ID. One whose `idSpace` is not the
 * league's is fetched again, never read: an ID looked up in another space could
 * name a different player's value.
 */
export async function readMarketValues({ store, league, teams, week, refresh = false, fetchImpl = fetch }) {
  const provider = providerOf(league);
  const idSpace = provider.playerIdSpace;
  if (!MARKET_ID_SPACES.includes(idSpace)) {
    return { unavailable: `FantasyCalc values are not matched to ${provider.displayName} player IDs in this version` };
  }
  if (!refresh) {
    const saved = store.loadMarketValues(league.season, week);
    if (saved && snapshotIdSpace(saved) === idSpace) return saved;
  }
  const query = marketValueQuery({ format: league.format, teamCount: teams.length });
  try {
    const { players, picks } = normalizeMarketValues(await fetchMarketValues(query, { fetchImpl }), idSpace);
    const snapshot = {
      source: 'FantasyCalc',
      idSpace,
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
  assets,
  league,
  teams,
  players,
  config = null,
  throughWeek,
  fromWeek = throughWeek,
  weekCount,
}) {
  if (!eliminates(league)) return null;
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
    byeWeeks: byeTable(assets, league.season),
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
  if (!holdsFutureDraftCapital(league)) return null;
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
 * for the reason src/edition.mjs gives at normalizeFutureDraftCapital.
 */
export function readPickCapital({ league, teams, tradedPicks = [], market = null, config = null }) {
  if (!holdsFutureDraftCapital(league)) return null;
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
export function readRosterWindow({ store, assets, league, teams, players, throughWeek, ageBandEdges }) {
  if (!holdsFutureDraftCapital(league)) return null;
  return buildRosterWindow({
    teams,
    players,
    weeks: savedWeeks({ store, assets, league, teams, players, throughWeek }).map((weekData) => ({
      week: weekData.week,
      rosters: weekData.rosters,
    })),
    ageBandEdges,
  });
}

/**
 * Every settled week on file through `throughWeek`, as `{ week, rosters }`
 * (WeekData rosters): a week whose stored snapshot is its settled record
 * (isSettledSnapshot) and holds an analysis (a multi-week matchup's does not).
 * A week still being played is never read as a result. Fetches nothing.
 */
export function settledWeeks({ store, assets, league, teams, players, throughWeek }) {
  return savedWeeks({ store, assets, league, teams, players, throughWeek })
    .filter((weekData) => {
      const snapshot = store.loadSnapshot(league.season, weekData.week);
      return isSettledSnapshot(snapshot, league) && Boolean(snapshot.analysis);
    })
    .map((weekData) => ({ week: weekData.week, rosters: weekData.rosters }));
}

/**
 * The team strength rating (src/analysis/strength.mjs) from what is on file:
 * the settled weeks through `throughWeek`, the week's market (readMarketValues'
 * result, or null) and the league's future pick capital. Fetches nothing. Null
 * for a format with no strength rating (guillotine).
 *
 * - `preseason`: a preseason ranking reads none of this season's results, so
 *   lineup, depth and age window are unavailable, saying so.
 * - `pickCapital`: readPickCapital's result when the caller already has it;
 *   left undefined, it is read here from `tradedPicks` and `market`.
 */
export function readStrength({
  store,
  assets,
  league,
  teams,
  players,
  config,
  throughWeek,
  market = null,
  tradedPicks = [],
  pickCapital = undefined,
  preseason = false,
}) {
  const choice = resolveStrengthChoice(config.rankings, league.format?.type);
  if (!choice) return null;
  const weeks = preseason
    ? { settled: [], unavailable: "a preseason ranking reads none of this season's results" }
    : { settled: settledWeeks({ store, assets, league, teams, players, throughWeek }), unavailable: null };
  const capital = pickCapital === undefined ? readPickCapital({ league, teams, tradedPicks, market, config }) : pickCapital;
  const provider = providerOf(league);
  const draftCapitalUnavailable = capital
    ? null
    : (capabilityGap('futurePicks', { capabilities: provider.capabilities, provider: provider.displayName }) ??
      `a ${league.format.type} league holds no future draft picks`);
  return buildStrength({
    formatType: league.format.type,
    preset: choice.preset,
    weights: choice.weights,
    inputs: choice.inputs,
    teams,
    players,
    slots: league.startingSlots,
    weeks,
    market,
    pickCapital: capital,
    draftCapitalUnavailable,
  });
}

/**
 * Whether a stored snapshot is the settled record of its week, which nothing
 * may rewrite.
 *
 * A week is captured more than once in the ordinary course of things: its own
 * preview captures it before kickoff, a run on Sunday captures it half played,
 * and only a capture after Sleeper has scored it (`league.lastScoredWeek`)
 * holds its final result. That last capture is the record. Capturing the week
 * again later would stamp today's team names, injuries and projected draft
 * order onto it — and a renamed team's old name is exactly what
 * src/teamIdentity.mjs reads out of these snapshots to recognise it.
 *
 * Snapshots written before this rule carry no `settled` flag. One counts as
 * settled when it has scores for a week Sleeper has since scored: every such
 * snapshot on record was captured after its week ended, and the rule errs
 * toward keeping history, never toward rewriting it. A legacy snapshot of an
 * elimination format without its ledger is the exception — every edition of
 * that format reads the ledger, so it is captured again.
 */
export function isSettledSnapshot(snapshot, league) {
  if (!snapshot) return false;
  if (typeof snapshot.settled === 'boolean') return snapshot.settled;
  if (eliminates(league) && !snapshot.elimination) return false;
  return Boolean(snapshot.played) && Number.isInteger(league.lastScoredWeek) && snapshot.week <= league.lastScoredWeek;
}

/**
 * A settled week, read back from disk in the shape captureWeek returns. Its
 * transactions come from the raw bundle saved beside it, read as WeekData. The projected draft
 * order is the one exception that may be computed now: a snapshot written
 * before the order was recorded has none, and computing it from today's
 * standings is what every edition did before this rule. Nothing is written,
 * and `kept` says so.
 */
async function readSettledWeek({ provider, store, assets, league, teams, players, week, config, tradedPicks, snapshot }) {
  const raw = store.loadRaw(league.season, week);
  // A settled week whose raw bundle is gone is fetched again for its
  // transactions; nothing is saved, so the settled record stays as it is.
  const bundle = raw ?? { ...(await provider.fetchWeek(week)), provider: provider.name };
  const { transactions, transactionsUnavailable = false } = readBundle(bundle, { store, assets, league, teams, players });
  const draftOrder = snapshot.draftOrder ?? readDraftOrder({ league, teams, config, tradedPicks });
  return {
    // A multi-week week's snapshot has no analysis, only the marker.
    analysis: snapshot.analysis ?? null,
    ...(snapshot.multiWeekMatchup ? { multiWeekMatchup: snapshot.multiWeekMatchup } : {}),
    transactions,
    ...(transactionsUnavailable ? { transactionsUnavailable } : {}),
    played: snapshot.played,
    ...(snapshot.elimination ? { elimination: snapshot.elimination } : {}),
    ...(snapshot.danger ? { danger: snapshot.danger } : {}),
    ...(snapshot.faab ? { faab: snapshot.faab } : {}),
    ...(snapshot.byeExposure ? { byeExposure: snapshot.byeExposure } : {}),
    ...(draftOrder ? { draftOrder } : {}),
    rawPath: raw ? store.rawPath(league.season, week) : null,
    snapshotPath: store.snapshotPath(league.season, week),
    kept: true,
  };
}

/**
 * Fetch one week, save the raw bundle and the analyzed snapshot.
 *
 * `provider` is openLeague's; a caller holding only a `client` gets the
 * league's provider wrapped around it. `backfilled` flags the snapshot as
 * written to fill a gap (see catchUpWeeks).
 */
export async function captureWeek({
  provider = null,
  client = null,
  store,
  assets,
  league,
  teams,
  players,
  week,
  config = null,
  draftCapital = null,
  backfilled = false,
}) {
  const source = providerInstance({ provider, client, league, config });
  const tradedPicks = draftCapital?.tradedPicks ?? [];
  const stored = store.loadSnapshot(league.season, week);
  if (isSettledSnapshot(stored, league)) {
    return readSettledWeek({ provider: source, store, assets, league, teams, players, week, config, tradedPicks, snapshot: stored });
  }

  // Saved exactly as fetched, tagged with the provider it came from; analysis
  // reads it as WeekData.
  const bundle = { provider: source.name, ...(await source.fetchWeek(week)) };
  const rawPath = store.saveRaw(league.season, week, bundle);
  const weekData = readBundle(bundle, { store, assets, league, teams, players });

  // A week inside a matchup period that covers more than one NFL week (ESPN
  // only; Sleeper never sets the marker) has no single week's score: every
  // roster's points are null. analyzeWeek would read each null as 0, so the
  // week is not analyzed at all. The snapshot keeps the marker instead, and
  // every edition that reads the week's analysis refuses it
  // (docs/plans/espn-football.md, decision 12).
  const multiWeekMatchup = weekData.multiWeekMatchup ?? null;
  const analysis = multiWeekMatchup ? null : analyzeWeek({ league, teams, rosters: weekData.rosters, players, week });
  const played = analysis ? analysis.teamWeeks.some((entry) => entry.points > 0) : false;

  // Who is still in the league, and how close each survivor is to joining
  // them, for the formats where that changes. Built from the weeks already
  // written down plus this one — shared between the elimination ledger and
  // the danger board so both read the identical weekly scores — and written
  // into the snapshot beside them: the field a week was judged against is as
  // much a part of that week's record as the scores are, and history is not
  // rewritten here.
  // A multi-week week has no scores to judge a chop by. Guillotine is refused
  // on ESPN, so the two never meet; if they did, no ledger is built from nulls.
  const weeksThroughNow = eliminates(league) && analysis
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
  // The raw bundle for this week was already saved above, so savedWeeks
  // picks it straight back up alongside every earlier week already on disk —
  // no second fetch, no separate "this week" case to special-case in.
  const faab = elimination
    ? buildFaabMarket({
        teams,
        waiverBudget: league.waiverBudget,
        ledger: elimination,
        weeks: savedWeeks({ store, assets, league, teams, throughWeek: week }),
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
        byeWeeks: byeTable(assets, league.season),
        fromWeek: week,
        ledger: elimination,
        source: byeWeekTableSource(league.season),
      })
    : null;

  // Where every rookie pick would land if the season ended now, and who holds
  // it. Saved with the week so next week's movement is measured against what
  // was projected then, not recomputed from later standings.
  const draftOrder = readDraftOrder({ league, teams, config, tradedPicks });

  // Settled once Sleeper has scored the week: from then on this capture is the
  // week's record (isSettledSnapshot).
  const settled = Number.isInteger(league.lastScoredWeek) && week <= league.lastScoredWeek;

  const snapshotPath = store.saveSnapshot(league.season, week, {
    week,
    season: league.season,
    played,
    settled,
    // Captured after the week, to fill a gap (catchUpWeeks): its team names,
    // records and standings are the league's as of that capture, not as of the
    // week. Absent otherwise, so an ordinary snapshot is unchanged.
    ...(backfilled ? { backfilled: true } : {}),
    // What the status report (src/inspect.mjs) names the league by offline:
    // a snapshot is the only thing a league file carries that saw the league.
    league: { name: league.name ?? null, detectedFormat: league.format?.detectedType ?? null },
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
    // Never both: a week with no single score keeps the marker, not an
    // analysis of zeros.
    ...(analysis ? { analysis } : { multiWeekMatchup }),
  });

  return {
    analysis,
    ...(multiWeekMatchup ? { multiWeekMatchup } : {}),
    transactions: weekData.transactions,
    // The week's moves are unknown (an ESPN week imported without its
    // transactions file), not none: editions must not call the week quiet.
    ...(weekData.transactionsUnavailable ? { transactionsUnavailable: true } : {}),
    played,
    ...(elimination ? { elimination } : {}),
    ...(danger ? { danger } : {}),
    ...(faab ? { faab } : {}),
    ...(byeExposure ? { byeExposure } : {}),
    ...(draftOrder ? { draftOrder } : {}),
    rawPath,
    snapshotPath,
    kept: false,
  };
}

/**
 * The last week that is over: Sleeper's own last scored week when the provider
 * tracks one, else the provider's current week minus one. 0 before the season
 * starts.
 */
export async function lastCompletedWeek({ provider = null, client = null, league, config = null }) {
  const source = providerInstance({ provider, client, league, config });
  if (source.capabilities.lastScoredWeek && Number.isInteger(league.lastScoredWeek) && league.lastScoredWeek >= 0) {
    return league.lastScoredWeek;
  }
  const current = await source.currentWeek({ league });
  if (!current.week) throw new Error('Could not determine the current week, so the last completed week is unknown.');
  return Math.max(0, current.week - 1);
}

/**
 * Saves every completed week that has no settled snapshot on disk, weeks 1
 * through the last completed week (or `through`, when that is earlier), in
 * ascending order: captureWeek builds the guillotine ledger and the FAAB
 * market from the weeks already stored, so a later week must never be
 * captured before an earlier one. A settled week is skipped without a fetch
 * (isSettledSnapshot), which makes a second run a no-op. A week asked for
 * beyond the last completed one is reported, not fetched.
 *
 * Every snapshot written is flagged `backfilled`: it carries today's team
 * names and records, because the provider keeps no history of them.
 *
 * `onWeek({ week, status, result })` is called as each week finishes, `status`
 * being 'saved', 'settled', 'not-played' (no scores yet) or 'not-completed'.
 *
 * → `{ lastCompleted, through, weeks: [{ week, status, result }] }`
 */
export async function catchUpWeeks({ through = null, onWeek = () => {}, ...ctx }) {
  const { store, league } = ctx;
  const lastCompleted = await lastCompletedWeek(ctx);
  const target = Number.isInteger(through) ? through : lastCompleted;
  const weeks = [];
  const finish = (entry) => {
    weeks.push(entry);
    onWeek(entry);
  };
  for (let week = 1; week <= target; week += 1) {
    if (week > lastCompleted) {
      finish({ week, status: 'not-completed', result: null });
      continue;
    }
    if (isSettledSnapshot(store.loadSnapshot(league.season, week), league)) {
      finish({ week, status: 'settled', result: null });
      continue;
    }
    const result = await captureWeek({ ...ctx, week, backfilled: true });
    finish({ week, status: result.played || result.multiWeekMatchup ? 'saved' : 'not-played', result });
  }
  return { lastCompleted, through: target, weeks };
}

/** Weeks 1 through `throughWeek` with no settled snapshot on disk, oldest first. Reads only the disk. */
export function weeksWithoutSettledSnapshot({ store, league, throughWeek }) {
  const missing = [];
  for (let week = 1; week <= throughWeek; week += 1) {
    if (!isSettledSnapshot(store.loadSnapshot(league.season, week), league)) missing.push(week);
  }
  return missing;
}

/**
 * Before an edition about `week` that looks back over the season: saves every
 * earlier week that has no settled snapshot, so the strength window, rivalry
 * records, player histories, the guillotine ledger and the FAAB market do not
 * silently leave a skipped week out. It is catchUpWeeks' loop, stopped at
 * `week - 1`: a settled week is never fetched again, and every snapshot it
 * writes is flagged `backfilled`.
 *
 * A provider with an import route (ESPN under ESPN_ROUTE=import) is never
 * asked for anything: the weeks whose pages are not saved come back as
 * `unsaved`, for the edition to name, and nothing is captured.
 *
 * → `{ missing, weeks, unsaved }`: `missing` the weeks found without a settled
 *   snapshot, `weeks` catchUpWeeks' entries (empty when nothing was missing or
 *   nothing could be fetched), `unsaved` the import route's weeks still to save.
 */
export async function captureEarlierWeeks({ week, onWeek = () => {}, ...ctx }) {
  const missing = weeksWithoutSettledSnapshot({ store: ctx.store, league: ctx.league, throughWeek: week - 1 });
  if (missing.length === 0) return { missing, weeks: [], unsaved: [] };
  const source = providerInstance(ctx);
  if (typeof source.savedPages === 'function') {
    const saved = new Set((source.savedPages()?.weeks ?? []).map((entry) => entry.week));
    return { missing, weeks: [], unsaved: missing.filter((gap) => !saved.has(gap)) };
  }
  const { weeks } = await catchUpWeeks({ ...ctx, provider: source, through: week - 1, onWeek });
  return { missing, weeks, unsaved: [] };
}
