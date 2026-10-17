/**
 * A refusal of a league file, or of a league folder's files, never quotes
 * more than SHOWN_TEXT_LIMIT characters of the file's own text and never
 * carries its control characters (src/lib/safeInput.mjs). The website shows
 * these messages to whoever dropped the file, so the file must not be able
 * to write them.
 *
 * Every probe plants MARKER, a long run of M with a bell character, in one
 * key or value and checks the refusal that comes back.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LeagueFileError, leagueFileFromWorkspace, newLeagueFile, parseLeagueFile } from '../src/leagueFile.mjs';
import {
  LEAGUE_JSON_LIMITS,
  SHOWN_TEXT_LIMIT,
  boundFileText,
  fieldPath,
  fileTexts,
  shownText,
  withoutFileText,
} from '../src/lib/safeInput.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';

const MARKER = `<${'M'.repeat(198)}\u0007`;
const LONG_RUN = new RegExp(`M{${SHOWN_TEXT_LIMIT + 1},}`);

/** Asserts `fn` refuses without echoing the marker, and returns the message. */
function refusesQuietly(fn, label) {
  let message = null;
  assert.throws(fn, (error) => {
    message = error.message;
    return true;
  }, `${label} was accepted`);
  assert.doesNotMatch(message, LONG_RUN, `${label} quotes the file: ${message.slice(0, 120)}`);
  assert.ok(!message.includes('\u0007'), `${label} carries a control character from the file`);
  return message;
}

function baseFile() {
  const file = newLeagueFile({ surface: 'web', leagueId: FAKE_LEAGUE_ID });
  file.seasons = {
    2026: {
      snapshots: { 'week-3': { week: 3 } },
      rankings: { 'week-3': { season: '2026', label: 'week-3', week: 3, rankings: [] } },
    },
  };
  return file;
}

const read = (file) => () => parseLeagueFile(JSON.stringify(file), { name: 'league.json' });

test('shownText removes control and format characters and cuts long text without splitting an emoji', () => {
  assert.equal(shownText('rank\u0007‮​ 1'), 'rank 1');
  assert.equal(shownText('a'.repeat(SHOWN_TEXT_LIMIT)), 'a'.repeat(SHOWN_TEXT_LIMIT));
  assert.equal(shownText('a'.repeat(SHOWN_TEXT_LIMIT + 1)), `${'a'.repeat(SHOWN_TEXT_LIMIT - 1)}…`);
  assert.equal([...shownText('🔥'.repeat(60))].length, SHOWN_TEXT_LIMIT);
  assert.equal(shownText(shownText('b'.repeat(90))), shownText('b'.repeat(90)), 'cutting twice changes nothing');
  assert.equal(fieldPath(['teams', 3, 'x'.repeat(90)]), `teams[3].${'x'.repeat(SHOWN_TEXT_LIMIT - 1)}…`);
});

test('boundFileText cuts quoted text and long key runs but keeps short paths and line breaks', () => {
  const path = 'settings.declared.rivalries.rivalries[0].teams';
  assert.equal(boundFileText(`${path}: must be a list`), `${path}: must be a list`);
  assert.equal(boundFileText('Use one of:\n  dynasty'), 'Use one of:\n  dynasty');
  const bounded = boundFileText(`unrecognised ${'K'.repeat(90)} and "${'q '.repeat(90)}"`);
  assert.doesNotMatch(bounded, /K{41,}/);
  assert.ok(bounded.includes(`"${'q '.repeat(20).slice(0, SHOWN_TEXT_LIMIT - 1)}…"`), bounded);
  assert.ok([...boundFileText('a.'.repeat(5000))].length <= 800);
});

