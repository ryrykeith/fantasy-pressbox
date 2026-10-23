/**
 * The steps of an edition, shared by every surface that builds one.
 *
 *   prepareEdition — refuse what this league cannot have, open the league,
 *                    resolve the week, capture it, and build the context and
 *                    the prompt.
 *   recordEdition  — file the machine-readable tail of a finished reply, so a
 *                    later edition can grade a prediction or show movement.
 *
 * The command line (src/cli.mjs) calls these and does only what is its own:
 * finding the league folder, writing files, and the optional AI call. The
 * website calls the same functions, so the two build the same prompt from the
 * same league by construction.
 *
 * Browser-safe: nothing here, or in anything it imports, reads from `node:`
 * (tests/options.test.mjs walks the imports to check). The store, the shipped
 * assets and the league's prospect board are passed in.
 */
import { providerOf, getProvider } from './providers.mjs';
import { hasFutureDraftCapital, refuseEditionWithoutCapability } from './format.mjs';
import {
  captureWeek,
  openLeague,
  readByeExposure,
  readLeagueHistory,
  readMarketValues,
  readPickCapital,
  readRosterWindow,
  readStrength,
  readTransactions,
  resolveWeek,
  settledWeeks,
} from './pipeline.mjs';
import { FUTURE_STOCK_TASK, refuseFutureStock } from './futureStock.mjs';
import { FIVE_YEAR_PLAN_TASK, refuseFiveYearPlan, refuseWithoutTeam, resolvePlanTeam } from './fiveYearPlan.mjs';
import { buildFiveYearPlan } from './analysis/fiveYearPlan.mjs';
import { normalizeFutureDraftCapital } from './league/draftCapital.mjs';
import {
  TASKS,
  RANKING_TASKS,
  STRENGTH_TASKS,
  RIVALRY_TASKS,
  ELIMINATION_ONLY_TASKS,
  TRANSACTION_TASKS,
  buildContext,
  buildPrompt,
  describePlayer,
} from './promptContext.mjs';
import { findJsonBlock } from './validate.mjs';
import { gradePredictions, withMovement, movementLabel } from './rankingGrades.mjs';
import { createTeamIdentity, attachRosterIds, presentPreviousRankings, describeUnresolved } from './teamIdentity.mjs';
import { resolveRivalries } from './rivalries.mjs';
import { headToHead, readSavedSeasons } from './analysis/rivalry.mjs';
import { TANK_WATCH_TASK, refuseTankWatch, resolveTankWatchStartWeek } from './tankWatch.mjs';
import { OPTIONS, editionNamed, optionNamed, quotedValues } from './options.mjs';
import { ESPN_ROUTE_KEY, resolveAgeCurves, withRankEmojiMode } from './settings.mjs';

/** How a refusal names a command to run instead. The CLI passes its own, with the program in front. */
const bareCommand = (name) => name;

/** A log that prints nothing, for a caller that passes none. */
const SILENT = Object.freeze({ say() {}, warn() {} });

/**
 * What replaces each ordinary edition for a guillotine league.
 *
 * These ship one at a time, so the refusal below asks TASKS whether the
 * replacement it is about to name actually exists rather than carrying its own
 * claim about it. That way the message corrects itself the week a replacement
 * lands, instead of going stale and sending someone to a command that is not
 * there — or, worse, telling them to paste a prompt that has already shipped.
 */
const GUILLOTINE_EDITION_FOR = {
  preview: 'survival-preview',
  recap: 'chop-recap',
  rankings: 'survival-rankings',
};

/**
 * Every ordinary edition a guillotine league cannot run, and why not.
 *
 * This map is the list — a task named here is refused, a task not named here
 * is allowed — and GUILLOTINE_EDITION_FOR above says which of them has a
 * guillotine replacement to be sent to. Keeping the reason and the membership
 * in one place is what stops a task being refused with no explanation, or
 * explained and never refused.
 *
 * The reasons are genuinely different and a single message covering all of
 * them would be vague about every one. `preview`/`recap` are about a game
 * nobody played. The three ranking editions each assume a field that does not
 * shrink — and the last two of those used to be refused for free, because
 * `resolveRankingWeights` threw for a format with no weight set and every
 * ranking edition asks for one. Shipping `weights.guillotine` turned that loud
 * failure into a silent success for them, so they are named here instead: the
 * refusal is now a decision rather than a side effect of a missing config key.
 */
const GUILLOTINE_REFUSAL_BECAUSE = {
  preview:
    'there are no head-to-head matchups, so there is nothing to preview — every team just ' +
    'scores on its own each week and the lowest is eliminated',
  recap:
    'there are no head-to-head matchups, so there is nothing to recap — every team just ' +
    'scores on its own each week and the lowest is eliminated',
  rankings:
    'a power ranking here is a ranking of the teams still alive, judged on the floor that ' +
    'keeps them alive — not on the asset quality the ordinary edition weighs',
  'preseason-rankings':
    'this format is ranked on a weekly floor, bye exposure and FAAB ammunition, none of which ' +
    'exists before a single week has been played',
  postseason:
    'there is no postseason in this format — the season ends the week one team is left, and ' +
    'the last survival ranking is the final word',
};

/**
 * The other direction: which ordinary edition a guillotine-only one replaces.
 *
 * Derived from GUILLOTINE_EDITION_FOR rather than written out a second time,
 * so the two guards below can never name different commands for the same
 * pair — `refuseOrdinaryEditionInGuillotineLeague` sends a guillotine league
 * one way, `refuseSurvivalEditionWithoutEliminations` sends everyone else back.
 */
