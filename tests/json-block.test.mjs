import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJsonBlock, findJsonBlock, stripJsonBlock } from '../src/validate.mjs';
import { recordEdition } from '../src/edition.mjs';

const BLOCK = '[{ "rank": 1, "team": "Alpha" }]';
const PARSED = [{ rank: 1, team: 'Alpha' }];
const reply = (fence) => `Post one\n%%%\nPost two\n%%%\n${fence}\n`;

test('a json-tagged, JSON-tagged or untagged block after the last %%% is read the same', () => {
  for (const tag of ['json', 'JSON', 'Json', '']) {
    const text = reply('```' + tag + '\n' + BLOCK + '\n```');
    assert.deepEqual(extractJsonBlock(text), PARSED, `tag "${tag}"`);
    assert.equal(findJsonBlock(text).status, 'found');
  }
});

test('a json-tagged block wins over an untagged one, wherever each sits', () => {
  const tagged = '```json\n[{ "rank": 1, "team": "Tagged" }]\n```';
  const bare = '```\n[{ "rank": 1, "team": "Bare" }]\n```';
  assert.equal(extractJsonBlock(reply(`${tagged}\n${bare}`))[0].team, 'Tagged');
  assert.equal(extractJsonBlock(reply(`${bare}\n${tagged}`))[0].team, 'Tagged');
});

test('the last block of a kind wins', () => {
  const first = '```\n[{ "rank": 1, "team": "First" }]\n```';
  const second = '```\n[{ "rank": 1, "team": "Second" }]\n```';
  assert.equal(extractJsonBlock(reply(`${first}\n${second}`))[0].team, 'Second');
});

test('a fenced block before the last %%% is never the machine-readable block', () => {
  for (const tag of ['json', '']) {
    const text = `Post with a fence\n\`\`\`${tag}\n${BLOCK}\n\`\`\`\n%%%\nClosing post, no block\n`;
    assert.equal(findJsonBlock(text).status, 'none', `tag "${tag}"`);
    assert.equal(extractJsonBlock(text), null);
    assert.equal(stripJsonBlock(text), text.trim());
  }
});

test('fences in other languages are not the block', () => {
  assert.equal(findJsonBlock(reply('```text\n' + BLOCK + '\n```')).status, 'none');
});

test('text without any %%% is read whole', () => {
  assert.deepEqual(extractJsonBlock('```\n' + BLOCK + '\n```'), PARSED);
});

test('a block that is present but does not parse is reported as unreadable', () => {
  for (const tag of ['json', '']) {
    const text = reply('```' + tag + '\n[{ "rank": 1, \n```');
    assert.equal(findJsonBlock(text).status, 'unreadable', `tag "${tag}"`);
    assert.equal(extractJsonBlock(text), null);
  }
});

test('no block at all is reported as none', () => {
  assert.equal(findJsonBlock('Post one\n%%%\nPost two').status, 'none');
  assert.equal(findJsonBlock('').status, 'none');
});

test('stripJsonBlock removes tagged and untagged blocks and keeps the posts', () => {
  for (const tag of ['json', 'JSON', '']) {
    const text = reply('```' + tag + '\n' + BLOCK + '\n```');
    assert.equal(stripJsonBlock(text), 'Post one\n%%%\nPost two\n%%%');
  }
  assert.equal(stripJsonBlock(reply('```\n[{ "rank": 1, \n```')), 'Post one\n%%%\nPost two\n%%%');
});

test('recordEdition says an unparseable block was found, and a missing one was not', () => {
  const store = new Proxy({}, { get: () => () => assert.fail('nothing may be saved') });
  const call = (text) => () =>
    recordEdition({ task: 'rankings', week: 1, text, store, league: { season: '2026' }, teams: [] });
  assert.throws(call(reply('```\n[{ "rank": 1, \n```')), /Found the JSON block .* could not read it/);
  assert.throws(call('Post one\n%%%\nPost two'), /No JSON block found/);
  assert.throws(call(reply('```json\n[{ "rank": 1,')), /Found the JSON block .* could not read it/);
});

const crlf = (text) => text.replaceAll('\n', '\r\n');
const STRIPPED = 'Post one\n%%%\nPost two\n%%%';

test('a CRLF or lone-CR reply reads exactly as the same reply with LF', () => {
  for (const tag of ['json', '']) {
    const lf = reply('```' + tag + '\n' + BLOCK + '\n```');
    for (const converted of [crlf(lf), lf.replaceAll('\n', '\r')]) {
      assert.deepEqual(extractJsonBlock(converted), PARSED, `tag "${tag}"`);
      assert.equal(findJsonBlock(converted).status, 'found');
      // stripJsonBlock returns the normalised (LF) text.
      assert.equal(stripJsonBlock(converted), STRIPPED);
    }
  }
});

test('a %%% line after the block does not hide it', () => {
  for (const tag of ['json', '']) {
    const text = reply('```' + tag + '\n' + BLOCK + '\n```\n%%%');
    assert.deepEqual(extractJsonBlock(text), PARSED, `tag "${tag}"`);
    assert.equal(stripJsonBlock(text), 'Post one\n%%%\nPost two\n%%%\n\n%%%');
  }
});

test('a fence inside a post stays unread when the reply ends in %%%', () => {
  const text = 'Post\n```json\n' + BLOCK + '\n```\n%%%\nLast post\n%%%\n';
  assert.equal(findJsonBlock(text).status, 'none');
});

test('the step back is one %%% only', () => {
  const text = '```json\n' + BLOCK + '\n```\n%%%\nPost\n%%%\n%%%\n';
  assert.equal(findJsonBlock(text).status, 'none');
});

test('a closing fence on the last line of the JSON is found', () => {
  for (const tag of ['json', '']) {
    const text = reply('```' + tag + '\n' + BLOCK + '```');
    assert.deepEqual(extractJsonBlock(text), PARSED, `tag "${tag}"`);
    assert.equal(stripJsonBlock(text), STRIPPED);
  }
});

test('an opening fence with no closing fence is unreadable, not missing', () => {
  for (const tag of ['json', 'JSON', '']) {
    const text = reply('```' + tag + '\n[{ "rank": 1, "team": "Alp');
    assert.equal(findJsonBlock(text).status, 'unreadable', `tag "${tag}"`);
    assert.equal(extractJsonBlock(text), null);
    assert.equal(stripJsonBlock(text), STRIPPED);
  }
  assert.equal(findJsonBlock(reply('```text\nnot json')).status, 'none');
});