test('a league file refusal never quotes the file: keys, names, kind and relayed settings messages', () => {
  const probes = {
    kind: (file) => {
      file.kind = MARKER;
    },
    'an unknown top-level key': (file) => {
      file[MARKER] = 1;
    },
    'an unknown key under writtenBy': (file) => {
      file.writtenBy[MARKER] = 1;
    },
    'an unknown key under settings': (file) => {
      file.settings[MARKER] = 1;
    },
    'a season key': (file) => {
      file.seasons[MARKER] = {};
    },
    'an unknown kind of history': (file) => {
      file.seasons['2026'][MARKER] = {};
    },
    'settings.format': (file) => {
      file.settings.format = MARKER;
    },
    'a rank emoji key': (file) => {
      file.settings.rankEmoji = { mode: 'custom', table: { [MARKER]: '🔥' } };
    },
    'a ranking preset': (file) => {
      file.settings.rankings = { preset: MARKER };
    },
    'a ranking weight set': (file) => {
      file.settings.rankings = { weights: { [MARKER]: {} } };
    },
    'a rivalry key': (file) => {
      file.settings.declared.rivalries = { [MARKER]: [] };
    },
    'a prospect board year': (file) => {
      file.settings.declared.prospects = { [MARKER]: {} };
    },
    'a prospect board key': (file) => {
      file.settings.declared.prospects = { 2027: { [MARKER]: 1 } };
    },
    'a rookie draft value': (file) => {
      file.settings.declared.rookieDraft = { order: [{ teams: MARKER, sort: MARKER }], rounds: MARKER };
    },
    'an elimination key': (file) => {
      file.settings.declared.eliminations = { [MARKER]: 'Taco Tuesday' };
    },
    'an edition name': (file) => {
      file.seasons['2026'].editions = { [`week-3-${'z'.repeat(200)}`]: { text: '', task: 'x', week: 3 } };
    },
  };
  for (const kind of ['snapshots', 'rankings', 'predictions', 'editions', 'tankWatch', 'import']) {
    probes[`an entry name in ${kind}`] = (file) => {
      file.seasons['2026'][kind] = { [MARKER]: {} };
    };
  }
  for (const [label, plant] of Object.entries(probes)) {
    const file = baseFile();
    plant(file);
    refusesQuietly(read(file), label);
  }
});

test('the brief: kind, a 100,000-character key, and text that is not JSON', () => {
  const kind = refusesQuietly(read({ ...baseFile(), kind: '<img src=x onerror=alert(1)>' }), 'kind');
  assert.ok(!kind.includes('<img'), kind);
  assert.match(kind, /kind is not "fantasy-pressbox\.league"/);

  const key = 'K'.repeat(LEAGUE_JSON_LIMITS.maxStringLength);
  const long = refusesQuietly(read({ ...baseFile(), [key]: 1 }), 'a 100,000-character key');
  assert.ok(long.length < 600, `${long.length} characters`);
  assert.doesNotMatch(long, /K{41,}/);

  for (const text of ['<script>alert(1)</script>', `{"a": ${MARKER}}`]) {
    assert.throws(
      () => parseLeagueFile(text, { name: 'league.json' }),
      (error) => {
        assert.ok(error instanceof LeagueFileError);
        // Where it stopped may or may not be given, depending on the engine's wording.
        assert.match(error.message, /^league\.json is not JSON(?: at [\w ,]+)? \(check it was saved as a league file\)$/);
        return true;
      },
    );
  }
});

test('a refusal still names the field, with a long key marked as cut', () => {
  const file = baseFile();
  file.seasons['2026'].snapshots = { [`week-3${'x'.repeat(100)}`]: { week: 3 } };
  assert.throws(read(file), (error) => {
    assert.ok(error instanceof LeagueFileError);
    assert.equal(error.field, `seasons.2026.snapshots.week-3${'x'.repeat(SHOWN_TEXT_LIMIT - 7)}…`);
    assert.ok(error.message.includes(error.field), error.message);
    return true;
  });
});