const ORDINARY_EDITION_FOR = Object.fromEntries(
  Object.entries(GUILLOTINE_EDITION_FOR).map(([ordinary, guillotine]) => [guillotine, ordinary]),
);

/**
 * Refuses an ordinary edition before any work begins, for a guillotine league.
 *
 * Guillotine can only ever be DECLARED — Sleeper has no field that reveals it
 * (see UNDETECTABLE_FORMAT_TYPES in src/format.mjs) — so `config.leagueFormat`
 * already answers the question with no Sleeper call needed. This is the first
 * line of defence; buildPrompt in src/promptContext.mjs carries a second check
 * against the resolved format, in case some other caller reaches it without
 * going through here.
 *
 * `commandFor(name)` is how the message names a command to run instead.
 */
export function refuseOrdinaryEditionInGuillotineLeague(config, task, { commandFor = bareCommand } = {}) {
  if (config.leagueFormat !== 'guillotine') return;

  const because = GUILLOTINE_REFUSAL_BECAUSE[task];
  if (!because) return;

  // A refused edition either has a guillotine replacement to be sent to, or it
  // has none at all. The only ones with none are ranking editions, so the
  // ranking this format does have is what they point at — read off the map
  // rather than written out, so renaming the command renames the advice.
  const replacement = GUILLOTINE_EDITION_FOR[task];

  throw new Error(
    `This is a guillotine league: ${because}.\n\n` +
      (!replacement
        ? `There is no guillotine \`${task}\` edition. The ranking this format does have is ` +
          `\`${GUILLOTINE_EDITION_FOR.rankings}\`, written about a week that has been played: ` +
          `${commandFor(GUILLOTINE_EDITION_FOR.rankings)}`
        : TASKS.includes(replacement)
          ? `Run \`${replacement}\` instead: ${commandFor(replacement)}`
          : `Guillotine leagues get a \`${replacement}\` edition instead of \`${task}\`, but it has not ` +
            'shipped yet. Track it in the PRD under "Guillotine chopped league coverage" → "Guillotine editions".'),
  );
}

/**
 * Refuses an elimination-shaped edition in a league where nobody is eliminated.
 *
 * The mirror of the guard above, and sound for the same reason: guillotine is
 * the only format anyone is chopped out of, and it can only ever be declared.
 * So an undeclared league is definitively not one, `config.leagueFormat`
 * settles it outright, and no Sleeper call is needed to find out.
 *
 * Covers every edition ELIMINATION_ONLY_TASKS names — the forward-looking
 * survival preview, the backward-looking chop recap and the survival
 * rankings — with one message, naming whichever ordinary edition
 * (ORDINARY_EDITION_FOR) actually replaces the one that was asked for.
 */
export function refuseSurvivalEditionWithoutEliminations(config, task, { commandFor = bareCommand } = {}) {
  if (!ELIMINATION_ONLY_TASKS.includes(task) || config.leagueFormat === 'guillotine') return;
  const replacement = ORDINARY_EDITION_FOR[task] ?? 'preview';
  throw new Error(
    `\`${task}\` is a guillotine edition: nobody is eliminated during the season in this league ` +
      '— every team plays all the way to the end.\n\n' +
      `Run \`${replacement}\` instead: ${commandFor(replacement)}\n\n` +
      'If this really is a guillotine league, say so with LEAGUE_FORMAT=guillotine in .env. ' +
      'Sleeper cannot report that format, so it has to be declared.',
  );
}

/** "4 and 5", "4, 5 and 6". */
function listWeeks(weeks) {
  return weeks.length > 1 ? `${weeks.slice(0, -1).join(', ')} and ${weeks.at(-1)}` : String(weeks[0]);
}

/**
 * Why a week inside a matchup period of more than one NFL week has no score
 * to report, or null for any other week. `captured` is captureWeek output,
 * which carries `multiWeekMatchup` only for such a week (ESPN only).
 */
export function describeMultiWeekMatchup(captured, week) {
  const period = captured?.multiWeekMatchup;
  if (!period) return null;
  return (
    `Week ${week} is part of ESPN matchup period ${period.matchupPeriod}, which covers NFL weeks ` +
    `${listWeeks(period.weeks)}. Its matchups are scored across more than one NFL week, so no single ` +
    "week's score exists, and none is made up by splitting or summing the period."
  );
}

/**
 * Refuses an edition that reads the captured week's analysis — its scores,
 * pairings and awards — for a week with no single week's score. captureWeek
 * saves no analysis for such a week rather than one of zeros
 * (docs/plans/espn-football.md, decision 12).
 */
export function refuseMultiWeekMatchup(captured, { week, edition }) {
  const reason = describeMultiWeekMatchup(captured, week);
  if (!reason) return;
  throw new Error(
    `${reason}\n\n` +
      `\`${edition}\` needs that week's scores, so nothing was built. Matchup periods over more than ` +
      'one NFL week are not covered in this version.',
  );
}

/**
 * What a week's transactions hold, section by section.
 *
 * The transactions command is one command for every kind of transaction
 * coverage rather than one per kind, so the edition has to know which sections
 * have something in them. Today only trades have an edition; `pickups` is
 * counted anyway so a quiet week and a trade-less week are told apart.
 *
 * `trades` counts only the trades that can be graded. A trade the provider
 * sent without its contents (ESPN, `contentsUnknown`) is counted apart, in
 * `tradesWithoutContents`: it was made, but there is nothing in it to grade.
 *
 * `enriched` is src/pipeline.mjs#readTransactions output.
 */
