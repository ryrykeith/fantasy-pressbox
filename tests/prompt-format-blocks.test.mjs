import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderFormatBlocks } from '../src/promptTemplate.mjs';
import { buildContext, buildPrompt, taskPromptOnly } from '../src/promptContext.mjs';
import { ROOT } from '../src/config.mjs';
import { FORMAT_TYPES } from '../src/format.mjs';

/**
 * Prompt files share one house style across formats, and mark the parts that
 * only apply to some formats with `<!-- format: ... -->` blocks. The blocks are
 * resolved when the prompt is built, so a model writing for a redraft league
 * never reads a word of dynasty instruction — it cannot be told to ignore
 * something it was never shown.
 */

/* ------------------------------------------------ renderFormatBlocks */

test('a block for the current format is kept, without its markers', () => {
  const text = 'Before.\n\n<!-- format: dynasty -->\nDynasty only.\n<!-- end format -->\n\nAfter.';
  assert.equal(renderFormatBlocks(text, 'dynasty'), 'Before.\n\nDynasty only.\n\nAfter.');
});

test('a block for another format is removed entirely, blank lines and all', () => {
  const text = 'Before.\n\n<!-- format: dynasty -->\nDynasty only.\n<!-- end format -->\n\nAfter.';
  assert.equal(renderFormatBlocks(text, 'redraft'), 'Before.\n\nAfter.');
});

test('a block can name several formats', () => {
  const text = '<!-- format: dynasty, redraft -->\nShared.\n<!-- end format -->';
  assert.equal(renderFormatBlocks(text, 'redraft'), 'Shared.');
  assert.equal(renderFormatBlocks(text, 'dynasty'), 'Shared.');
  assert.equal(renderFormatBlocks(text, 'guillotine'), '');
});

test('text with no blocks passes through untouched, with or without a format', () => {
  assert.equal(renderFormatBlocks('Plain.\n\nText.', 'dynasty'), 'Plain.\n\nText.');
  assert.equal(renderFormatBlocks('Plain.\n\nText.', undefined), 'Plain.\n\nText.');
});

test('a prompt with blocks but no format is refused, rather than showing every block', () => {
  const text = '<!-- format: dynasty -->\nDynasty only.\n<!-- end format -->';
  assert.throws(() => renderFormatBlocks(text, undefined, 'x.md'), /x\.md.*no league format/s);
});

test('a misspelled format in a block is refused, naming the valid ones', () => {
  const text = '<!-- format: dynastee -->\nOops.\n<!-- end format -->';
  assert.throws(() => renderFormatBlocks(text, 'dynasty', 'x.md'), (error) => {
    assert.match(error.message, /x\.md/);
    assert.match(error.message, /dynastee/);
    assert.match(error.message, /dynasty, redraft, guillotine/);
    return true;
  });
});

test('an unclosed, nested or stray block is refused', () => {
  assert.throws(() => renderFormatBlocks('<!-- format: dynasty -->\nNo end.', 'dynasty'), /never closed/);
  assert.throws(
    () =>
      renderFormatBlocks(
        '<!-- format: dynasty -->\n<!-- format: redraft -->\nx\n<!-- end format -->\n<!-- end format -->',
        'dynasty',
      ),
    /nested/,
  );
  assert.throws(() => renderFormatBlocks('x\n<!-- end format -->', 'dynasty'), /without a matching/);
});

test('every prompt file renders cleanly for every format', () => {
  const dir = join(ROOT, 'prompts');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const type of FORMAT_TYPES) {
      const rendered = renderFormatBlocks(text, type, file);
      assert.doesNotMatch(rendered, /<!--\s*(end )?format/, `${file} leaked a marker for ${type}`);
    }
  }
});

/* ------------------------------------------------ the ranking prompts */

/**
 * The words that only mean anything where rosters carry over from one season to
 * the next. A redraft ranking prompt must contain none of them.
 */
const DYNASTY_ONLY = [/dynasty/i, /draft capital/i, /futureDraftCapital/, /taxi/i, /asset/i, /age curve/i, /rookie pick/i];

for (const task of ['rankings', 'preseason-rankings']) {
  test(`the redraft ${task} instructions never mention a dynasty-only concept`, () => {
    const text = taskPromptOnly(task, 'redraft');
    for (const pattern of DYNASTY_ONLY) {
      assert.doesNotMatch(text, pattern);
    }
  });

  test(`the redraft ${task} instructions still let age count where it bears on this season`, () => {
    const text = taskPromptOnly(task, 'redraft');
    assert.match(text, /\bage\b/i);
    assert.match(text, /this season/i);
  });

  test(`the dynasty ${task} instructions keep asset value and draft capital`, () => {
    const text = taskPromptOnly(task, 'dynasty');
    assert.match(text, /dynasty/i);
    assert.match(text, /futureDraftCapital/);
  });
}

test('the preseason redraft prompt does not ask for asset value and age curve', () => {
  assert.doesNotMatch(taskPromptOnly('preseason-rankings', 'redraft'), /asset value and age curve/);
  assert.match(taskPromptOnly('preseason-rankings', 'dynasty'), /dynasty asset value and age curve/);
});

test('buildPrompt resolves the blocks from the context it is given', () => {
  const prompt = buildPrompt({ task: 'rankings', context: rankingContext('redraft') });
  assert.doesNotMatch(prompt, /<!--/);
  assert.doesNotMatch(prompt, /## Draft capital/);

  const dynastyPrompt = buildPrompt({ task: 'rankings', context: rankingContext('dynasty') });
  assert.doesNotMatch(dynastyPrompt, /<!--/);
  assert.match(dynastyPrompt, /## Draft capital/);
});

test('taskPromptOnly with no format refuses a prompt that has format blocks', () => {
  assert.throws(() => taskPromptOnly('rankings'), /no league format/);
});

function rankingContext(type) {
  return buildContext({
    task: 'rankings',
    config: {
      leagueDisplayName: null,
      editorial: {
        tone: 'dry',
        roast_intensity: 1,
        ranking_emoji: '',
        output: { sleeper_max_chars: 500, include_emoji: false },
        banned_phrases: [],
        awards: {},
      },
      rankings: {
        weights: { dynasty: { starting_lineup: 1 }, redraft: { starting_lineup: 1 } },
        weekly: {},
      },
    },
    league: {
      name: 'Test League',
      season: '2026',
      status: 'in_season',
      startingSlots: ['QB'],
      benchSlots: 2,
      taxiSlots: 0,
      playoffTeams: 4,
      playoffWeekStart: 15,
      format: { type, source: 'declared', declaredType: type, detectedType: type },
    },
    teams: [],
    players: {},
    week: 3,
  });
}
