/**
 * One status report on a league, for `doctor` and for the website.
 *
 * It answers, from the history a league has saved and (when the caller has
 * asked the provider) the provider's live state: which league this is, what
 * format, which week it is, what was recorded for last week, whether last
 * week's predictions can be graded, and what this week still needs.
 *
 * The report is built from a store (src/storeCore.mjs), so it reads a league
 * folder's file store and a league file alike: the website hands
 * `createMemoryStore(storeDataFromLeagueFile(file))`. It makes no request and
 * reads no file. `live` is what the caller learned from the provider, if it
 * could ask; nothing here guesses when it could not.
 *
 * Browser-safe: nothing here imports from `node:`.
 */
import { storeDataFromLeagueFile } from './leagueFile.mjs';
import { checkRivalries, parseRivalryTable } from './rivalries.mjs';
import { createTeamIdentity } from './teamIdentity.mjs';
import { EDITIONS, RECORDABLE_TASKS, weeklyEditions } from './options.mjs';
import { getProvider } from './providers.mjs';
import { createMemoryStore } from './storeCore.mjs';

/** Editions that file a called shot under predictions/. */
const PREDICTION_TASKS = ['preview', 'survival-preview'];
/** Season-long ranking editions and the ranking label each files under. */
const SEASON_LONG_LABELS = { 'preseason-rankings': 'preseason', postseason: 'final' };

const asId = (value) => (value === null || value === undefined ? null : String(value));

/** The week number an active week is reported for, or null. */
const isWeek = (value) => Number.isInteger(value) && value > 0;

/**
 * What was recorded for one edition and week: whether, when, from what, by
 * whom. `writtenBy` is null for a reply filed before editions carried it, and
 * `fullReply` says whether the whole reply was kept or only its tail.
 */
function recordedEdition({ store, season, task, week, label = null }) {
  let entry;
  if (PREDICTION_TASKS.includes(task)) {
    const saved = store.loadPredictions(season, week);
    entry = saved?.predictions?.length ? { recordedAt: saved.savedAt ?? null } : null;
  } else {
    const saved = store.loadRankings(season, label ?? `week-${week}`);
    entry = saved?.rankings?.length ? { recordedAt: saved.publishedAt ?? null } : null;
  }
  const reply = store.loadEdition(season, week ?? 0, task);
  return {
    task,
    week,
    recorded: Boolean(entry),
    recordedAt: entry ? (reply?.savedAt ?? entry.recordedAt) : null,
    from: entry ? (reply?.from ?? null) : null,
    writtenBy: entry ? (reply?.writtenBy ?? null) : null,
    fullReply: entry ? Boolean(reply) : false,
  };
}

/** Can week `week`'s predictions be graded from what is saved? `reason` says why not. */
function gradability({ store, season, week }) {
  if (!week) return { gradable: false, reason: 'there is no earlier week to grade' };
  const saved = store.loadPredictions(season, week);
  if (!saved?.predictions?.length) return { gradable: false, reason: `no predictions were recorded for week ${week}` };
  const snapshot = store.loadSnapshot(season, week);
  if (!snapshot) {
    return { gradable: false, reason: `week ${week} has not been captured, so there are no scores to grade against` };
  }
  if (snapshot.multiWeekMatchup) {
    return { gradable: false, reason: `week ${week}'s matchup period spans several weeks, so it has no single score` };
  }
  if (snapshot.settled !== true) return { gradable: false, reason: `week ${week} is not settled yet` };
  return { gradable: true, reason: null };
}

/**
 * The report.
 *
 * @param store          a file store or memory store
 * @param provider       'sleeper' or 'espn' — what the folder or file declares
 * @param leagueId       the league ID the folder or file declares
 * @param season         the season to report on; null when none is known
 * @param declaredFormat the declared format type (LEAGUE_FORMAT, settings.format), or null
 * @param displayName    the declared display name, or null
 * @param weekOverride   a declared week (FANTASY_WEEK, settings.week), or null
 * @param espnRoute      'import' or 'fetch' for an ESPN league, else null
 * @param live           `{ league, week, source }` from the provider and resolveWeek
 *                       when it could be asked; null offline and on ESPN's import route
 * @param rivalries      the declared rivalries (parseRivalries), as written
 * @param teams          the league's teams now, `[{ rosterId, name, manager }]`,
 *                       when the caller has them; else the latest saved week's
 *
 * → `{ league, format, season, week, espn, lastWeek, coverage, gradable, thisWeek, rivalries, problems }`
 *   `rivalries` is `{ declared, checked, unresolved }`: `checked` is false
 *   when no team list was known (nothing is saved yet), and `unresolved`
 *   lists each rivalry that no longer resolves to a team, `{ index, code,
 *   message }` — never with its name or note.
 */