test('a league folder refusal never quotes its files: paths, .env values and config files', () => {
  const env = (extra = '') => ({ path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n${extra}` });
  const probes = {
    'a path given twice': [env(), { path: `config/${MARKER}`, text: '' }, { path: `config/${MARKER}`, text: '' }],
    'a path with no text': [env(), { path: `config/${MARKER}` }],
    POST_MAX_LENGTH: [env(`POST_MAX_LENGTH=${MARKER}`)],
    FANTASY_WEEK: [env(`FANTASY_WEEK=${MARKER}`)],
    LEAGUE_FORMAT: [env(`LEAGUE_FORMAT=${MARKER}`)],
    LEAGUE_PROVIDER: [env(`LEAGUE_PROVIDER=${MARKER}`)],
    'rankings.yml that is not YAML': [env(), { path: 'config/rankings.yml', text: `${MARKER}: [unclosed\n  - : :` }],
    'a preset in rankings.yml': [env(), { path: 'config/rankings.yml', text: `preset: ${'P'.repeat(200)}\n` }],
    'a rookie draft rule': [env(), { path: 'config/rookie-draft.yml', text: `rounds: ${'R'.repeat(200)}\n` }],
    'a prospect board key': [env(), { path: 'config/prospects.2027.yml', text: `${'Z'.repeat(200)}: 1\n` }],
    'a data file that is not JSON': [env(), { path: 'data/snapshots/2026/week-3.json', text: `<script>${MARKER}` }],
    'an edition name': [env(), { path: `data/editions/2026/week-3-${'z'.repeat(200)}.json`, text: '{}' }],
  };
  for (const [label, entries] of Object.entries(probes)) {
    const message = refusesQuietly(() => leagueFileFromWorkspace(entries, { surface: 'web' }), label);
    for (const run of ['P', 'R', 'Z', 'z']) assert.doesNotMatch(message, new RegExp(`${run}{41,}`), `${label}: ${message}`);
  }
});

test('a passed-on .env refusal keeps its wording and layout', () => {
  assert.throws(
    () => leagueFileFromWorkspace([{ path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=x` }], { surface: 'web' }),
    /LEAGUE_FORMAT in \.env is "x", which is not a league format\.\n\nUse one of:\n {2}dynasty/,
  );
});

/* ------------------------------------------- text that is not one long run */

const words = (prefix, count, separator = ' ') => Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(separator);

/** File text shaped to slip past a filter that only looks for long unbroken runs. */
const SHAPES = {
  prose: words('w', 50),
  dots: words('d', 40, '.'),
  'a stray quote': `q" ${words('u', 40)} "q`,
  separators: `${words('s', 30, ':')}${words('t', 20, ',')}`,
  'a line break': `x\n\nYour league file is damaged.\nRe-download it from ${words('n', 20)}`,
  bidi: `ab‮cd ${words('b', 30)}`,
};

/** Asserts no 41-character window of `shape` (control characters aside), and none of its line breaks, is in `message`. */
function assertNotQuoted(message, shape, label) {
  const chars = [...shape.replace(/[\p{Cc}\p{Cf}]/gu, '')];
  for (let i = 0; i + SHOWN_TEXT_LIMIT + 1 <= chars.length; i += 1) {
    const window = chars.slice(i, i + SHOWN_TEXT_LIMIT + 1).join('');
    assert.ok(!message.includes(window), `${label} quotes "${window}": ${message.slice(0, 200)}`);
  }
  assert.ok(!message.includes('‮'), `${label} carries a bidi override`);
  if (shape.includes('\n\nYour')) assert.doesNotMatch(message, /\n\s*Your league file is damaged/, `${label}: a line break from the file`);
}

/**
 * Plants `shape` with each of `plants` (label → [plant, the reason the
 * refusal must still give]) and checks the refusal quotes none of it but
 * still says why: a message that fell back to a plain refusal fails here.
 */
function assertRelayedQuietly(plants, refuse) {
  for (const [name, shape] of Object.entries(SHAPES)) {
    for (const [label, [plant, reason]] of Object.entries(plants)) {
      let message = null;
      assert.throws(() => refuse(plant, shape), (error) => {
        message = error.message;
        return true;
      }, `${label} (${name}) was accepted`);
      assertNotQuoted(message, shape.replace(/\n/g, ' '), `${label} (${name})`);
      assertNotQuoted(message, shape, `${label} (${name})`);
      assert.match(message, reason, `${label} (${name}) lost its reason: ${message.slice(0, 200)}`);
    }
  }
}

