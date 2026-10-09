import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, PACKAGE_ROOT } from '../src/config.mjs';
import { parseYaml } from '../src/lib/yaml.mjs';
import {
  DRAFT_ORDER_DIRECTIONS,
  DRAFT_ORDER_SORTS,
  DRAFT_ORDER_TEAMS,
  describeDraftOrder,
  draftOrderGroupSizes,
  parseDeclaredDraftOrder,
  requireDraftOrderRule,
} from '../src/rookieDraft.mjs';

/**
 * The declared rookie draft order rule.
 *
 * Sleeper reports nothing about how a rookie draft is ordered, so the rule is
 * declared in config/rookie-draft.yml, like a guillotine ledger. The fixture is
 * the operator's own league: the six teams that miss the playoffs pick 1-6,
 * lowest max points-for first, then the six playoff teams pick 7-12, also
 * lowest max points-for first.
 */

const THIS_LEAGUE_YAML = `
order:
  - teams: non_playoff
    sort: max_points_for
    direction: ascending
  - teams: playoff
    sort: max_points_for
    direction: ascending
`;

const THIS_LEAGUE_RULE = {
  groups: [
    { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
    { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
  ],
};

const NO_ENV_FILE = join(PACKAGE_ROOT, 'tests', '.env.does-not-exist');

function withRookieDraftFile(body, contents) {
  const path = join(mkdtempSync(join(tmpdir(), 'pressbox-config-')), 'rookie-draft.yml');
  if (contents !== undefined) writeFileSync(path, contents);
  return body(path);
}

const parseRule = (yaml) => parseDeclaredDraftOrder(parseYaml(yaml).order);

/* ---------------------------------------------------------------- the YAML */

test('a list item can be a map spread over several lines', () => {
  assert.deepEqual(parseYaml('order:\n  - teams: playoff\n    sort: record\n  - teams: all\n'), {
    order: [{ teams: 'playoff', sort: 'record' }, { teams: 'all' }],
  });
});

test('a list item map with stray indentation is still refused', () => {
  assert.throws(() => parseYaml('order:\n  - teams: playoff\n     sort: record\n'), /indentation/);
});

/* ------------------------------------------------------------ the declared rule */

test("this league's rule parses into ordered groups", () => {
  assert.deepEqual(parseRule(THIS_LEAGUE_YAML), THIS_LEAGUE_RULE);
});

test('no declaration is null, not a default rule', () => {
  assert.equal(parseDeclaredDraftOrder(undefined), null);
  assert.equal(parseDeclaredDraftOrder(null), null);
});

test('an unknown team group fails, listing the valid ones', () => {
  assert.throws(
    () => parseRule('order:\n  - teams: losers\n    sort: max_points_for\n    direction: ascending\n'),
    (error) =>
      /"losers"/.test(error.message) && DRAFT_ORDER_TEAMS.every((value) => error.message.includes(value)),
  );
});

test('an unknown sort key fails, listing the valid ones', () => {
  assert.throws(
    () => parseRule('order:\n  - teams: all\n    sort: vibes\n    direction: ascending\n'),
    (error) => /"vibes"/.test(error.message) && DRAFT_ORDER_SORTS.every((value) => error.message.includes(value)),
  );
});

test('an unknown or missing direction fails, listing the valid ones', () => {
  for (const yaml of [
    'order:\n  - teams: all\n    sort: record\n    direction: sideways\n',
    'order:\n  - teams: all\n    sort: record\n',
  ]) {
    assert.throws(
      () => parseRule(yaml),
      (error) => DRAFT_ORDER_DIRECTIONS.every((value) => error.message.includes(value)),
    );
  }
});

test('an unrecognised key in a group is refused rather than ignored', () => {
  assert.throws(
    () => parseRule('order:\n  - teams: all\n    sort: record\n    direction: ascending\n    tiebreak: coin\n'),
    /tiebreak/,
  );
});

test('the groups must cover every team exactly once', () => {
  // Playoff teams with nowhere to pick.
  assert.throws(
    () => parseRule('order:\n  - teams: non_playoff\n    sort: record\n    direction: ascending\n'),
    /playoff/,
  );
  // A team set named twice.
  assert.throws(
    () =>
      parseRule(
        'order:\n  - teams: playoff\n    sort: record\n    direction: ascending\n' +
          '  - teams: playoff\n    sort: points_for\n    direction: ascending\n',
      ),
    /more than once/,
  );
  // `all` alongside another group would put teams in the draft twice.
  assert.throws(
    () =>
      parseRule(
        'order:\n  - teams: all\n    sort: record\n    direction: ascending\n' +
          '  - teams: playoff\n    sort: record\n    direction: ascending\n',
      ),
    /all/,
  );
});

test('a lottery is accepted as a word but refused when a draft order is needed', () => {
  const rule = parseRule(
    'order:\n  - teams: non_playoff\n    sort: lottery\n  - teams: playoff\n    sort: max_points_for\n    direction: ascending\n',
  );
  assert.equal(rule.groups[0].sort, 'lottery');
  assert.throws(() => requireDraftOrderRule(rule), /lottery.*not.*supported/is);
});

/* ------------------------------------------------------------ the refusal */

test('no declared rule means no projected draft order, and the refusal says how to fix it', () => {
  assert.throws(
    () => requireDraftOrderRule(null),
    (error) =>
      error.message.includes('config/rookie-draft.yml') &&
      /\border\b/.test(error.message) &&
      error.message.includes(THIS_LEAGUE_YAML.trim()),
  );
});

test('a declared, supported rule passes through', () => {
  assert.deepEqual(requireDraftOrderRule(THIS_LEAGUE_RULE), THIS_LEAGUE_RULE);
});

/* ------------------------------------------------------------ group sizes */

test('group sizes come from the number of playoff teams', () => {
  assert.deepEqual(draftOrderGroupSizes(THIS_LEAGUE_RULE, { teamCount: 12, playoffTeams: 6 }), [
    { teams: 'non_playoff', size: 6, firstPick: 1, lastPick: 6 },
    { teams: 'playoff', size: 6, firstPick: 7, lastPick: 12 },
  ]);
  assert.deepEqual(
    draftOrderGroupSizes(
      { groups: [{ teams: 'all', sort: 'record', direction: 'ascending' }] },
      { teamCount: 10, playoffTeams: null },
    ),
    [{ teams: 'all', size: 10, firstPick: 1, lastPick: 10 }],
  );
});

test('a playoff split without a known playoff field size is refused', () => {
  assert.throws(() => draftOrderGroupSizes(THIS_LEAGUE_RULE, { teamCount: 12, playoffTeams: null }), /playoff/);
  assert.throws(() => draftOrderGroupSizes(THIS_LEAGUE_RULE, { teamCount: 12, playoffTeams: 14 }), /playoff/);
});

/* ------------------------------------------------------------ doctor */

test('the rule reads in plain words, with pick ranges once the league is known', () => {
  assert.deepEqual(describeDraftOrder(THIS_LEAGUE_RULE, { teamCount: 12, playoffTeams: 6, rounds: 'linear' }), [
    'Rookie draft order declared in config/rookie-draft.yml:',
    '  picks 1-6: the 6 teams that miss the playoffs, lowest max points-for first',
    '  picks 7-12: the 6 playoff teams, lowest max points-for first',
    "  later rounds: linear, every round in round 1's order (1.07, 2.07, 3.07)",
  ]);
});

test('an undeclared round order reads as a missing setting, saying what it would unlock', () => {
  const lines = describeDraftOrder(THIS_LEAGUE_RULE, { teamCount: 12, playoffTeams: 6 });
  assert.match(lines.at(-1), /later rounds .*not declared.*linear or snake/);
});

test('an undeclared rule reads as a missing setting, naming where to set it', () => {
  const [line] = describeDraftOrder(null, { teamCount: 12, playoffTeams: 6 });
  assert.match(line, /not declared/);
  assert.match(line, /config\/rookie-draft\.yml/);
});

test('a lottery group reads as unsupported in doctor', () => {
  const lines = describeDraftOrder(
    {
      groups: [
        { teams: 'non_playoff', sort: 'lottery', direction: null },
        { teams: 'playoff', sort: 'record', direction: 'descending' },
      ],
    },
    { teamCount: 12, playoffTeams: 6 },
  );
  assert.match(lines[1], /lottery.*not yet supported/);
  assert.equal(lines[2], '  picks 7-12: the 6 playoff teams, best record first');
});

/* ------------------------------------------------------------ config load */

test('the declared rule is read from config/rookie-draft.yml', () => {
  withRookieDraftFile(
    (rookieDraftPath) => {
      assert.deepEqual(loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath }).rookieDraft.order, THIS_LEAGUE_RULE);
    },
    THIS_LEAGUE_YAML,
  );
});

test('a league with no rookie-draft file declares no rule', () => {
  withRookieDraftFile((rookieDraftPath) => {
    assert.equal(loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath }).rookieDraft.order, null);
  });
});

// This repository runs one league, and its rule is committed here on purpose:
// until league workspaces land, config/ is that league's config. The test
// guards that what is committed parses, rather than that it is empty.
test('the committed config/rookie-draft.yml is readable and declares a projectable rule', () => {
  const config = loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath: join(PACKAGE_ROOT, 'config', 'rookie-draft.yml') });
  assert.deepEqual(config.rookieDraft.order, THIS_LEAGUE_RULE);
  assert.equal(config.rookieDraft.rounds, 'linear');
});

test('a misspelled rule stops the run at config load, naming the file', () => {
  withRookieDraftFile(
    (rookieDraftPath) => {
      assert.throws(
        () => loadConfig({ envPath: NO_ENV_FILE, rookieDraftPath }),
        (error) => /rookie-draft\.yml/.test(error.message) && /max_points_for/.test(error.message),
      );
    },
    'order:\n  - teams: all\n    sort: max_pf\n    direction: ascending\n',
  );
});
