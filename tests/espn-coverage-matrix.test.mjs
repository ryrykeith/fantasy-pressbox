import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';
import { createClient } from '../src/espn/client.mjs';
import { normalizeLeague } from '../src/espn/normalize.mjs';
import { espnProvider } from '../src/espn/provider.mjs';
import { capabilityGap, EDITION_CAPABILITIES, refuseEditionWithoutCapability } from '../src/format.mjs';
import { FUTURE_STOCK_TASK } from '../src/futureStock.mjs';
import { captureWeek, readMarketValues, readStrength, readTransactions } from '../src/pipeline.mjs';
import { buildContext, describePlayer, STRENGTH_TASKS, TASKS } from '../src/promptContext.mjs';
import { resolveSettings } from '../src/settings.mjs';
import { assets } from './fixtures/assets.mjs';
import { createStore } from '../src/store.mjs';
import { TANK_WATCH_TASK } from '../src/tankWatch.mjs';
import { createFakeEspnFetch } from './fixtures/fake-espn-fetch.mjs';
import { LEAGUE_BY_ID, PUBLIC_LEAGUE_ID, ROLLING_LEAGUE_ID, SCORED_WEEK, SEASON } from './fixtures/mock-espn-league.mjs';

// The coverage matrix in docs/espn-data.md (docs/plans/espn-football.md,
// task 5.3) against the code. Every edition, command, top-level context key
// and `unavailable` key the code has must have a row, every row must name one
// the code has, and each row's status must be what the code does on the
// invented ESPN fixtures. Nothing here is a real league.

const DOC = join(PACKAGE_ROOT, 'docs', 'espn-data.md');
const SRC = join(PACKAGE_ROOT, 'src');
const read = (path) => readFileSync(path, 'utf8');

// --- The matrix, as the doc writes it ------------------------------------------------

const SECTIONS = {
  editions: { title: 'Editions and commands', statuses: ['Supported', 'Refused'] },
  context: { title: 'Context facts', statuses: ['Supported', 'Unavailable', 'Refused'] },
  unavailable: { title: 'Unavailable entries', statuses: ['Emitted', 'Never'] },
};

/**
 * The matrix's rows by section: `{ names, status, label, text }` each. A row's
 * names are the backticked words in its first cell, its status the bold word
 * opening the second, its label the bold word opening the third.
 */