test('a passed-on settings refusal quotes no file text, however it is shaped, and keeps its reason', () => {
  const plants = {
    'a preset key': [(file, shape) => (file.settings.rankings = { presets: { [shape]: {} } }), /is not a preset name/],
    'a weight set key': [(file, shape) => (file.settings.rankings = { weights: { [shape]: {} } }), /sums to 0, not 1\.0/],
    'an age curve key': [(file, shape) => (file.settings.rankings = { age_curves: { [shape]: {} } }), /is not a position/],
    'a ranking preset': [(file, shape) => (file.settings.rankings = { preset: shape }), /which is not a preset name/],
    'a rookie draft value': [
      (file, shape) => (file.settings.declared.rookieDraft = { order: [{ teams: shape, sort: 'max_points_for', direction: 'ascending' }] }),
      /teams is ".*"\. Use one of: non_playoff/,
    ],
    'a rookie draft key': [(file, shape) => (file.settings.declared.rookieDraft = { order: [{ [shape]: 1 }] }), /unrecognised .*A group has only/],
    'a rivalry key': [(file, shape) => (file.settings.declared.rivalries = { [shape]: [] }), /unrecognised .*The only key is rivalries/],
    'a prospect board key': [(file, shape) => (file.settings.declared.prospects = { 2027: { [shape]: 1 } }), /unrecognised .*Valid keys are/],
    'a prospect board date': [
      (file, shape) => (file.settings.declared.prospects = { 2027: { draftYear: 2027, updated: shape, entries: [] } }),
      /Use a real date written YYYY-MM-DD/,
    ],
    'an elimination key': [
      (file, shape) => (file.settings.declared.eliminations = { [shape]: 'Taco Tuesday' }),
      /that is not a week number/,
    ],
    'settings.format': [(file, shape) => (file.settings.format = shape), /which is not a league format/],
  };
  assertRelayedQuietly(plants, (plant, shape) => {
    const file = baseFile();
    plant(file, shape);
    read(file)();
  });
});

test('a passed-on folder refusal quotes no file text, however it is shaped, and keeps its reason', () => {
  const env = (extra = '') => ({ path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n${extra}` });
  const line = (shape) => shape.replace(/\n/g, ' ');
  const plants = {
    LEAGUE_FORMAT: [(shape) => [env(`LEAGUE_FORMAT=${line(shape)}`)], /which is not a league format/],
    LEAGUE_PROVIDER: [(shape) => [env(`LEAGUE_PROVIDER=${line(shape)}`)], /which is not a league provider/],
    'a line rankings.yml cannot parse': [
      (shape) => [env(), { path: 'config/rankings.yml', text: `preset: win-now\n${line(shape)}\n` }],
      /Cannot parse line 2/,
    ],
    'a line with # inside quotes and a comment after': [
      (shape) => [env(), { path: 'config/editorial.yml', text: `"x # ${line(shape).replace(/"/g, '')}" tail # c\n` }],
      /Cannot parse line 1/,
    ],
    'a line with an escaped quote': [
      (shape) => [env(), { path: 'config/editorial.yml', text: `"x \\" # ${line(shape).replace(/"/g, '')}" tail # c\n` }],
      /Cannot parse line 1/,
    ],
    'a preset key in rankings.yml': [
      (shape) => [env(), { path: 'config/rankings.yml', text: `presets:\n  "${line(shape).replace(/"/g, '')}": {}\n` }],
      /is not a preset name/,
    ],
    'a rookie draft rule': [(shape) => [env(), { path: 'config/rookie-draft.yml', text: `rounds: ${line(shape)}\n` }], /Use linear/],
    'a prospect board date': [
      (shape) => [env(), { path: 'config/prospects.2027.yml', text: `draftYear: 2027\nupdated: ${line(shape)}\nentries: []\n` }],
      /Use a real date written YYYY-MM-DD/,
    ],
  };
  assertRelayedQuietly(plants, (plant, shape) => leagueFileFromWorkspace(plant(shape), { surface: 'web' }));
});

