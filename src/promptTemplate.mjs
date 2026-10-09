/**
 * Format-conditional sections inside prompt files.
 *
 * A prompt file is one edition's house style, shared by every league format.
 * The few passages that only make sense for some formats — dynasty asset
 * value, future draft capital — are wrapped in a delimited block:
 *
 *   <!-- format: dynasty -->
 *   ...instructions only a dynasty league should see...
 *   <!-- end format -->
 *
 * A block may name several formats (`<!-- format: dynasty, redraft -->`).
 * Blocks are resolved when the prompt is built, not left for the model to
 * interpret: a redraft league's model never reads the dynasty passage, so it
 * cannot be talked into following it. Unmarked text applies to every format.
 *
 * Why one file with blocks rather than one file per format: see "Format-
 * conditional sections" in docs/prompt-design.md.
 */
import { FORMAT_TYPES } from './format.mjs';

const OPEN = /^<!--\s*format:\s*(.*?)\s*-->$/;
const CLOSE = /^<!--\s*end format\s*-->$/;

/**
 * Keeps the blocks that name `formatType`, drops the rest, and strips every
 * marker. Malformed markup is an error rather than a best guess: a stray marker
 * would otherwise either leak into the prompt or swallow the rest of it.
 */
export function renderFormatBlocks(text, formatType, file = 'prompt') {
  const lines = text.split('\n');
  const hasBlocks = lines.some((line) => OPEN.test(line.trim()) || CLOSE.test(line.trim()));
  if (!hasBlocks) return text;

  if (!formatType) {
    throw new Error(
      `prompts/${file} has format-specific sections, but no league format was given to choose ` +
        'between them. Pass the resolved format type (context.league.format.type).',
    );
  }

  const kept = [];
  let open = null; // { formats, line } while inside a block

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const opening = line.trim().match(OPEN);
    if (opening) {
      if (open) {
        throw new Error(
          `prompts/${file} line ${lineNumber}: format blocks cannot be nested ` +
            `(the block opened on line ${open.line} is still open).`,
        );
      }
      const formats = opening[1].split(',').map((name) => name.trim()).filter(Boolean);
      const unknown = formats.filter((name) => !FORMAT_TYPES.includes(name));
      if (!formats.length || unknown.length) {
        throw new Error(
          `prompts/${file} line ${lineNumber}: unknown format "${unknown.join(', ') || opening[1]}" ` +
            `in a format block. Valid formats: ${FORMAT_TYPES.join(', ')}.`,
        );
      }
      open = { formats, line: lineNumber };
      return;
    }
    if (CLOSE.test(line.trim())) {
      if (!open) {
        throw new Error(
          `prompts/${file} line ${lineNumber}: "<!-- end format -->" without a matching ` +
            '"<!-- format: ... -->".',
        );
      }
      open = null;
      return;
    }
    if (!open || open.formats.includes(formatType)) kept.push(line);
  });

  if (open) {
    throw new Error(
      `prompts/${file}: the format block opened on line ${open.line} is never closed. ` +
        'End it with "<!-- end format -->".',
    );
  }

  // Dropping a block leaves the blank lines that surrounded it; collapse them
  // so the rendered prompt reads as if the block had never been there.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