export function summarizeTransactionWeek(enriched) {
  const list = enriched ?? [];
  const allTrades = list.filter((transaction) => transaction.type === 'trade');
  const tradesWithoutContents = allTrades.filter((trade) => trade.contentsUnknown).length;
  return {
    trades: allTrades.length - tradesWithoutContents,
    tradesWithoutContents,
    pickups: list.length - allTrades.length,
    total: list.length,
  };
}

/**
 * The line printed when a transaction edition has nothing to be about, or null
 * when it does. A quiet week is a result, not an error: the command exits zero
 * and writes nothing, because a model handed an edition about nothing grades
 * something it made up. A week whose only trades arrived without their
 * contents is one of these too: the trades were made, but nothing in them can
 * be graded. `providerName` names who sent them that way.
 */
export function describeQuietTransactionWeek(summary, week, { providerName = 'The provider' } = {}) {
  if (summary.total === 0) {
    return `Week ${week} has no completed transactions, so there is nothing to write about. No edition was built.`;
  }
  const withoutContents = summary.tradesWithoutContents ?? 0;
  if (summary.trades === 0 && withoutContents > 0) {
    const one = withoutContents === 1;
    return (
      `Week ${week} has ${one ? 'one completed trade' : `${withoutContents} completed trades`}, but ` +
      `${providerName} sent ${one ? 'the trade without its' : 'the trades without their'} contents ` +
      "(it often sends a trade's items only to the account that made it), so there is nothing to grade. " +
      'No edition was built.'
    );
  }
  if (summary.trades === 0) {
    return (
      `Week ${week} has ${summary.pickups} waiver or free-agent move(s) but no trades, and ` +
      'only trades have an edition so far. No edition was built.'
    );
  }
  return null;
}

/**
 * Refuses an edition the league's provider cannot support, before it is
 * contacted: the configured provider and the declared format are enough
 * (src/format.mjs#refuseEditionWithoutCapability). Runs ahead of the format
 * guards, so an ESPN league asked for a guillotine edition hears that ESPN
 * cannot run one, not that it should declare LEAGUE_FORMAT=guillotine.
 */
export function refuseEditionForProvider(config, task) {
  const provider = getProvider(config.league.provider);
  refuseEditionWithoutCapability(task, {
    capabilities: provider.capabilities,
    provider: provider.displayName,
    formatType: config.leagueFormat,
  });
}

/**
 * Refuses what only the command line offers, on any other surface: an option
 * OPTIONS marks `cliOnly` (--generate), and a setting value it marks in
 * `cliOnlyValues` (ESPN_ROUTE=fetch). Each refusal names the reason.
 *
 * An ESPN route that is not one of ESPN_ROUTES is refused too: the provider
 * reads saved pages only on the import route (the default, when none is set)
 * and builds the cookie client for any other value (src/espn/provider.mjs,
 * fromConfig), so an unknown one would reach ESPN.
 */
export function refuseCliOnly({ settings, options = {}, surface }) {
  if (surface === 'cli') return;
  for (const option of OPTIONS) {
    if (!option.cliOnly || !option.flag) continue;
    const value = options[option.name];
    if (value === undefined || value === null || value === option.default) continue;
    throw new Error(`${option.flag} is only on the command line: ${option.cliOnly}.`);
  }
  const route = optionNamed('espnRoute');
  const { provider, route: declared } = settings.league ?? {};
  if (provider !== 'espn') return;
  const chosen = declared ?? route.default;
  const savedPagesOnly = `Here, editions are built from the pages you saved from ESPN (${ESPN_ROUTE_KEY}=import).`;
  if (!route.values.includes(chosen)) {
    throw new Error(`${ESPN_ROUTE_KEY} must be ${quotedValues(route.values)}, got "${chosen}". ${savedPagesOnly}`);
  }
  const because = route.cliOnlyValues?.[chosen];
  if (!because) return;
  throw new Error(
    `This ESPN league is read with ${ESPN_ROUTE_KEY}=${chosen}, which only the command line can build an edition from: ` +
      `${because}. ${savedPagesOnly}`,
  );
}

/**
 * openLeague (src/pipeline.mjs) for a surface, and the only way anything in
 * this module or src/core/ opens a league: refuseCliOnly runs first, so off the
 * command line an ESPN league on ESPN_ROUTE=fetch is refused before a client
 * exists or a request is made. `surface` defaults to 'core'; the command line
 * passes 'cli'. The other options are openLeague's. src/core/ exports this as
 * `openLeague`.
 */
export async function openLeagueOnSurface(config, { surface = 'core', ...options } = {}) {
  refuseCliOnly({ settings: config, surface });
  return openLeague(config, options);
}

/** The `--format` value an edition is written for, or a refusal naming the allowed ones. */
function outputFormat(options) {
  const option = optionNamed('format');
  const format = options.format || option.default;
  if (!option.values.includes(format)) {
    throw new Error(`${option.flag} must be ${quotedValues(option.values)}, got "${format}".`);
  }
  return format;
}

/** Resolves published team names to rosters for this league and season. */
export function teamIdentityFor({ teams, store, league }) {
  return createTeamIdentity({
    teams,
    history: typeof store.loadTeamNameHistory === 'function' ? store.loadTeamNameHistory(league.season) : [],
  });
}

/**
 * The name an edition's files share: `2026-week03-rankings`, or
 * `2026-preseason-rankings`. An edition about one team (`rosterId`) names it,
 * `2026-week03-five-year-plan-team7`, so two teams' plans for the same week
 * do not overwrite each other.
 */
