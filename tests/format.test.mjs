import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMAT_TYPES,
  FORMAT_LABELS,
  UNDETECTABLE_FORMAT_TYPES,
  describeFormat,
  parseDeclaredFormatType,
  resolveFormatType,
} from '../src/format.mjs';

test('the taxonomy is exactly the three declared formats', () => {
  assert.deepEqual(FORMAT_TYPES, ['dynasty', 'redraft', 'guillotine']);
  for (const type of FORMAT_TYPES) {
    assert.equal(typeof FORMAT_LABELS[type], 'string', `${type} needs a printable label`);
  }
});

test('guillotine is the format Sleeper cannot report', () => {
  assert.deepEqual(UNDETECTABLE_FORMAT_TYPES, ['guillotine']);
});

test('an absent declaration is not an error', () => {
  assert.equal(parseDeclaredFormatType(undefined), null);
  assert.equal(parseDeclaredFormatType(null), null);
  assert.equal(parseDeclaredFormatType(''), null);
  assert.equal(parseDeclaredFormatType('   '), null);
});

test('a declaration is read case- and space-insensitively', () => {
  assert.equal(parseDeclaredFormatType('dynasty'), 'dynasty');
  assert.equal(parseDeclaredFormatType('  Redraft '), 'redraft');
  assert.equal(parseDeclaredFormatType('GUILLOTINE'), 'guillotine');
});

test('a misspelled format fails loudly and lists the valid values', () => {
  assert.throws(
    () => parseDeclaredFormatType('dynastee'),
    (error) => {
      assert.match(error.message, /dynastee/, 'says what was written');
      for (const type of FORMAT_TYPES) {
        assert.match(error.message, new RegExp(type), `lists ${type}`);
      }
      return true;
    },
  );
});

test('the error names the setting it came from', () => {
  assert.throws(
    () => parseDeclaredFormatType('keeper', { source: 'LEAGUE_FORMAT in .env' }),
    /LEAGUE_FORMAT in \.env/,
  );
});

test('a declared format beats what Sleeper suggests', () => {
  assert.deepEqual(resolveFormatType({ declared: 'guillotine', detected: 'dynasty' }), {
    type: 'guillotine',
    source: 'declared',
  });
});

test('no declaration falls back to detection', () => {
  assert.deepEqual(resolveFormatType({ declared: null, detected: 'redraft' }), {
    type: 'redraft',
    source: 'detected',
  });
});

test('resolving with nothing at all is a programming error, not a silent default', () => {
  assert.throws(() => resolveFormatType({ declared: null, detected: null }), /detect/i);
});

test('printing a format says whether it was told or guessed', () => {
  // doctor prints this; "declared" is a setting to trust, "detected" is one to
  // check, and a user cannot tell them apart without being told.
  assert.equal(describeFormat({ type: 'guillotine', source: 'declared' }), 'Guillotine (declared)');
  assert.equal(describeFormat({ type: 'dynasty', source: 'detected' }), 'Dynasty (detected from Sleeper)');
});

test('printing an absent format does not crash', () => {
  assert.equal(describeFormat(null), 'unknown');
  assert.equal(describeFormat({}), 'unknown');
});