export function inspectLeague({
  store,
  provider = 'sleeper',
  leagueId = null,
  season = null,
  declaredFormat = null,
  displayName = null,
  weekOverride = null,
  espnRoute = null,
  live = null,
  rivalries = [],
  teams = null,
}) {
  const seasonName = asId(season ?? live?.league?.season);
  const snapshots = seasonName ? store.loadSnapshotsThrough(seasonName, Number.POSITIVE_INFINITY) : [];
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const problems = [];

  const importRoute = provider === 'espn' && espnRoute !== 'fetch';
  // Saved pages are the provider's to read: only the registry names one.
  const importer = importRoute ? getProvider(provider) : null;
  const pages = importer && seasonName ? importer.readSavedPages({ store, season: seasonName }) : null;

  // Which league. The folder decides it, so a provider (or a saved page) that
  // names another is a mismatch, never quietly followed.
  const expectedId = asId(leagueId);
  for (const [actual, from] of [
    [asId(live?.league?.id), 'the provider'],
    [asId(pages?.league?.leagueId), 'the saved league page'],
  ]) {
    if (expectedId && actual && actual !== expectedId) {
      problems.push({
        code: 'league-mismatch',
        message: `This is league ${expectedId}, but ${from} reports league ${actual}. A folder or file holds one league.`,
      });
    }
  }

  const name =
    live?.league?.name
      ? { value: live.league.name, from: 'the provider' }
      : latest?.league?.name
        ? { value: latest.league.name, from: 'the latest snapshot' }
        : displayName
          ? { value: displayName, from: 'the declared display name' }
          : { value: null, from: null };

  const detected = live?.league?.format?.detectedType ?? latest?.league?.detectedFormat ?? null;
  const declared = declaredFormat ?? null;
  const formatType = declared ?? live?.league?.format?.type ?? detected ?? null;
  const format = {
    declared,
    detected,
    effective: formatType,
    winner: declared ? 'declared' : formatType ? 'detected' : null,
  };

  // Which week. Never a guess: a declared week, the provider's live answer,
  // the latest saved pages (ESPN import), or the last week captured — each
  // marked for what it is. `live` is true only for the provider's own answer.
  let week = null;
  if (isWeek(weekOverride)) {
    week = { number: weekOverride, live: false, source: 'declared', capturedAt: null };
  } else if (isWeek(live?.week)) {
    week = { number: live.week, live: true, source: live.source ?? 'the provider', capturedAt: null };
  } else if (importRoute) {
    const number = seasonName ? importer.readSavedPagesWeek({ store, season: seasonName }) : null;
    if (isWeek(number)) {
      week = { number, live: false, source: 'saved pages', capturedAt: pages?.league?.importedAt ?? null };
    }
  } else if (latest && isWeek(latest.week)) {
    week = { number: latest.week, live: false, source: 'last captured', capturedAt: latest.savedAt ?? null };
  }

  let espn = null;
  if (importRoute) {
    espn = {
      route: 'import',
      leaguePage: pages?.league ?? null,
      weeks: pages?.weeks ?? [],
      latestPeriod: pages?.latestPeriod ?? null,
      stale: Boolean(pages?.stale),
      imported: Boolean(pages?.league || pages?.weeks.length),
    };
    if (!espn.imported) {
      problems.push({ code: 'nothing-imported', message: 'Nothing has been imported yet: there are no saved ESPN pages.' });
    }
    if (espn.stale) {
      problems.push({
        code: 'stale-league-page',
        message:
          `The saved league page is from scoring period ${pages.league.period}, behind the latest saved page ` +
          `(scoring period ${pages.latestPeriod}). Import the league page again.`,
      });
    }
  } else if (provider === 'espn') {
    espn = { route: 'fetch' };
  }
  if (!week && !(importRoute && !espn.imported)) {
    problems.push({ code: 'no-week', message: 'No week has been captured yet, and no live state was available.' });
  }

  // Coverage and next steps need a season and a week; without them there is
  // nothing true to say, so the lists are empty rather than guessed.
  const lastWeek = week && week.number > 1 ? week.number - 1 : null;
  const recordable = EDITIONS.filter(
    (edition) => edition.recordable && (!formatType || edition.formats.includes(formatType)),
  ).map((edition) => edition.name);
  const ordered = RECORDABLE_TASKS.filter((task) => recordable.includes(task));

  const coverage = [];
  if (seasonName && lastWeek) {
    for (const task of ordered) {
      if (task in SEASON_LONG_LABELS) continue;
      coverage.push(recordedEdition({ store, season: seasonName, task, week: lastWeek }));
    }
  }
  const seasonLong = [];
  if (seasonName) {
    for (const [task, label] of Object.entries(SEASON_LONG_LABELS)) {
      if (!ordered.includes(task)) continue;
      seasonLong.push(recordedEdition({ store, season: seasonName, task, week: 0, label }));
    }
  }

  const gradable = seasonName ? gradability({ store, season: seasonName, week: lastWeek }) : { gradable: false, reason: 'no season is known' };

  const missing = [];
  if (seasonName && week) {
    for (const { task, when, recordable: isRecordable } of weeklyEditions(formatType)) {
      if (!isRecordable) continue;
      if (!recordedEdition({ store, season: seasonName, task, week: week.number }).recorded) {
        missing.push({ task, when });
      }
    }
  }

  // A rivalry is declared by team name or roster id; a team that left the
  // league, or a name that was misspelt, is reported rather than dropped.
  const knownTeams = teams ?? latest?.teams ?? null;
  const rivalryReport = { declared: rivalries.length, checked: false, unresolved: [] };
  if (rivalries.length && knownTeams?.length) {
    const identity = createTeamIdentity({
      teams: knownTeams,
      history: seasonName ? store.loadTeamNameHistory(seasonName) : [],
    });
    rivalryReport.checked = true;
    rivalryReport.unresolved = checkRivalries(rivalries, identity).problems.map(({ index, code, message }) => ({ index, code, message }));
    for (const { code, message } of rivalryReport.unresolved) problems.push({ code: `rivalry-${code}`, message });
  }

  return {
    league: { provider, id: expectedId, name: name.value, nameFrom: name.from },
    format,
    season: seasonName,
    week,
    espn,
    lastWeek,
    coverage,
    seasonLong,
    gradable,
    thisWeek: { week: week?.number ?? null, missing },
    rivalries: rivalryReport,
    problems,
  };
}

