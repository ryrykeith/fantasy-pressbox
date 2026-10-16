/**
 * config/rivalries.yml (src/rivalries.mjs).
 *
 * Every team, name and note here is invented: the mock dynasty league's cast.
 * No real rivalry belongs in the repository.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, loadConfig, loadDiskAssets } from '../src/config.mjs';
import { prepareEdition } from '../src/edition.mjs';
import { describeInspection, inspectLeague } from '../src/inspect.mjs';
import { createMemoryPlayerCache } from '../src/playerCache.mjs';
import { createMemoryStore } from '../src/storeCore.mjs';
import {
  RIVALRY_NAME_MAX_LENGTH,
  RIVALRY_NOTE_MAX_LENGTH,
  checkRivalries,
  parseRivalries,
  resolveRivalries,
} from '../src/rivalries.mjs';
import { UnsafeInputError } from '../src/lib/safeInput.mjs';
import { createTeamIdentity } from '../src/teamIdentity.mjs';
import { FAKE_LEAGUE_ID } from './fixtures/fake-sleeper-api-fetch.mjs';
import { BYE_WEEK_BLUES, PUNT_INTENDED, TEAMS_AFTER_WEEK_4 } from './fixtures/mock-dynasty-league.mjs';

const teams = TEAMS_AFTER_WEEK_4.map(({ rosterId, name }) => ({ rosterId, name, manager: `user${rosterId}` }));
const identity = createTeamIdentity({ teams });

/** A rivalries.yml from `[teams, extra lines]` entries, teams written one per line. */
const yamlOf = (...entries) =>
  `rivalries:\n${entries
    .map(([pair, extra = []]) => [`  - teams:`, ...pair.map((team) => `      - ${team}`), ...extra.map((line) => `    ${line}`)].join('\n'))
    .join('\n')}\n`;

const parse = (...entries) => parseRivalries(yamlOf(...entries));
const resolve = (declared, who = identity) => resolveRivalries(declared, who);

test('the shipped example declares no rivalries and explains the file', () => {
  const text = readFileSync(join(PACKAGE_ROOT, 'config', 'rivalries.yml'), 'utf8');
  assert.deepEqual(parseRivalries(text), []);
  assert.match(text, /teams:/);
  assert.match(text, /note:/);
});

test('an absent or empty file declares nothing', () => {
  assert.deepEqual(parseRivalries(null), []);
  assert.deepEqual(parseRivalries(''), []);
  assert.deepEqual(parseRivalries('rivalries:\n'), []);
  assert.deepEqual(parseRivalries('# only comments\n'), []);
});

test('a rivalry has two teams and an optional name and note', () => {
  const [rivalry] = parse([
    ['Bye Week Blues', 'Punt Intended'],
    ['name: The Invented Cup', 'note: Started over an invented waiver claim.'],
  ]);
  assert.deepEqual(rivalry.teams, ['Bye Week Blues', 'Punt Intended']);
  assert.equal(rivalry.name, 'The Invented Cup');
  assert.equal(rivalry.note, 'Started over an invented waiver claim.');
  const [bare] = parse([['Bye Week Blues', '2']]);
  assert.deepEqual(bare.teams, ['Bye Week Blues', 2]);
  assert.equal(bare.name, null);
  assert.equal(bare.note, null);
});

test('a malformed file is refused, naming the rivalry', () => {
  const refused = (text, pattern) => assert.throws(() => parseRivalries(text), pattern);
  refused('rivals: []\n', /unrecognised rivals/);
  refused('rivalries: nope\n', /must be a list/);
  refused('rivalries:\n  - nope\n', /rivalry 1 must be a table/);
  refused(yamlOf([['Bye Week Blues']]), /rivalry 1: teams must list exactly two/);
  refused(yamlOf([['A', 'B', 'C']]), /rivalry 1: teams must list exactly two/);
  refused(yamlOf([['A', 'B'], ['nickname: x']]), /rivalry 1: unrecognised nickname/);
  refused(yamlOf([['A', '""']]), /rivalry 1: each team must be a team name or a roster id/);
  refused(yamlOf([['A', 'B']], [['C']]), /rivalry 2: teams must list exactly two/);
});

