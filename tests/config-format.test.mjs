import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { loadConfig, ROOT } from '../src/config.mjs';

// Point config at a file that does not exist so the developer's own .env plays
// no part, and drive the setting through the real environment instead.
const NO_ENV_FILE = join(ROOT, 'tests', '.env.does-not-exist');

function withLeagueFormat(value, body) {
  const previous = process.env.LEAGUE_FORMAT;
  if (value === undefined) delete process.env.LEAGUE_FORMAT;
  else process.env.LEAGUE_FORMAT = value;
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.LEAGUE_FORMAT;
    else process.env.LEAGUE_FORMAT = previous;
  }
}

test('no declared format is not an error', () => {
  withLeagueFormat(undefined, () => {
    assert.equal(loadConfig({ envPath: NO_ENV_FILE }).leagueFormat, null);
  });
});

test('a declared format is read from the environment', () => {
  withLeagueFormat('guillotine', () => {
    assert.equal(loadConfig({ envPath: NO_ENV_FILE }).leagueFormat, 'guillotine');
  });
});

test('a misspelled format stops the run at config load', () => {
  withLeagueFormat('dynsaty', () => {
    assert.throws(
      () => loadConfig({ envPath: NO_ENV_FILE }),
      (error) => {
        assert.match(error.message, /LEAGUE_FORMAT/);
        assert.match(error.message, /dynsaty/);
        assert.match(error.message, /dynasty.*redraft.*guillotine/s);
        return true;
      },
    );
  });
});