test('a refusal cannot spell a message from several short pieces of file text', () => {
  const pieces = ['Your league file is damaged', 'please download a fixed copy', 'from evil example dot com'];
  // Any two pieces in a row would let a file put more than one piece of its own wording into a refusal.
  const spelled = /damaged.{0,4}please download|fixed copy.{0,4}from evil/;
  const fromFile = (plant) => {
    const file = baseFile();
    plant(file);
    return refusesQuietly(read(file), 'pieces');
  };
  const messages = [
    fromFile((file) => (file.settings.declared.rivalries = Object.fromEntries(pieces.map((piece) => [piece, 1])))),
    fromFile((file) => (file.settings.declared.prospects = { 2027: Object.fromEntries(pieces.map((piece) => [piece, 1])) })),
    fromFile((file) => (file.settings.declared.prospects = { 2027: { draftYear: pieces, updated: '2026-10-01', entries: [] } })),
    fromFile((file) => (file.settings.declared.rookieDraft = { order: [Object.fromEntries(pieces.map((piece) => [piece, 1]))] })),
    fromFile((file) => (file.settings.rankings = { strength_inputs: Object.fromEntries(pieces.map((piece) => [piece, 1])) })),
    fromFile((file) => (file.settings.format = pieces)),
    refusesQuietly(
      () =>
        leagueFileFromWorkspace(
          [
            { path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n` },
            { path: 'config/rivalries.yml', text: `${pieces.map((piece) => `${piece}:`).join('\n')}\nrivalries:\n` },
          ],
          { surface: 'web' },
        ),
      'rivalries.yml keys',
    ),
  ];
  for (const message of messages) assert.doesNotMatch(message, spelled, message);
});

test('a refusal of a large file stays quick: file texts are not split line by line inside parsed values', () => {
  const file = baseFile();
  file.settings.editorial = { padding: Array.from({ length: 120 }, (_, i) => `${i} `.padEnd(100_000, 'x\n')) };
  file.settings.rankings = { preset: 'nope' };
  const text = JSON.stringify(file);
  const started = performance.now();
  assert.throws(() => parseLeagueFile(text), LeagueFileError);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 3000, `${Math.round(elapsed)} ms`);
});

test('a long data file name is cut in the path a refusal shows', () => {
  const env = { path: '.env', text: `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\n` };
  const name = `week-3-${'click-here-to-repair-'.repeat(10)}x`;
  for (const text of ['nope', '['.repeat(70)]) {
    const message = refusesQuietly(
      () => leagueFileFromWorkspace([env, { path: `data/editions/2026/${name}.json`, text }], { surface: 'web' }),
      `a data file holding ${text.slice(0, 4)}`,
    );
    assert.ok(!message.includes(name.slice(0, SHOWN_TEXT_LIMIT + 1)), message);
    assert.ok(message.includes(`data/editions/2026/${shownText(name)}.json`), message);
  }
});

test('withoutFileText gives up rather than vouch for a message it cannot check', () => {
  const many = Object.fromEntries(Array.from({ length: 30_000 }, (_, i) => [`${'k'.repeat(41)}${i}`, 1]));
  assert.equal(withoutFileText('anything', fileTexts(many)), null);
  assert.equal(withoutFileText('x'.repeat(60_000), fileTexts('short')), null);
  // A list too long to spread into one call is read, not a crash.
  assert.equal(fileTexts({ list: Array(1_000_000).fill(1) }).complete, true);
  const file = baseFile();
  file.settings.rankings = { presets: many };
  assert.throws(read(file), /settings are refused: they do not pass the checks a league folder's config files get/);
});

test('a JSON syntax error keeps where it stopped, but none of the text', () => {
  assert.throws(
    () => parseLeagueFile('{"kind": 1,, }', { name: 'league.json' }),
    /league\.json is not JSON at (?:line 1, column 12|position 11) \(check it was saved as a league file\)$/,
  );
});