test('teams written in brackets are refused with the form to use', () => {
  assert.throws(
    () => parseRivalries('rivalries:\n  - teams: [Bye Week Blues, Punt Intended]\n'),
    /rivalry 1: write teams as a list, one team per line/,
  );
});

test('name and note are length-limited and refusals never echo them', () => {
  const secret = 'x'.repeat(RIVALRY_NOTE_MAX_LENGTH + 1);
  assert.throws(
    () => parse([['A', 'B'], [`note: ${secret}`]]),
    (error) => {
      assert.ok(error instanceof UnsafeInputError);
      assert.match(error.message, /rivalries\[0\]\.note longer than 200 characters/);
      assert.ok(!error.message.includes(secret));
      return true;
    },
  );
  assert.throws(
    () => parse([['A', 'B'], [`name: ${'n'.repeat(RIVALRY_NAME_MAX_LENGTH + 1)}`]]),
    /rivalries\[0\]\.name longer than 60 characters/,
  );
  const [atLimit] = parse([['A', 'B'], [`note: ${'x'.repeat(RIVALRY_NOTE_MAX_LENGTH)}`]]);
  assert.equal(atLimit.note.length, RIVALRY_NOTE_MAX_LENGTH);
});

test('a note that is not text, or not one line, is refused without echoing it', () => {
  assert.throws(() => parse([['A', 'B'], ['name: 42']]), /rivalry 1: name must be text/);
  // The reader has no multi-line strings; whatever it says, the note is not repeated.
  const block = 'rivalries:\n  - teams:\n      - A\n      - B\n    note: |\n      first private line\n';
  assert.throws(
    () => parseRivalries(block),
    (error) => !/private/.test(error.message),
  );
});

test('hostile keys are refused by the safe-input rules', () => {
  assert.throws(() => parse([['A', 'B'], ['__proto__: x']]), /__proto__/);
});

test('teams resolve to roster ids, by name or by roster id, in ascending order', () => {
  const rivalries = resolve(
    parse([['Punt Intended', 'bye week blues'], ['name: Cup']], [['3', 'Sunday Scaries']]),
  );
  assert.deepEqual(rivalries[0].rosterIds, [BYE_WEEK_BLUES, PUNT_INTENDED]);
  assert.deepEqual(rivalries[0].teams, ['Bye Week Blues', 'Punt Intended']);
  assert.equal(rivalries[0].name, 'Cup');
  assert.deepEqual(rivalries[1].rosterIds, [3, 4]);
});

test('a renamed team keeps its rivalry', () => {
  const renamed = createTeamIdentity({
    teams: teams.map((t) => (t.rosterId === BYE_WEEK_BLUES ? { ...t, name: 'Blues Reborn' } : t)),
    history: [{ week: 2, rosterId: BYE_WEEK_BLUES, name: 'Bye Week Blues' }],
  });
  const [rivalry] = resolve(parse([['Bye Week Blues', 'Punt Intended']]), renamed);
  assert.deepEqual(rivalry.rosterIds, [BYE_WEEK_BLUES, PUNT_INTENDED]);
  assert.deepEqual(rivalry.teams, ['Blues Reborn', 'Punt Intended']);
  // Written by roster id, no name is needed at all.
  assert.deepEqual(resolve(parse([['1', '2']]), renamed)[0].rosterIds, [1, 2]);
});

test('an unknown team is refused, naming the rivalry and the team', () => {
  assert.throws(
    () => resolve(parse([['Bye Week Blues', 'Nobody United']])),
    /rivalry 1 \("Bye Week Blues" and "Nobody United"\): "Nobody United" is not a team/,
  );
  assert.throws(
    () => resolve(parse([['1', '99']])),
    /rivalry 1 \(roster 1 and roster 99\): roster 99 is not a team/,
  );
});