/** `2026-10-12T18:00:00Z` → `2026-10-12`, or the text unchanged when it is not a date. */
const dateOf = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso);

const row = (label, text) => `  ${label.padEnd(18)} ${text}`;
const CONTINUED = ' '.repeat(21);

/** "week 3" or "scoring period 5". */
const period = (p) => (p === null ? 'unknown' : `scoring period ${p}`);

/**
 * The report as the lines doctor prints, in sections so a caller can print
 * only some of them (doctor keeps its own League, Teams and Format lines):
 * `{ league, format, week, espn, coverage, rivalries, next }`, each a list of lines. A
 * section with nothing to say is an empty list.
 */
export function describeInspection(report) {
  const { league, format, week, espn, lastWeek, coverage, seasonLong, gradable, thisWeek } = report;

  const leagueLines = [
    row('League', `${league.name ?? 'name not known'}${league.nameFrom ? ` (from ${league.nameFrom})` : ''}, ${league.provider} ${league.id ?? 'no ID'}`),
  ];

  const formatLines = [
    row(
      'Format',
      `declared ${format.declared ?? 'none'}, detected ${format.detected ?? 'not known offline'}` +
        (format.winner ? ` — ${format.winner} wins` : ''),
    ),
  ];

  const weekLines = [];
  if (week) {
    if (week.live) weekLines.push(row('Current week', `${week.number} (from ${week.source})`));
    else if (week.source === 'declared') weekLines.push(row('Current week', `${week.number} (declared, not live)`));
    else if (week.source === 'saved pages') {
      weekLines.push(
        row('Current week', `${week.number} (from the saved pages, not live` +
          `${week.capturedAt ? `; league page imported ${dateOf(week.capturedAt)}` : ''})`),
      );
    } else {
      weekLines.push(
        row('Last captured', `week ${week.number}${week.capturedAt ? `, ${dateOf(week.capturedAt)}` : ''} (not live)`),
      );
    }
  } else {
    weekLines.push(row('Current week', 'not known: nothing captured and no live state'));
  }

  const espnLines = [];
  if (espn?.route === 'import') {
    espnLines.push(
      row(
        'Saved pages',
        espn.imported
          ? `league page ${espn.leaguePage ? period(espn.leaguePage.period) : 'not imported'}` +
              `${espn.stale ? ` ✗ behind the latest saved page (${period(espn.latestPeriod)})` : ''}; ` +
              `weeks ${espn.weeks.length ? espn.weeks.map((w) => w.week).join(', ') : 'none yet'}`
          : 'nothing imported yet',
      ),
    );
  }

  const coverageLines = [];
  if (lastWeek) {
    coverageLines.push(row('Last week', `week ${lastWeek}`));
    if (!coverage.length) coverageLines.push(`${CONTINUED}no recordable edition for this format`);
    for (const entry of coverage) {
      const by = entry.writtenBy ? ` by ${entry.writtenBy.surface} ${entry.writtenBy.version}` : '';
      const how = entry.from ? ` (${entry.from})` : '';
      coverageLines.push(
        `${CONTINUED}${entry.task.padEnd(18)} ` +
          (entry.recorded
            ? `recorded${entry.recordedAt ? ` ${dateOf(entry.recordedAt)}` : ''}${by}${how}`
            : 'not recorded'),
      );
    }
    for (const entry of seasonLong) {
      coverageLines.push(
        `${CONTINUED}${entry.task.padEnd(18)} ${entry.recorded ? `recorded${entry.recordedAt ? ` ${dateOf(entry.recordedAt)}` : ''}` : 'not recorded'} (season-long)`,
      );
    }
    coverageLines.push(
      row('Grading', gradable.gradable ? `week ${lastWeek}'s predictions can be graded` : `cannot grade: ${gradable.reason}`),
    );
  }

  const nextLines = [];
  if (thisWeek.week) {
    nextLines.push(
      row(
        'Not yet recorded',
        thisWeek.missing.length
          ? `week ${thisWeek.week}: ${thisWeek.missing.map((m) => m.task).join(', ')}`
          : `week ${thisWeek.week}: nothing — every recordable edition is filed`,
      ),
    );
  }

  // Nothing declared, nothing to say. Declared but unchecked says so rather
  // than implying every rivalry resolved.
  const rivalryLines = [];
  const { rivalries } = report;
  if (rivalries.declared) {
    const count = `${rivalries.declared} declared`;
    if (!rivalries.checked) rivalryLines.push(row('Rivalries', `${count}; not checked yet: no team list is saved`));
    else if (!rivalries.unresolved.length) rivalryLines.push(row('Rivalries', `${count}, every one resolves to a team`));
    else {
      rivalryLines.push(row('Rivalries', `${count}, ${rivalries.unresolved.length} no longer resolve`));
      for (const { message } of rivalries.unresolved) rivalryLines.push(`${CONTINUED}✗ ${message}`);
    }
  }

  return {
    league: leagueLines,
    format: formatLines,
    week: weekLines,
    espn: espnLines,
    coverage: coverageLines,
    rivalries: rivalryLines,
    next: nextLines,
  };
}

/**
 * The report for a parsed league file (parseLeagueFile). The season is the
 * file's declared one, else its latest season of history; the file says
 * nothing live, so `live` is whatever the caller learned from the provider.
 */
export function inspectLeagueFile(file, { live = null } = {}) {
  const { settings, league } = file;
  const seasons = Object.keys(file.seasons).sort();
  return inspectLeague({
    store: createMemoryStore(storeDataFromLeagueFile(file)),
    provider: league.provider,
    leagueId: league.leagueId,
    season: settings.season ?? seasons[seasons.length - 1] ?? null,
    declaredFormat: settings.format,
    displayName: settings.displayName,
    weekOverride: settings.week,
    espnRoute: league.provider === 'espn' ? (settings.espnRoute ?? 'import') : null,
    live,
    rivalries: parseRivalryTable(settings.declared.rivalries),
  });
}
