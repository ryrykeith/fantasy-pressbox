import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/config.mjs';
import { formatPost, looksCollapsed, splitPosts } from '../src/validate.mjs';
import { gettingStarted } from '../src/welcome.mjs';

// Sleeper keeps the blank lines a post is pasted with; highlighting a ChatGPT
// reply drops them, its copy button keeps them. formatPost tidies, it does not
// re-space; looksCollapsed notices a reply that lost its spacing.

const EDITION =
  'WEEK 3 RECAP\n\nPunt Intended 108.46\nLowered Expectations 82.14\n\n' +
  'Sometimes you win because you were excellent.\n\nSometimes your opponent scores 82.14.\n\n' +
  'VERDICT: Punt Intended escaped with the win.\n';
const HIGHLIGHTED = EDITION.replace(/\n\n/g, '\n');

test('formatPost turns CRLF into LF', () => {
  assert.equal(formatPost('one\r\n\r\ntwo\r\n'), 'one\n\ntwo\n');
});

test('formatPost trims trailing spaces and tabs', () => {
  assert.equal(formatPost('one  \ntwo\t\n\nthree   '), 'one\ntwo\n\nthree');
});

test('formatPost collapses runs of blank lines into one blank line', () => {
  assert.equal(formatPost('one\n\n\n\ntwo\n\n\nthree'), 'one\n\ntwo\n\nthree');
});

test('formatPost leaves single blank lines alone and adds no invisible characters', () => {
  assert.equal(formatPost(EDITION), EDITION);
  assert.doesNotMatch(formatPost(EDITION), /[⠀​ ㅤ]/);
});

test('looksCollapsed is true for a highlighted copy of a multi-paragraph edition', () => {
  assert.equal(looksCollapsed(splitPosts(HIGHLIGHTED)), true);
});

test('looksCollapsed is false for the same text with its blank lines', () => {
  assert.equal(looksCollapsed(splitPosts(EDITION)), false);
});

test('looksCollapsed is false for a short post and for no posts', () => {
  assert.equal(looksCollapsed(['one line']), false);
  assert.equal(looksCollapsed([]), false);
});

test('looksCollapsed reads CRLF the same as LF', () => {
  assert.equal(looksCollapsed([HIGHLIGHTED.replace(/\n/g, '\r\n')]), true);
});

test('check warns about a collapsed reply and stays quiet for a spaced one', () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'pressbox-format-')));
  const run = (body) => {
    const file = join(cwd, 'posts.txt');
    writeFileSync(file, body);
    return spawnSync(process.execPath, [join(PACKAGE_ROOT, 'src', 'cli.mjs'), 'check', file], {
      cwd,
      encoding: 'utf8',
    });
  };
  const collapsed = run(HIGHLIGHTED);
  assert.equal(collapsed.status, 0, collapsed.stderr);
  assert.match(collapsed.stdout + collapsed.stderr, /copy button/);
  const spaced = run(EDITION);
  assert.doesNotMatch(spaced.stdout + spaced.stderr, /copy button/);
});

test('getting started tells people to use the copy button', () => {
  assert.match(gettingStarted('fp').join('\n'), /copy button/);
});