test('an ambiguous team name is refused, naming the rivalry', () => {
  // A name two teams once went by, that neither goes by now.
  const clash = createTeamIdentity({
    teams,
    history: [
      { week: 1, rosterId: 2, name: 'Old Name' },
      { week: 2, rosterId: 9, name: 'Old Name' },
    ],
  });
  assert.throws(
    () => resolve(parse([['Bye Week Blues', 'Old Name']]), clash),
    /rivalry 1 .*"Old Name" has meant more than one team/,
  );
});

test('a pair of the same team is refused, however it is written', () => {
  for (const pair of [['Punt Intended', 'Punt Intended'], ['Punt Intended', '2'], ['2', '2']]) {
    assert.throws(() => resolve(parse([pair])), /rivalry 1 .*a rivalry needs two different teams/, pair.join(' / '));
  }
});

test('a duplicate pair is refused in either order, naming both entries', () => {
  assert.throws(
    () =>
      resolve(parse([['Bye Week Blues', 'Punt Intended']], [['Sunday Scaries', 'Pick Six Appeal']], [['2', 'Bye Week Blues']])),
    /rivalry 3 .*already declared as rivalry 1/,
  );
  // A team may have several rivals.
  const several = resolve(parse([['Bye Week Blues', 'Punt Intended']], [['Bye Week Blues', 'Sunday Scaries']]));
  assert.equal(several.length, 2);
});

test('refusals never repeat the name or the note', () => {
  const declared = parse([['Bye Week Blues', 'Nobody United'], ['name: Private Cup Name', 'note: Private backstory.']]);
  const { problems } = checkRivalries(declared, identity);
  assert.equal(problems.length, 1);
  assert.doesNotMatch(problems[0].message, /Private/);
  assert.throws(() => resolve(declared), (error) => !/Private/.test(error.message));
});

test('checkRivalries reports every problem and still resolves the rest', () => {
  const declared = parse(
    [['Bye Week Blues', 'Nobody United']],
    [['Sunday Scaries', 'Pick Six Appeal']],
    [['Taco Tuesday', 'Taco Tuesday']],
  );
  const { rivalries, problems } = checkRivalries(declared, identity);
  assert.deepEqual(problems.map((p) => [p.index, p.code]), [[0, 'unknown-team'], [2, 'same-team']]);
  assert.equal(rivalries.length, 1);
  assert.deepEqual(rivalries[0].teams, ['Sunday Scaries', 'Pick Six Appeal']);
});

/* ---------------------------------------- config, prepareEdition, inspect */

const folders = [];
after(() => {
  for (const root of folders) rmSync(root, { recursive: true, force: true });
});