function parseMatrix(doc) {
  const start = doc.indexOf('\n## Coverage matrix\n');
  assert.ok(start >= 0, 'docs/espn-data.md has no "## Coverage matrix" section');
  const end = doc.indexOf('\n## ', start + 1);
  const body = doc.slice(start, end < 0 ? undefined : end);
  const tables = {};
  for (const [key, { title }] of Object.entries(SECTIONS)) {
    const from = body.indexOf(`\n### ${title}\n`);
    assert.ok(from >= 0, `the coverage matrix has no "### ${title}" table`);
    const to = body.indexOf('\n### ', from + 1);
    const lines = body.slice(from, to < 0 ? undefined : to).split('\n').filter((line) => line.startsWith('|'));
    // The header and its separator.
    tables[key] = lines.slice(2).map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      assert.equal(cells.length, 3, `a ${title} row does not have three cells: ${line}`);
      return {
        names: [...cells[0].matchAll(/`([^`]+)`/g)].map((match) => match[1]),
        status: cells[1].match(/^\*\*([A-Za-z]+)\.?\*\*/)?.[1] ?? null,
        label: cells[2].match(/^\*\*(verified|assumed)\*\*/)?.[1] ?? null,
        text: line,
      };
    });
  }
  return tables;
}

/** Names in `code` with no row, and names in the rows the code does not have. */
function drift(rows, code) {
  const named = rows.flatMap((row) => row.names);
  return {
    missing: [...code].filter((name) => !named.includes(name)).sort(),
    extra: named.filter((name) => !code.has(name)).sort(),
    repeated: named.filter((name, index) => named.indexOf(name) !== index),
  };
}

function assertNoDrift(rows, code, what) {
  const { missing, extra, repeated } = drift(rows, code);
  assert.deepEqual(missing, [], `${what} with no row in docs/espn-data.md's coverage matrix: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `coverage matrix rows naming ${what} the code does not have: ${extra.join(', ')}`);
  assert.deepEqual(repeated, [], `${what} with more than one row: ${repeated.join(', ')}`);
}

const statusOf = (rows, name) => rows.find((row) => row.names.includes(name))?.status;

// --- What the code has ------------------------------------------------------------

/** Every command `src/cli.mjs`'s main dispatches on, and init, which it handles first. */
function cliCommands() {
  const source = read(join(SRC, 'cli.mjs'));
  const main = source.slice(source.indexOf('async function main()'));
  assert.ok(main.length < source.length, 'src/cli.mjs has no main()');
  const constants = { TANK_WATCH_TASK, FUTURE_STOCK_TASK };
  const commands = new Set();
  for (const [, name] of main.matchAll(/case '([a-z-]+)':/g)) commands.add(name);
  for (const [, constant] of main.matchAll(/case ([A-Z_]+):/g)) {
    assert.ok(constant in constants, `src/cli.mjs dispatches on ${constant}: add it to this test's constants`);
    commands.add(constants[constant]);
  }
  for (const [, name] of main.matchAll(/command === '([a-z-]+)'/g)) commands.add(name);
  assert.ok(commands.has('init') && commands.has('preview') && commands.size > 10, [...commands].join(', '));
  return commands;
}

/** The edition a command builds: `transactions` builds the trade report; every other edition is its own command. */
const editionOf = (name) => (name === 'transactions' ? 'trade-report' : name);

/** Every `src/**` module, as text, without comment lines. */
function sourceModules() {
  return readdirSync(SRC, { recursive: true })
    .filter((path) => path.endsWith('.mjs'))
    .map((path) => ({
      path: `src/${path}`,
      code: read(join(SRC, path))
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n'),
    }));
}

/**
 * The `field` of every `unavailable` entry in `code`, found by the entry's
 * shape rather than by how a line is spelled: an object literal holding both a
 * `why` and an `instruction` (a `factor` instead marks a scoring-profile entry,
 * which is not one). Each must give `field` as a string literal (either
 * quote, on any line); anything else (shorthand, a computed value, no field) is
 * reported in `problems`. An object that merely has a `field` variable is not
 * an entry and is left alone.
 */
export function entryFields(code) {
  const strings = [];
  const root = { text: '' };
  const stack = [root];
  const objects = [];
  const top = () => stack[stack.length - 1];
  const keep = (value) => `\u0001${strings.push(value) - 1}\u0001`;

  const skipQuoted = (from, quote) => {
    let i = from;
    while (i < code.length && code[i] !== quote && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1;
    return i + 1;
  };
  // After a backtick, to just past the closing one.
  const skipTemplate = (from) => {
    let i = from;
    while (i < code.length && code[i] !== '`') {
      if (code[i] === '\\') i += 2;
      else if (code[i] === '$' && code[i + 1] === '{') i = skipExpression(i + 2);
      else i += 1;
    }
    return i + 1;
  };
  // After a `${`, to just past its closing brace.
  const skipExpression = (from) => {
    let depth = 1;
    let i = from;
    while (i < code.length && depth > 0) {
      const c = code[i];
      if (c === '`') i = skipTemplate(i + 1);
      else if (c === "'" || c === '"') i = skipQuoted(i + 1, c);
      else {
        if (c === '{') depth += 1;
        if (c === '}') depth -= 1;
        i += 1;
      }
    }
    return i;
  };

  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = c === '`' ? skipTemplate(i + 1) : skipQuoted(i + 1, c);
      top().text += keep(code.slice(i + 1, end - 1));
      i = end;
    } else if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
    } else if (c === '{') {
      const frame = { text: '' };
      stack.push(frame);
      objects.push(frame);
      i += 1;
    } else if (c === '}') {
      if (stack.length > 1) stack.pop();
      i += 1;
    } else {
      top().text += c;
      i += 1;
    }
  }
  assert.equal(stack.length, 1, 'could not match the braces in a source module: the entry scan needs a fix');

  const keys = new Set();
  const problems = [];
  const hasKey = (text, name) => new RegExp(`(?:^|,)\\s*${name}\\s*(?::|(?=,|$))`).test(text);
  for (const { text } of objects) {
    if (!hasKey(text, 'why') || !hasKey(text, 'instruction')) continue;
    // A scoring-profile entry (promptContext.mjs) pairs a fact with an instruction too, but is keyed `factor`.
    if (hasKey(text, 'factor')) continue;
    const literal = /(?:^|,)\s*field\s*:\s*\u0001(\d+)\u0001\s*(?=,|$)/.exec(text);
    const value = literal ? strings[Number(literal[1])] : null;
    if (value !== null && /^[A-Za-z]+$/.test(value)) keys.add(value);
    else problems.push(hasKey(text, 'field') ? 'an entry whose field is not a string literal' : 'an entry with no field');
  }
  return { keys, problems };
}