export function editionFileStem({ task, season, week, rosterId = null }) {
  const stem =
    task === 'preseason-rankings'
      ? `${season}-preseason-rankings`
      : `${season}-week${String(week).padStart(2, '0')}-${task}`;
  return rosterId === null ? stem : `${stem}-team${rosterId}`;
}

/**
 * Builds an edition's prompt: every refusal, then open the league, resolve
 * the week, capture it, and build the context and the prompt.
 *
 * - `task`         the edition (EDITIONS in src/options.mjs).
 * - `week`         the week asked for, or undefined to work it out.
 * - `options`      the edition's options, by OPTIONS name (format, early,
 *                  refreshPlayers, refreshMarket, team).
 * - `settings`     the league's resolved settings (the CLI's loadConfig
 *                  output); its provider is opened from them. Its `rivalries`
 *                  (src/rivalries.mjs, as declared) are resolved to roster ids
 *                  once the league's teams are known.
 * - `store`        where the league's history lives (src/storeCore.mjs).
 * - `assets`       the shipped prompts and tables (src/assets.mjs).
 * - `prospectBoardFor(draftYear)`  the league's prospect board for a class,
 *                  or null; a board is the operator's own file.
 * - `surface`      'cli' for the command line, which alone may use what
 *                  OPTIONS marks CLI-only (refuseCliOnly).
 * - `commandFor(name)`  how a refusal names a command to run instead.
 * - `log`          `{ say, warn }` for the progress lines.
 *
 * → `{ built: false, message }` for a transaction edition about a quiet week
 *   (nothing was built, and that is a result, not an error), or
 *   `{ built: true, task, week, prompt, context, fileStem, league, teams,
 *   store, previousRankings, rivalries, recordsBlock, tankWatchPath }`.
 *   `rivalries` are the declared rivalries resolved to roster ids
 *   (resolveRivalries); one naming a team the league does not have refuses
 *   the edition.
 *   `recordsBlock` says whether the reply ends with a block recordEdition
 *   files; `tankWatchPath` is where a tank watch's projection was saved for
 *   the next one to measure movement from.
 */