/** A league folder for the fake Sleeper league, with `rivalriesYml` as its config/rivalries.yml when given. */
function leagueFolder(rivalriesYml = null) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-rivalries-')));
  folders.push(root);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${FAKE_LEAGUE_ID}\nLEAGUE_FORMAT=redraft\n`);
  if (rivalriesYml !== null) writeFileSync(join(root, 'config', 'rivalries.yml'), rivalriesYml);
  return root;
}

const configFor = (root) => loadConfig({ workspaceRoot: root, envPath: join(root, '.env') });

test('loadConfig reads the league folder’s rivalries, and none when the file is absent', () => {
  const none = configFor(leagueFolder());
  assert.deepEqual(none.rivalries, []);
  assert.equal(none.sources.rivalries, null);
  const root = leagueFolder(yamlOf([['Bye Week Blues', 'Punt Intended'], ['name: The Invented Cup']]));
  const config = configFor(root);
  assert.equal(config.rivalries.length, 1);
  assert.equal(config.rivalries[0].name, 'The Invented Cup');
  assert.equal(config.sources.rivalries, join(root, 'config', 'rivalries.yml'));
  // The shipped example, copied into a league folder, declares nothing.
  const example = readFileSync(join(PACKAGE_ROOT, 'config', 'rivalries.yml'), 'utf8');
  assert.deepEqual(configFor(leagueFolder(example)).rivalries, []);
});

test('a malformed config/rivalries.yml stops loadConfig, naming the file and not the note', () => {
  const root = leagueFolder(yamlOf([['A', 'B'], [`note: ${'x'.repeat(RIVALRY_NOTE_MAX_LENGTH + 1)}`]]));
  assert.throws(
    () => configFor(root),
    (error) => error.message.includes('rivalries.yml') && !error.message.includes('xxxxxxxx'),
  );
});

async function prepare(rivalriesYml) {
  await import('./fixtures/fake-sleeper-api-fetch.mjs');
  const config = configFor(leagueFolder(rivalriesYml));
  return prepareEdition({
    task: 'preview',
    week: 1,
    settings: { ...config, playerCache: createMemoryPlayerCache() },
    store: createMemoryStore(),
    assets: loadDiskAssets({ promptsDir: config.promptsDir }),
    log: { say() {}, warn() {} },
  });
}

test('prepareEdition resolves the declared rivalries against the league’s teams', async () => {
  const built = await prepare(yamlOf([['Punt Intended', '1'], ['name: The Invented Cup']]));
  assert.equal(built.rivalries.length, 1);
  assert.deepEqual(built.rivalries[0].rosterIds, [1, 2]);
  assert.deepEqual(built.rivalries[0].teams, ['Bye Week Blues', 'Punt Intended']);
  assert.equal((await prepare(null)).rivalries.length, 0);
});

test('prepareEdition refuses a rivalry whose team is not in the league, naming the rivalry', async () => {
  await assert.rejects(
    prepare(yamlOf([['Bye Week Blues', 'Nobody United'], ['note: Private backstory.']])),
    (error) => /rivalry 1 .*"Nobody United" is not a team/.test(error.message) && !/Private/.test(error.message),
  );
  await assert.rejects(prepare(yamlOf([['Punt Intended', '2']])), /rivalry 1 .*two different teams/);
});

test('inspectLeague reports a rivalry that no longer resolves, and says when it could not check', () => {
  const declared = parse([['Bye Week Blues', 'Punt Intended']], [['Bye Week Blues', 'Departed Dynasty']]);
  const store = () => createMemoryStore();
  const report = inspectLeague({ store: store(), provider: 'sleeper', rivalries: declared, teams });
  assert.equal(report.rivalries.declared, 2);
  assert.equal(report.rivalries.checked, true);
  assert.deepEqual(report.rivalries.unresolved.map((p) => [p.index, p.code]), [[1, 'unknown-team']]);
  assert.ok(report.problems.some((p) => p.code === 'rivalry-unknown-team' && /rivalry 2 .*Departed Dynasty/.test(p.message)));
  assert.match(describeInspection(report).rivalries.join('\n'), /2 declared, 1 no longer resolve[\s\S]*rivalry 2/);

  const ok = inspectLeague({ store: store(), provider: 'sleeper', rivalries: declared.slice(0, 1), teams });
  assert.deepEqual(ok.rivalries.unresolved, []);
  assert.match(describeInspection(ok).rivalries.join('\n'), /every one resolves/);

  // No team list anywhere: not checked, and not claimed fine.
  const blind = inspectLeague({ store: store(), provider: 'sleeper', rivalries: declared });
  assert.equal(blind.rivalries.checked, false);
  assert.match(describeInspection(blind).rivalries.join('\n'), /not checked yet/);

  // A league with none declared has nothing to say.
  assert.deepEqual(describeInspection(inspectLeague({ store: store(), provider: 'sleeper' })).rivalries, []);
});

test('inspectLeague checks against the latest saved week’s teams, through renames', () => {
  const store = createMemoryStore();
  store.saveSnapshot('2026', 1, { week: 1, teams: [{ rosterId: 1, name: 'Bye Week Blues' }, { rosterId: 2, name: 'Punt Intended' }] });
  store.saveSnapshot('2026', 3, {
    week: 3,
    league: { name: 'Invented League' },
    teams: [{ rosterId: 1, name: 'Blues Reborn' }, { rosterId: 2, name: 'Punt Intended' }],
  });
  const declared = parse([['Bye Week Blues', 'Punt Intended']]);
  const report = inspectLeague({ store, provider: 'sleeper', season: '2026', rivalries: declared });
  assert.equal(report.rivalries.checked, true);
  assert.deepEqual(report.rivalries.unresolved, []);
});