/**
 * Every `field` an `unavailable` entry can carry, read from the entries under
 * src/. An entry whose field is not a literal would hide a key from this test,
 * so it fails, naming the file.
 */
function unavailableKeys() {
  const keys = new Set();
  for (const { path, code } of sourceModules()) {
    const found = entryFields(code);
    assert.deepEqual(found.problems, [], `${path} has ${found.problems[0]}: write \`field: 'name'\``);
    for (const key of found.keys) keys.add(key);
  }
  assert.ok(keys.size > 20, [...keys].join(', '));
  return keys;
}

/** Every top-level key buildContext can put in a context: its assignments, plus the keys every context starts with. */
function contextKeys(observed) {
  const source = read(join(SRC, 'promptContext.mjs'));
  const keys = new Set(['unavailable', ...observed]);
  for (const [, key] of source.matchAll(/\bcontext\.([A-Za-z]+) = /g)) keys.add(key);
  return keys;
}

// --- What an ESPN context carries, on the fixtures --------------------------------

const CONFIG = {
  leagueDisplayName: null,
  editorial: {
    tone: 'dry',
    roast_intensity: 1,
    ranking_emoji: '',
    output: { sleeper_max_chars: 900, include_emoji: false },
    banned_phrases: [],
    awards: {},
  },
  rankings: {
    weights: {
      dynasty: { starting_lineup: 0.5, dynasty_value: 0.3, future_draft_capital: 0.2 },
      redraft: { starting_lineup: 1 },
    },
    weekly: {},
  },
  rookieDraft: { order: null },
};

const ESPN_CAPABILITIES = espnProvider.capabilities;