export async function prepareEdition({
  task,
  week: requestedWeek,
  options = {},
  settings,
  store,
  assets,
  prospectBoardFor = () => null,
  surface = 'core',
  commandFor = bareCommand,
  log = SILENT,
}) {
  const edition = editionNamed(task);
  if (!edition) throw new Error(`Unknown edition "${task}".`);
  // --emoji changes this run only: the league's setting is left as it was.
  const config = options.emoji === undefined ? settings : withRankEmojiMode(settings, options.emoji);
  const { say, warn } = log;
  refuseCliOnly({ settings: config, options, surface });
  refuseEditionForProvider(config, task);
  refuseOrdinaryEditionInGuillotineLeague(config, task, { commandFor });
  refuseSurvivalEditionWithoutEliminations(config, task, { commandFor });
  const isTankWatch = task === TANK_WATCH_TASK;
  // The declared format and rule are enough to refuse a tank watch before
  // Sleeper is contacted. The resolved format and the week are checked again
  // once the league is open.
  if (isTankWatch) refuseTankWatch({ formatType: config.leagueFormat, rule: config.rookieDraft.order });
  const isFutureStock = task === FUTURE_STOCK_TASK;
  // Same two-step as the tank watch: the declared format refuses before
  // Sleeper is contacted, the resolved one once the league is open.
  if (isFutureStock) refuseFutureStock({ formatType: config.leagueFormat });
  const isFiveYearPlan = task === FIVE_YEAR_PLAN_TASK;
  // The declared format refuses before the provider is contacted, and so does
  // a missing --team. Whether the team exists needs the league's teams, so an
  // unknown or ambiguous one is refused once the league is open.
  if (isFiveYearPlan) {
    refuseFiveYearPlan({ formatType: config.leagueFormat });
    refuseWithoutTeam(options.team, { commandFor });
  }
  const format = outputFormat(options);

  // Without allowStaleLeague: a provider with an import route refuses a saved
  // league page older than its saved week pages (EspnStaleLeagueError).
  const ctx = await openLeagueOnSurface(config, { surface, store, assets, refreshPlayers: options.refreshPlayers });
  const { league, teams, players, client } = ctx;
  // Again with the opened league: its provider and its resolved format.
  const leagueProvider = providerOf(league);
  refuseEditionWithoutCapability(task, {
    capabilities: leagueProvider.capabilities,
    provider: leagueProvider.displayName,
    formatType: league.format.type,
  });
  // Null for a provider with no traded future picks (ESPN); every use is gated on that capability.
  const tradedPicks = ctx.draftCapital?.tradedPicks ?? [];
  const teamsByRosterId = new Map(teams.map((team) => [team.rosterId, team]));
  // Declared in config/rivalries.yml by team name or roster id; resolved here,
  // where the teams are known, the way config/guillotine.yml's teams are.
  const rivalries = resolveRivalries(config.rivalries ?? [], teamIdentityFor({ teams, store, league }));
  if (isFiveYearPlan) refuseFiveYearPlan({ formatType: league.format.type });
  // Before the week is captured: a typo'd team costs no fetch and writes nothing.
  const planTeam = isFiveYearPlan ? resolvePlanTeam(options.team, teamIdentityFor({ teams, store, league })) : null;

  // Not computed for a format without future picks: Sleeper can still report
  // picks traded for a redraft league's own upcoming draft, so the data being
  // present says nothing about whether the concept exists. Nor for a provider
  // whose traded picks are not read: every team would appear to hold only its
  // own picks, which nothing on file says.
  const futureDraftCapital = hasFutureDraftCapital(league.format, leagueProvider.capabilities)
    ? normalizeFutureDraftCapital({
        tradedPicks,
        league,
        teamsByRosterId,
        roundsPerDraft: league.draftRounds,
      })
    : null;

  // A preview looks at the week about to be played; a recap and its rankings
  // look at the week that just finished.
  const offset = edition.forwardLooking ? 0 : -1;
  const { week, source } = await resolveWeek({ client, league, config, requested: requestedWeek, offset });
  const isTransactionEdition = TRANSACTION_TASKS.includes(task);
  if (isTankWatch) {
    refuseTankWatch({
      formatType: league.format.type,
      rule: config.rookieDraft.order,
      week,
      // --early skips the start week entirely, including working one out.
      startWeek: options.early
        ? null
        : resolveTankWatchStartWeek({ declared: config.rookieDraft.tankWatch.startWeek, league }),
    });
  }
  if (isFutureStock) refuseFutureStock({ formatType: league.format.type });
  say(`Building ${task} for week ${week} (week chosen from ${source}).`);

  let weekAnalysis = null;
  let upcomingAnalysis = null;
  let priorWeekAnalysis = null;
  let transactions = null;
  let transactionsUnavailable = false;
  let gradedPredictions = null;
  // Who is still alive, for the formats where that changes. Not built for
  // preseason-rankings — the season has not started, so nobody has been
  // chopped and captureWeek is never called to compute it.
  let eliminationLedger = null;
  let faabMarket = null;
  let dangerBoard = null;
  let byeExposure = null;
  let enrichedTransactions = null;
  let marketValues = null;
  let draftOrder = null;
  let previousTankWatch = null;
  let prospectBoard = null;
  let rosterWindow = null;
  let pickCapital = null;
  let strength = null;
  let rivalryRecords = null;
  let fiveYearPlan = null;

  /**
   * The team strength rating, for an edition in STRENGTH_TASKS, from what is
   * on file and the week's market (fetched once and saved, so the same week
   * always rates on the same prices). A market that cannot be fetched leaves
   * the priced components out, saying so; it never stops the edition.
   */
  const rateStrength = async ({ preseason = false } = {}) => {
    if (!marketValues) {
      marketValues = await readMarketValues({ store, league, teams, week, refresh: options.refreshMarket });
      if (marketValues.unavailable) {
        warn(`Trade values could not be fetched (${marketValues.unavailable}). The strength rating leaves them out.`);
      }
    }
    return readStrength({
      store,
      assets,
      league,
      teams,
      players,
      config,
      throughWeek: week,
      market: marketValues,
      tradedPicks,
      ...(pickCapital ? { pickCapital } : {}),
      preseason,
    });
  };

  if (task === 'preseason-rankings') {
    say('Preseason edition: regular-season results are deliberately excluded.');
    strength = await rateStrength({ preseason: true });
  } else {
    const captured = await captureWeek({ ...ctx, week });
    eliminationLedger = captured.elimination ?? null;
    faabMarket = captured.faab ?? null;
    // Already normalized by captureWeek, with the same lines describePlayer writes.
    transactions = captured.transactions;
    transactionsUnavailable = Boolean(captured.transactionsUnavailable);

    if (isTransactionEdition && transactionsUnavailable) {
      // Unknown is not quiet: grading an empty list would call the week quiet.
      const provider = getProvider(league.provider);
      throw new Error(
        `Week ${week}'s transactions are not on file: the week was imported without its transactions page, ` +
          'so there is nothing to grade.' +
          (provider.importInstructions
            ? `\n\n${provider.importInstructions({ leagueId: config.league.id, season: config.league.season, week })}`
            : ''),
      );
    }

    if (isTransactionEdition) {
      // Everything a transaction edition reads is a raw bundle captureWeek has
      // just saved. A quiet week is settled before the market is fetched, so
      // a week with nothing in it costs no network call and writes no file.
      enrichedTransactions = readTransactions({ store, assets, league, teams, players, describePlayer, week });
      const quiet = describeQuietTransactionWeek(summarizeTransactionWeek(enrichedTransactions), week, {
        providerName: getProvider(league.provider).displayName,
      });
      if (quiet) return { built: false, task, week, message: quiet };
      marketValues = await readMarketValues({ store, league, teams, week, refresh: options.refreshMarket });
      if (marketValues.unavailable) {
        warn(`Trade values could not be fetched (${marketValues.unavailable}). Grades will not quote a market.`);
      }
      if (task === 'trade-report') {
        // Traded picks are valued at their projected slot when the league
        // declares its draft order; without one they keep the refusal to name
        // a slot, and the edition still runs.
        draftOrder = captured.draftOrder ?? null;
        prospectBoard = draftOrder ? prospectBoardFor(draftOrder.draftSeason) : null;
        if (draftOrder) {
          say(
            `Traded ${draftOrder.draftSeason} picks are valued at their projected slot` +
              (prospectBoard ? ', with the prospect board around it.' : '. No prospect board is declared for that class.'),
          );
        }
      }
    } else if (isTankWatch) {
      // The refusals above leave one way for the projection to be missing: a
      // league that does not report its number of playoff teams.
      draftOrder = captured.draftOrder ?? null;
      if (!draftOrder) {
        throw new Error(
          'The rookie draft order could not be projected: the league does not report how many teams make the playoffs.',
        );
      }
      // Sleeper reports standings only as they are now, so an earlier --week
      // still gets today's order.
      if (Number.isInteger(league.lastScoredWeek) && week !== league.lastScoredWeek) {
        warn(
          `Note: the draft order is projected from the standings after week ${league.lastScoredWeek}, ` +
            `not week ${week}. Sleeper only reports the current standings.`,
        );
      }
      previousTankWatch = store.loadPreviousTankWatch(league.season, week);
      say(
        previousTankWatch
          ? `Measuring movement against the week ${previousTankWatch.week} tank watch.`
          : 'No earlier tank watch this season: no movement to report.',
      );
      prospectBoard = prospectBoardFor(draftOrder.draftSeason);
    } else if (isFutureStock) {
      // Everything the edition reads is already on disk or one market fetch
      // away. A market that cannot be fetched degrades to unpriced picks
      // (pickCapital.marketUnavailable) rather than stopping the edition.
      marketValues = await readMarketValues({ store, league, teams, week, refresh: options.refreshMarket });
      if (marketValues.unavailable) {
        warn(`Pick values could not be fetched (${marketValues.unavailable}). Picks will be counted, not priced.`);
      }
      rosterWindow = readRosterWindow({ store, assets, league, teams, players, throughWeek: week });
      pickCapital = readPickCapital({ league, teams, tradedPicks, market: marketValues, config });
      // Optional: without a declared draft rule the picks simply carry no slot.
      draftOrder = captured.draftOrder ?? null;
      prospectBoard = draftOrder ? prospectBoardFor(draftOrder.draftSeason) : null;
      if (!rosterWindow.weeksCovered.length) {
        warn(`Week ${week} has no completed week on disk: production by age cannot be reported yet.`);
      }
      strength = await rateStrength();
    } else if (isFiveYearPlan) {
      // The future stock's inputs, for one team: the week's market (a market
      // that cannot be fetched leaves picks and the roster unpriced, saying
      // so), the league's pick capital, and the settled weeks today's
      // starters scored in. Nothing is projected.
      marketValues = await readMarketValues({ store, league, teams, week, refresh: options.refreshMarket });
      if (marketValues.unavailable) {
        warn(`Trade values could not be fetched (${marketValues.unavailable}). Picks and the roster will not be priced.`);
      }
      pickCapital = readPickCapital({ league, teams, tradedPicks, market: marketValues, config });
      draftOrder = captured.draftOrder ?? null;
      const weeks = settledWeeks({ store, assets, league, teams, players, throughWeek: week });
      if (!weeks.length) warn(`No settled week is on disk through week ${week}: today's starters have no production to report.`);
      strength = await rateStrength();
      fiveYearPlan = buildFiveYearPlan({
        league,
        team: planTeam,
        teams,
        players,
        weeks,
        ageCurves: resolveAgeCurves(config.rankings),
        pickCapital,
        strength,
        market: marketValues,
      });
      say(`Planning ${planTeam.name}'s seasons ${fiveYearPlan.seasons[0]} to ${fiveYearPlan.seasons.at(-1)}.`);
    } else if (task === 'preview') {
      // The week has not been played, so the preview gets the pairings plus
      // last week's results — never this week's partial scores.
      refuseMultiWeekMatchup(captured, { week, edition: task });
      upcomingAnalysis = captured.analysis;
      if (captured.played) {
        warn(`Note: week ${week} already has scores. A preview may read strangely.`);
      }
      if (week > 1) {
        const prior = await captureWeek({ ...ctx, week: week - 1 });
        // Last week's results are context, not the subject: a week with no
        // single score leaves them out, and says so.
        const priorMultiWeek = describeMultiWeekMatchup(prior, week - 1);
        if (priorMultiWeek) warn(`${priorMultiWeek} Last week's results are left out of this preview.`);
        priorWeekAnalysis = prior.analysis;
      }
    } else if (task === 'survival-preview') {
      // No pairings to fetch and no prior week to fetch either: everything a
      // survival preview is built on — every completed week's chop line, each
      // roster's floor, who is still alive, what they have left to spend —
      // captureWeek has already assembled from the weeks on disk. The upcoming
      // week's own scores are deliberately not used: dangerBoardView drops
      // them, because a chop line drawn under a week in progress is a wrong
      // fact, not an early one.
      dangerBoard = captured.danger ?? null;
      byeExposure = captured.byeExposure ?? null;
      if (captured.played) {
        warn(`Note: week ${week} already has scores. This week's chop line is not final and is not used.`);
      }
    } else {
      // recap, rankings, postseason share this path with chop-recap and
      // survival-rankings. The only difference is that the two guillotine
      // editions also read the danger board — the chop line and survival
      // margin for the week that just finished, which a plain recap has no
      // format-fact to report. buildContext's dangerBoardView shifts
      // `beforeWeek` by one for a backward-looking task, so the same captured
      // danger board describes this week's own chop rather than the one
      // before it.
      refuseMultiWeekMatchup(captured, { week, edition: task });
      if (!captured.played) {
        warn(`Week ${week} has no scores yet. Re-run once the games are final.`);
      }
      weekAnalysis = captured.analysis;
      if (task === 'chop-recap') dangerBoard = captured.danger ?? null;
      if (task === 'survival-rankings') {
        dangerBoard = captured.danger ?? null;
        // Bye exposure is a weighted factor in this format, so the ranking
        // needs it — but reading `captured.byeExposure` would be wrong here.
        // captureWeek computes exposure from the week it captured, which for a
        // backward-looking edition is a week already played: its byes are
        // history, and they would push a genuinely upcoming week off the end
        // of the report. The risk this edition ranks on starts the week after
        // the one it is about, so it is rebuilt from that week instead. Reads
        // only what is already on disk and fetches nothing.
        byeExposure = readByeExposure({ ...ctx, throughWeek: week, fromWeek: week + 1 });
      }
      const saved = store.loadPredictions(league.season, week);
      gradedPredictions = gradePredictions(saved?.predictions, captured.analysis, {
        eliminationLedger,
        identity: teamIdentityFor(ctx),
      });
      if (gradedPredictions) {
        say(`Grading week ${week} predictions: ${gradedPredictions.correct}/${gradedPredictions.total} correct.`);
      }
      if (STRENGTH_TASKS.includes(task)) strength = await rateStrength();
    }
  }

  // Each declared rivalry's head-to-head record, from the weeks saved so far
  // (captureWeek above has just saved this one). A preview reads up to the
  // week before the game: the game itself has not happened. A recap and a
  // trade report read through their own week, so a recap's record already
  // counts the game it is about.
  if (rivalries.length && RIVALRY_TASKS.includes(task)) {
    const through = { season: String(league.season), week: edition.forwardLooking ? week - 1 : week };
    const seasons = readSavedSeasons(store, { through });
    rivalryRecords = rivalries.map((rivalry) => ({
      ...rivalry,
      headToHead: headToHead(seasons, rivalry.rosterIds, league),
      through,
    }));
  }

  // Shown to the model under the names teams go by now, with the published
  // name kept as `formerly`, so a rename reads as a rename and not as a team
  // that appeared from nowhere while another vanished.
  const previousRankings =
    task === 'preseason-rankings' || isTransactionEdition || isTankWatch || isFutureStock || isFiveYearPlan
      ? null
      : presentPreviousRankings(store.loadPreviousRankings(league.season, week), teamIdentityFor(ctx));
  if (previousRankings) {
    say(`Measuring movement against "${previousRankings.label ?? 'previous'}" rankings.`);
    for (const { from, to } of previousRankings.renamed) say(`  Renamed since then: ${from} → ${to}`);
    if (previousRankings.unresolved.length) {
      say(`  Could not match to any current team: ${previousRankings.unresolved.join(', ')}`);
    }
  }

  // Every edition: a publication's first edition is not the league's first
  // season, and a model told neither will assume the two are the same.
  const leagueHistory = await readLeagueHistory(ctx);
  if (leagueHistory.unavailable) warn(`How long the league has run is not known: ${leagueHistory.unavailable}`);

  const context = buildContext({
    task,
    config,
    league,
    teams,
    players,
    week,
    leagueHistory,
    weekAnalysis,
    upcomingAnalysis,
    priorWeekAnalysis,
    previousRankings,
    gradedPredictions,
    transactions,
    transactionsUnavailable,
    enrichedTransactions,
    marketValues,
    futureDraftCapital,
    eliminationLedger,
    faabMarket,
    dangerBoard,
    byeExposure,
    draftOrder,
    previousTankWatch,
    prospectBoard,
    rosterWindow,
    pickCapital,
    strength,
    rivalryRecords,
    fiveYearPlan,
    format,
  });

  const prompt = buildPrompt({ task, context, assets });

  // Saved when the prompt is built, not when posts come back, so the next
  // tank watch measures movement from this one in the paste-into-a-chat
  // workflow too. A re-run for the same week replaces it.
  const tankWatchPath = isTankWatch ? store.saveTankWatch(league.season, week, draftOrder) : null;

  return {
    built: true,
    task,
    week,
    format,
    prompt,
    context,
    fileStem: editionFileStem({ task, season: league.season, week, rosterId: planTeam?.rosterId ?? null }),
    league,
    teams,
    store,
    previousRankings,
    rivalries,
    // A transaction edition, a tank watch, a future stock edition and a
    // five-year plan end with no machine-readable block: there is no
    // prediction to grade and no ranking to carry movement from.
    recordsBlock: !(isTransactionEdition || isTankWatch || isFutureStock || isFiveYearPlan),
    tankWatchPath,
  };
}

