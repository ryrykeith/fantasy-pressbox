import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_EDITORIAL,
  DEFAULT_ESPN_ROUTE,
  ESPN_ROUTES,
  LEAGUE_ID_KEYS,
  parseEspnRoute,
  parseLeagueProvider,
  rankEmoji,
  resolveSettings,
} from '../src/settings.mjs';

test('settings.mjs imports nothing from node: and never reads process or import.meta', () => {
  const source = readFileSync(new URL('../src/settings.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]node:/);
  assert.doesNotMatch(source, /\bprocess\.(env|cwd|argv|exit)/);
  assert.doesNotMatch(source, /import\.meta\./);
});

test('with no layers, resolveSettings returns the built-in defaults', () => {
  const settings = resolveSettings();
  assert.deepEqual(settings.editorial, DEFAULT_EDITORIAL);
  assert.ok(settings.rankings.weights.dynasty);
  assert.deepEqual(settings.guillotine, { eliminations: [] });
  assert.deepEqual(settings.rookieDraft, { order: null, rounds: null, tankWatch: { startWeek: null } });
});

test('resolveSettings does not modify the built-in defaults or its inputs', () => {
  const before = JSON.stringify(DEFAULT_EDITORIAL);
  const league = { editorial: { tone: 'dry', output: { sleeper_max_chars: 500 } } };
  const copy = JSON.stringify(league);
  const settings = resolveSettings({ league, overrides: { editorial: { tone: 'warm' } } });
  assert.equal(settings.editorial.tone, 'warm');
  assert.equal(settings.editorial.output.sleeper_max_chars, 500);
  assert.equal(JSON.stringify(DEFAULT_EDITORIAL), before);
  assert.equal(JSON.stringify(league), copy);
});

test('layers apply lowest first: defaults, then league, then overrides', () => {
  const settings = resolveSettings({
    defaults: { editorial: { tone: 'shipped', roast_intensity: 'high' } },
    league: { editorial: { tone: 'league', roast_intensity: 'low' } },
    overrides: { editorial: { tone: 'env' } },
  });
  assert.equal(settings.editorial.tone, 'env');
  assert.equal(settings.editorial.roast_intensity, 'low');
});

test('a ranking_emoji table is replaced, not merged, at every layer', () => {
  const settings = resolveSettings({
    defaults: { editorial: { ranking_emoji: { 1: 'A', 2: 'B', 3: 'C' } } },
    league: { editorial: { ranking_emoji: { 1: 'X', 2: 'Y' } } },
  });
  assert.deepEqual(settings.editorial.ranking_emoji, { 1: 'X', 2: 'Y' });

  const shippedOnly = resolveSettings({ defaults: { editorial: { ranking_emoji: { 1: 'A' } } } });
  assert.deepEqual(shippedOnly.editorial.ranking_emoji, { 1: 'A' }, 'a short table does not get the built-ins back');
});

test('awards and banned_phrases are replaced, not merged', () => {
  const settings = resolveSettings({
    defaults: {
      editorial: {
        awards: { best: { title: 'Best' }, worst: { title: 'Worst' } },
        banned_phrases: { a: 1, b: 2 },
      },
    },
    league: { editorial: { awards: { only: { title: 'Only' } }, banned_phrases: { c: 3 } } },
  });
  assert.deepEqual(settings.editorial.awards, { only: { title: 'Only' } });
  assert.deepEqual(settings.editorial.banned_phrases, { c: 3 });
});

test('a table that merges is still merged: replaceKeys name only the replaced ones', () => {
  const settings = resolveSettings({
    defaults: { editorial: { output: { include_emoji: false } } },
    league: { editorial: { output: { sleeper_max_chars: 400 } } },
  });
  assert.deepEqual(settings.editorial.output, { sleeper_max_chars: 400, include_emoji: false });
});

test('a per-format weight set is replaced, and an untouched one is kept', () => {
  const settings = resolveSettings({
    league: { rankings: { weights: { redraft: { starting_lineup: 1 } } } },
  });
  assert.deepEqual(settings.rankings.weights.redraft, { starting_lineup: 1 });
  assert.ok(settings.rankings.weights.dynasty.dynasty_value > 0);
});

test('a weight set that does not sum to 1.0 is refused', () => {
  assert.throws(
    () => resolveSettings({ league: { rankings: { weights: { redraft: { starting_lineup: 0.9 } } } } }),
    /weights\.redraft sums to 0\.9, not 1\.0/,
  );
});

test('a table replaced by a bare value is an error naming the setting', () => {
  assert.throws(
    () => resolveSettings({ league: { editorial: { output: 'oops' } } }),
    /output must be a table of settings, not "oops"/,
  );
  assert.throws(
    () => resolveSettings({ overrides: { editorial: { output: 5 } } }),
    /output must be a table of settings, not 5/,
  );
});

test('a layer error names its source when one is given', () => {
  assert.throws(
    () =>
      resolveSettings({
        league: { editorial: { output: 'oops' } },
        sources: { league: { editorial: '/league/config/editorial.yml' } },
      }),
    /Could not read \/league\/config\/editorial\.yml: output must be a table of settings/,
  );
});

test('declared eliminations and a rookie draft order are parsed, and a bad one names its source', () => {
  const settings = resolveSettings({
    league: {
      guillotine: { eliminations: { 1: 'Invented Team' } },
      rookieDraft: {
        order: [
          { teams: 'non_playoff', sort: 'max_points_for', direction: 'ascending' },
          { teams: 'playoff', sort: 'max_points_for', direction: 'ascending' },
        ],
      },
    },
  });
  assert.equal(settings.guillotine.eliminations.length, 1);

  assert.throws(
    () =>
      resolveSettings({
        league: { rookieDraft: { order: { group: 'nonsense' } } },
        sources: { league: { rookieDraft: '/league/config/rookie-draft.yml' } },
      }),
    /order in \/league\/config\/rookie-draft\.yml/,
  );
});

test('resolveSettings carries no secrets and no league identity', () => {
  const settings = resolveSettings({
    league: { editorial: { tone: 'dry' } },
    overrides: { editorial: { tone: 'warm' } },
  });
  assert.deepEqual(Object.keys(settings).sort(), ['editorial', 'guillotine', 'rankings', 'rookieDraft']);
});

test('the league parsers moved here still behave', () => {
  assert.deepEqual(LEAGUE_ID_KEYS, { sleeper: 'SLEEPER_LEAGUE_ID', espn: 'ESPN_LEAGUE_ID' });
  assert.equal(parseLeagueProvider(' ESPN '), 'espn');
  assert.equal(parseLeagueProvider(''), null);
  assert.throws(() => parseLeagueProvider('yahoo'), /not a league provider/);
  assert.equal(parseEspnRoute(undefined), DEFAULT_ESPN_ROUTE);
  assert.deepEqual(ESPN_ROUTES, ['import', 'fetch']);
  assert.throws(() => parseEspnRoute('scrape'), /not an ESPN route/);
});

test('rankEmoji repeats the last entry past the table and honours include_emoji', () => {
  const config = { editorial: { output: { include_emoji: true }, ranking_emoji: { 1: 'A', 2: 'B' } } };
  assert.equal(rankEmoji(config, 1), 'A');
  assert.equal(rankEmoji(config, 9), 'B');
  config.editorial.output.include_emoji = false;
  assert.equal(rankEmoji(config, 1), '');
});