/** Does the code refuse `edition` on an ESPN league of a format ESPN can run? */
function refusedOnEspn(edition) {
  const refused = ['redraft', 'dynasty'].map((formatType) => {
    try {
      refuseEditionWithoutCapability(edition, { capabilities: ESPN_CAPABILITIES, provider: 'ESPN', formatType });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(refused[0], refused[1], `${edition} is refused on one ESPN format and not the other`);
  return refused[0];
}

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** An opened ESPN fixture league with week 4 captured, as commandEdition has it. */
async function espnWeek({ leagueId = PUBLIC_LEAGUE_ID, leagueFormat = null } = {}) {
  const dataDir = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-espn-matrix-')));
  folders.push(dataDir);
  const client = createClient({ leagueId, season: SEASON, dataDir, fetch: createFakeEspnFetch() });
  const provider = espnProvider.forClient(client, { config: { leagueFormat } });
  const opened = await provider.openLeague();
  const store = createStore({ dataDir });
  const captured = await captureWeek({ provider, store, ...opened, week: SCORED_WEEK });
  const enriched = readTransactions({ store, ...opened, describePlayer, week: SCORED_WEEK });
  return { ...opened, store, captured, enriched };
}

/** The shipped strength weights: CONFIG's hand-built rankings carry none. */
const STRENGTH_CONFIG = { rankings: resolveSettings().rankings };

/** The context for `task` from an ESPN week, the way src/cli.mjs builds it; `extra` overrides any input. */
function espnContext(task, week, extra = {}) {
  const readsTheWeek = !['preview', 'preseason-rankings', 'trade-report', 'waiver-report'].includes(task);
  const strength = STRENGTH_TASKS.includes(task)
    ? readStrength({
        store: week.store,
        assets,
        league: week.league,
        teams: week.teams,
        players: week.players,
        config: STRENGTH_CONFIG,
        throughWeek: SCORED_WEEK,
        preseason: task === 'preseason-rankings',
      })
    : null;
  return buildContext({
    strength,
    task,
    config: CONFIG,
    league: week.league,
    teams: week.teams,
    players: week.players,
    week: SCORED_WEEK,
    weekAnalysis: readsTheWeek ? week.captured.analysis : null,
    upcomingAnalysis: task === 'preview' ? week.captured.analysis : null,
    transactions: week.captured.transactions,
    enrichedTransactions: week.enriched,
    ...extra,
  });
}

/** Every ESPN context the scenarios build: each edition ESPN runs on three leagues, plus each condition an entry or a key needs. */
let contexts = [];

before(async () => {
  const base = await espnWeek();
  const dynasty = await espnWeek({ leagueFormat: 'dynasty' });
  const rolling = await espnWeek({ leagueId: ROLLING_LEAGUE_ID });
  const editions = TASKS.filter((task) => !refusedOnEspn(task));
  for (const week of [base, dynasty, rolling]) {
    for (const task of editions) contexts.push(espnContext(task, week));
  }

  const views = structuredClone(LEAGUE_BY_ID[PUBLIC_LEAGUE_ID].league.views);
  views.mSettings.settings.draftSettings.keeperCount = 2;
  const keeper = normalizeLeague({ mSettings: views.mSettings, mDraftDetail: views.mDraftDetail }, { leagueId: PUBLIC_LEAGUE_ID });
  const { format } = base.league;
  const noReceptionStat = {
    ...base.league,
    format: { ...format, scoring: { ...format.scoring, reception: { ...format.scoring.reception, base: null } } },
  };
  const trade = base.captured.transactions.find((txn) => txn.type === 'trade');
  const tradeWithoutItems = { ...trade, moves: [], sides: [], contentsUnknown: true };
  const lastRankings = { label: 'Week 3', week: 3, rankings: base.teams.map((team, index) => ({ rank: index + 1, team: team.name })) };

  // A reachable market, keyed by ESPN ID: the trade report then carries marketValues and the credit. The entry is invented.
  const market = await readMarketValues({
    store: createStore({ dataDir: realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-espn-matrix-market-'))) }),
    league: base.league,
    teams: base.teams,
    week: SCORED_WEEK,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [{ value: 1000, overallRank: 1, positionRank: 1, player: { name: 'Invented Player', position: 'RB', espnId: '9000001' } }],
    }),
  });

  contexts.push(
    espnContext('trade-report', base, { marketValues: market }),
    espnContext('rankings', base, { league: keeper }),
    espnContext('recap', base, { league: { ...base.league, playoffSeeding: 'total_points_scored' } }),
    espnContext('recap', base, { league: { ...base.league, playoffSeeding: null } }),
    espnContext('rankings', base, { league: noReceptionStat }),
    espnContext('recap', base, { transactions: [tradeWithoutItems] }),
    espnContext('recap', base, { transactions: [], transactionsUnavailable: true }),
    espnContext('recap', base, { transactions: [] }),
    espnContext('preview', base, { priorWeekAnalysis: base.captured.analysis }),
    espnContext('preview', base, {
      upcomingAnalysis: { ...base.captured.analysis, unpairedRosterIds: [base.teams[0].rosterId] },
    }),
    espnContext('recap', base, { gradedPredictions: { week: SCORED_WEEK, correct: 0, total: 0, predictions: [] } }),
    espnContext('rankings', base, { previousRankings: lastRankings }),
  );
});

const emittedFields = () => new Set(contexts.flatMap((context) => context.unavailable.map((entry) => entry.field)));
const presentKeys = () => new Set(contexts.flatMap((context) => Object.keys(context)));

// --- The tests --------------------------------------------------------------------

const matrix = parseMatrix(read(DOC));

test('every matrix row has a status its table allows and a verified or assumed label', () => {
  for (const [key, rows] of Object.entries(matrix)) {
    assert.ok(rows.length > 0, `the ${SECTIONS[key].title} table is empty`);
    for (const row of rows) {
      assert.ok(row.names.length > 0, `a row names nothing: ${row.text}`);
      assert.ok(SECTIONS[key].statuses.includes(row.status), `status ${row.status} not one of ${SECTIONS[key].statuses}: ${row.text}`);
      assert.ok(row.label, `a row is labelled neither verified nor assumed: ${row.text}`);
    }
  }
});

test('every verified row names a test that exists', () => {
  for (const row of Object.values(matrix).flat().filter((r) => r.label === 'verified')) {
    const tests = [...row.text.matchAll(/tests\/[\w-]+\.test\.mjs/g)].map((match) => match[0]);
    assert.ok(tests.length > 0, `a verified row names no test: ${row.text}`);
    for (const path of tests) assert.ok(existsSync(join(PACKAGE_ROOT, path)), `${path} does not exist: ${row.text}`);
  }
});

test('every edition and command has a row, and every row is an edition or command', () => {
  assertNoDrift(matrix.editions, new Set([...cliCommands(), ...TASKS]), 'editions and commands');
});

test('a row says Refused exactly where the code refuses ESPN, and quotes the reason', () => {
  for (const row of matrix.editions) {
    for (const name of row.names) {
      const edition = editionOf(name);
      const refused = TASKS.includes(edition) && refusedOnEspn(edition);
      assert.equal(row.status, refused ? 'Refused' : 'Supported', `${name}: ${row.text}`);
      if (refused) {
        const reason = capabilityGap(EDITION_CAPABILITIES[edition], { capabilities: ESPN_CAPABILITIES, provider: 'ESPN' });
        assert.ok(row.text.includes(reason), `${name}'s row does not quote "${reason}"`);
      }
    }
  }
});

test('every unavailable key has a row, and every row is a key the code can emit', () => {
  assertNoDrift(matrix.unavailable, unavailableKeys(), 'unavailable keys');
});

test('a key is Emitted exactly when an ESPN context gets it, on the fixtures', () => {
  const emitted = emittedFields();
  const named = matrix.unavailable.flatMap((row) => row.names);
  const unnamed = [...emitted].filter((field) => !named.includes(field));
  assert.deepEqual(unnamed, [], `ESPN contexts get unavailable entries with no row: ${unnamed.join(', ')}`);
  for (const row of matrix.unavailable) {
    for (const name of row.names) {
      assert.equal(
        row.status,
        emitted.has(name) ? 'Emitted' : 'Never',
        `${name}: ${emitted.has(name) ? 'an ESPN context gets it' : 'no ESPN context built here gets it'}`,
      );
    }
  }
});

test('every top-level context key has a row, and is Supported exactly when an ESPN context carries it', () => {
  const present = presentKeys();
  assertNoDrift(matrix.context, contextKeys(present), 'context keys');
  for (const row of matrix.context) {
    for (const name of row.names) {
      assert.equal(row.status === 'Supported', present.has(name), `${name} is ${row.status}, but ${present.has(name) ? 'an ESPN context carries it' : 'no ESPN context built here carries it'}`);
    }
  }
});

test('an ESPN dynasty ranking is rated without draft capital, naming why, and on the settled week', () => {
  const ranking = contexts.find((context) => context.task === 'rankings' && context.league.format.type === 'dynasty');
  const reason = capabilityGap('futurePicks', { capabilities: ESPN_CAPABILITIES, provider: 'ESPN' });
  assert.ok(ranking.strength.unavailable.some((entry) => entry.component === 'draft_capital' && entry.reason === reason));
  // No player age is read from ESPN, so there is no age window either.
  assert.ok(ranking.strength.unavailable.some((entry) => entry.component === 'age_window'));
  assert.ok(ranking.strength.weightsUsed.lineup > 0);
  assert.deepEqual(ranking.strength.window.weeks, [SCORED_WEEK]);
  assert.ok(ranking.strength.teams.every((team) => Number.isInteger(team.rating)));
});

test('the drift check names a key added to the code without a row', () => {
  const rows = matrix.unavailable.filter((row) => !row.names.includes('taxiSquad'));
  assert.deepEqual(drift(rows, unavailableKeys()).missing, ['taxiSquad']);
  assert.deepEqual(drift(matrix.editions, new Set([...cliCommands(), ...TASKS, 'invented-edition'])).missing, ['invented-edition']);
});

// The scan for `unavailable` entries finds an entry however its field is spelled.

test('entryFields finds literal fields in either quote style, across lines', () => {
  const { keys, problems } = entryFields(`
    const a = { field: 'plain', why: 'x', instruction: 'y' };
    const b = { field:
      'wrapped', why: \`a \${ { n: 1 }.n } b\`, instruction: "y" };
    const c = { field: "double", why: 'a { brace', instruction: 'y' };
  `);
  assert.deepEqual([...keys].sort(), ['double', 'plain', 'wrapped']);
  assert.deepEqual(problems, []);
});

test('entryFields reports a shorthand, computed or missing field', () => {
  for (const entry of [
    '({ field, why, instruction })',
    '({ why, field, instruction })',
    '({ field: name, why: 1, instruction: 2 })',
    '({ why: 1, instruction: 2 })',
  ]) {
    assert.equal(entryFields(`const gap = (field) => ${entry};`).problems.length, 1, entry);
  }
});

test('entryFields leaves an unrelated `field` variable alone', () => {
  for (const file of ['espn/codes.mjs', 'analysis/draftOrder.mjs']) {
    assert.deepEqual(entryFields(read(join(SRC, file))).problems, [], file);
  }
  const { keys, problems } = entryFields('const x = { field, other: 1 }; const y = [{ field }];');
  assert.equal(keys.size, 0);
  assert.deepEqual(problems, []);
});