/**
 * Files the machine-readable tail of a finished reply (recordBlock), from its
 * whole text.
 *
 * `from` says where the reply came from. 'pasted' is a reply pasted back from
 * a chat (the `record` command, the website's paste-back box): it must end
 * with its block, and a missing one is refused. 'generated' is a reply just
 * written for an edition (`--generate`): a missing block is reported, not
 * refused, since the posts are already written.
 *
 * `league` and `teams` are the opened league's (`teams` is required); every
 * team name in the block is pinned to its roster before anything is saved.
 *
 * Once the block is filed, the whole reply is saved too
 * (store.saveEdition, editions/<season>/week-<n>-<task>.json), with
 * `writtenBy` ({ package, version, surface }) when the caller says who filed
 * it, so inspectLeague (src/inspect.mjs) can report it.
 *
 * → whether anything was recorded.
 */
export function recordEdition({
  task,
  week,
  text,
  store,
  league,
  teams,
  previousRankings = null,
  from = 'pasted',
  writtenBy = null,
  log = SILENT,
}) {
  // Required: without the roster, a typo'd or renamed team would be filed as
  // written and become a "new" team with no history. recordBlock alone keeps
  // teams optional, for its own tests.
  if (!Array.isArray(teams)) {
    throw new Error(
      "recordEdition needs the `teams` argument (the opened league's team list, as prepareEdition returns it) " +
        'so every team name in the reply can be pinned to its roster.',
    );
  }
  const found = findJsonBlock(text);
  const block = found.status === 'found' ? found.value : null;
  if (from === 'pasted') {
    if (found.status === 'unreadable') {
      throw new Error(
        'Found the JSON block after the last %%% but could not read it as JSON.\n' +
          'Copy the whole reply from the chat again; the block may have been cut off or edited.',
      );
    }
    if (!block) {
      throw new Error(
        'No JSON block found at the end of that file.\n' +
          'Copy the whole reply from the chat, including the JSON block after the last %%%.',
      );
    }
    log.say(`Recording ${task} for week ${week}.`);
  }
  const recorded = recordBlock({ store, league, week, task, block, previousRankings, say: log.say, teams });
  // The whole reply is kept beside its tail, so the edition can be read again
  // later; the rankings and predictions files hold only what the block said.
  if (recorded) {
    const path = store.saveEdition(league.season, week, task, { text, from, writtenBy });
    log.say(`Saved the whole reply → ${path}`);
  }
  return recorded;
}

/**
 * Files the machine-readable tail of an edition.
 *
 * Previews end with their predictions and ranking editions end with their
 * order. Saving them is what lets a later edition grade a prediction or print
 * "↑2" without anyone re-typing anything.
 *
 * Exported so a test can watch what it writes without a real store on disk.
 */
export function recordBlock({ store, league, week, task, block, previousRankings, say, teams = null }) {
  if (!Array.isArray(block) || block.length === 0) {
    say('No machine-readable block found in the output — nothing recorded for next week.');
    return false;
  }

  // With the league's teams to hand, every name in the block is pinned to a
  // roster id before anything is saved, because team names change mid-season
  // and roster ids do not. A name that matches no team is refused outright:
  // filing it would silently turn a typo into a "new" team with no history.
  // Without teams (a bare call, as in some tests) names are filed as written.
  const identity = teams ? teamIdentityFor({ teams, store, league }) : null;

  // Both previews make a called shot and both file it the same way. What is
  // being called differs — a winner where games are played, the week's chop
  // where they are not — but that is a difference gradePredictions reads off
  // the record's own fields, so the storage path does not need to know.
  if (task === 'preview' || task === 'survival-preview') {
    const filed = identity ? pinPredictionsToRosters(block, identity) : block;
    const path = store.savePredictions(league.season, week, filed);
    say(`Recorded ${block.length} predictions → ${path}`);
    say(
      task === 'survival-preview'
        ? `Run \`grade --week ${week}\` once the chop is settled to score them.`
        : "Next week's recap will grade them.",
    );
    return true;
  }

  // Every edition that ranks files the same way, so a new one cannot be
  // publishable and unrecordable at the same time. A survival ranking is
  // filed under the same `week-N` label an ordinary one uses, which is what
  // lets the next week's edition measure movement against it.
  if (RANKING_TASKS.includes(task)) {
    const seasonLong = task === 'preseason-rankings' || task === 'postseason';
    const label =
      task === 'preseason-rankings' ? 'preseason' : task === 'postseason' ? 'final' : `week-${week}`;
    let ordered = block
      .filter((entry) => entry && entry.team)
      .map((entry, index) => ({ rank: Number(entry.rank) || index + 1, team: String(entry.team) }))
      .sort((a, b) => a.rank - b.rank);
    let previous = previousRankings ?? store.loadPreviousRankings(league.season, week);
    if (identity) {
      const pinned = attachRosterIds(ordered, identity);
      if (pinned.unresolved.length) throw new Error(describeUnresolved(pinned.unresolved, identity));
      ordered = pinned.entries;
      // Last week's file is read as published; its names are resolved as they
      // were meant that week, so a team renamed since still lines up.
      if (previous) {
        previous = {
          ...previous,
          rankings: attachRosterIds(previous.rankings, identity, { week: previous.week ?? null }).entries,
        };
      }
    }
    const ranked = withMovement(ordered, previous);
    const path = store.saveRankings(league.season, label, {
      season: String(league.season),
      label,
      week: seasonLong ? null : week,
      publishedAt: new Date().toISOString(),
      rankings: ranked,
    });
    say(`Recorded ${ranked.length} rankings → ${path}`);
    for (const entry of ranked) {
      say(`  ${String(entry.rank).padStart(2)}. ${entry.team} ${movementLabel(entry.movement)}`);
    }
    return true;
  }

  say(`Nothing to record for a ${task} edition.`);
  return false;
}

/**
 * Adds the roster behind every team a prediction names.
 *
 * The names stay exactly as published — they are what the recap quotes back —
 * and the roster ids ride alongside so the grade does not depend on nobody
 * renaming their team before the result is in.
 */
function pinPredictionsToRosters(predictions, identity) {
  const unresolved = [];
  const roster = (name) => {
    if (name === undefined || name === null) return undefined;
    const id = identity.rosterIdFor(name);
    if (id === null) unresolved.push(name);
    return id;
  };
  const pinned = predictions.map((prediction) => {
    if (!prediction || typeof prediction !== 'object') return prediction;
    const extra = {};
    if (prediction.predicted_chop !== undefined) {
      extra.predicted_chop_roster = roster(prediction.predicted_chop);
    } else {
      extra.roster_a = roster(prediction.team_a);
      extra.roster_b = roster(prediction.team_b);
      extra.predicted_winner_roster = roster(prediction.predicted_winner);
    }
    return { ...prediction, ...extra };
  });
  if (unresolved.length) throw new Error(describeUnresolved([...new Set(unresolved)], identity));
  return pinned;
}
