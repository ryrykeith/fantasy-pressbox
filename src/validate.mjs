/**
 * Output checking.
 *
 * Sleeper's chat does not render Markdown and will not accept an unlimited
 * message, so a "post" that is too long is a bug, not a style choice. Nothing
 * here ever shortens content — silently truncating a post would cut a sentence
 * in half in front of the whole league. It reports, and the human decides.
 */

/** Posts are separated by a line containing only %%%. */
export const POST_DELIMITER = /^\s*%%%\s*$/m;

export function splitPosts(text) {
  return String(text)
    .split(POST_DELIMITER)
    .map((post) => post.trim())
    .filter((post) => post.length > 0);
}

/**
 * Tidies a post's line endings and spacing without re-spacing it: CRLF becomes
 * LF, trailing spaces and tabs go, and three or more line breaks collapse into
 * one blank line. The model's own single blank lines are kept, and no invisible
 * characters are added. Provider-neutral: it claims nothing about any chat.
 */
export function formatPost(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * True when the posts run several lines and none has a blank line anywhere.
 * That is what a reply looks like after being highlighted and copied out of
 * ChatGPT, which drops the blank lines; its copy button keeps them.
 * Accepts post strings or checked posts (objects with `text`).
 */
export function looksCollapsed(posts) {
  const list = (Array.isArray(posts) ? posts : [posts]).map((post) => String(post?.text ?? post));
  const lines = list.flatMap((post) => formatPost(post).trim().split('\n'));
  const filled = lines.filter((line) => line.trim() !== '').length;
  return filled >= 3 && !lines.some((line) => line.trim() === '');
}

/**
 * Every market value an edition's context carries, as numbers. FantasyCalc
 * values appear under `value`, `netValue`, `generic` and `tiers`, wherever the
 * context nests them (trades, pick tiers, held-pick capital, the strength
 * rating's market_value and draft_capital). Walking the
 * context keeps this independent of the league platform: the values have the
 * same shape on Sleeper and ESPN.
 */
export function marketValueNumbers(context) {
  const found = new Set();
  const walk = (node, inValue) => {
    if (Array.isArray(node)) return node.forEach((item) => walk(item, inValue));
    if (node && typeof node === 'object') {
      return Object.entries(node).forEach(([k, v]) =>
        walk(v, inValue || ['value', 'netValue', 'generic', 'tiers'].includes(k)),
      );
    }
    if (inValue && Number.isFinite(node)) found.add(Math.abs(Math.round(node)));
  };
  walk(context?.trades, false);
  walk(context?.teams?.map((t) => t.draftCapital), false);
  walk(context?.draftCapital?.seasons, false);
  // The strength rating's market-priced components; its other values are points and ages.
  walk(
    context?.strength?.teams?.map((t) => [t.components?.market_value, t.components?.draft_capital]),
    false,
  );
  return found;
}

/**
 * A post "quotes values" when the edition received market values (the context
 * carries a credit line) and the post prints a number that is one of those
 * values. Deliberately simple: a coincidental match (a score equal to a value)
 * can ask for a credit line that was not strictly owed, which only costs a line.
 */
function quotesValue(post, valueNumbers) {
  const numbers = post.match(/\d[\d,]*/g) ?? [];
  return numbers.some((n) => valueNumbers.has(Number.parseInt(n.replace(/,/g, ''), 10)));
}

/**
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.maxChars]
 * @param {object} [options.context] the edition's prompt context; when it
 *        carries `marketCredit`, a post quoting a market value must contain
 *        that line. Nothing is appended: like length, this only reports.
 */
export function checkPosts(text, { maxChars = 900, context = null } = {}) {
  const creditLine = context?.marketCredit?.line ?? null;
  const valueNumbers = creditLine ? marketValueNumbers(context) : new Set();
  const posts = splitPosts(text);
  const checked = posts.map((post, index) => {
    // Sleeper counts characters, and emoji outside the basic plane count as
    // more than one UTF-16 code unit, so measure the way a chat box would.
    const length = [...post].length;
    const missingCredit = Boolean(creditLine) && quotesValue(post, valueNumbers) && !post.includes(creditLine);
    return {
      index: index + 1,
      length,
      overBy: length > maxChars ? length - maxChars : 0,
      missingCredit,
      ok: length <= maxChars && !missingCredit,
      firstLine: post.split('\n')[0].slice(0, 60),
      text: post,
    };
  });
  return {
    posts: checked,
    count: checked.length,
    allOk: checked.every((post) => post.ok),
    violations: checked.filter((post) => !post.ok),
    creditLine,
    creditMissing: checked.filter((post) => post.missingCredit),
  };
}

/**
 * Finds the machine-readable block of a generated edition.
 *
 * Previews end with their predictions and ranking editions end with their
 * order, in machine-readable form, so that the recap can grade them later
 * without anyone re-typing anything. The block is a fenced block after the last
 * %%% line (the whole text when there is no %%%): a fence inside a post is
 * prose and is never read. When the reply closes with a %%% line after the
 * block, so that only whitespace follows the last one, the text after the %%%
 * before it is read instead (one step back, no further). The chat sometimes
 * drops the `json` tag, so a block tagged json (any case) or untagged is
 * accepted, and a json-tagged one wins when both are present. Other languages
 * are not the block. The closing fence may share the JSON's last line, and an
 * opening fence that is never closed (a reply cut off) is unreadable, not
 * missing.
 *
 * Line endings are normalised first (CRLF and a lone CR become LF). `text` is
 * that normalised text and `start` and `end` are offsets into it, not into the
 * argument.
 *
 * Returns { status: 'none', text } when there is no such fence,
 * { status: 'unreadable', text, start, end } when there is one that is not valid
 * JSON, and { status: 'found', text, value, start, end } otherwise.
 */
export function findJsonBlock(text) {
  const source = String(text).replace(/\r\n?/g, '\n');
  const delimiters = [...source.matchAll(new RegExp(POST_DELIMITER.source, 'gm'))];
  const endOf = (m) => m.index + m[0].length;
  let tailStart = delimiters.length ? endOf(delimiters.at(-1)) : 0;
  if (delimiters.length > 1 && source.slice(tailStart).trim() === '') {
    tailStart = endOf(delimiters.at(-2));
  }
  const tail = source.slice(tailStart);
  const fenced = /^[ \t]*```([A-Za-z]*)[ \t]*\n([\s\S]*?)```[ \t]*$/gm;
  const all = [...tail.matchAll(fenced)];
  const fences = all
    .map((m) => ({
      tag: m[1].toLowerCase(),
      body: m[2],
      start: tailStart + m.index,
      end: tailStart + m.index + m[0].length,
    }))
    .filter((fence) => fence.tag === 'json' || fence.tag === '');
  const chosen = fences.findLast((fence) => fence.tag === 'json') ?? fences.at(-1);
  if (!chosen) {
    // Past the last closed fence, an opener left without its closer.
    const consumed = all.length ? endOf(all.at(-1)) : 0;
    // \x60 is a backtick: tests/espn-coverage-matrix.test.mjs scans source
    // files with a tokenizer that reads a lone literal backtick as a template.
    const open = /^[ \t]*\x60{3}([A-Za-z]*)[ \t]*\n/m.exec(tail.slice(consumed));
    const openTag = open?.[1].toLowerCase();
    if (open && (openTag === 'json' || openTag === '')) {
      return { status: 'unreadable', text: source, start: tailStart + consumed + open.index, end: source.length };
    }
    return { status: 'none', text: source };
  }
  const { start, end } = chosen;
  try {
    return { status: 'found', text: source, value: JSON.parse(chosen.body), start, end };
  } catch {
    return { status: 'unreadable', text: source, start, end };
  }
}

/** The machine-readable block's parsed value, or null when there is none or it does not parse. */
export function extractJsonBlock(text) {
  const found = findJsonBlock(text);
  return found.status === 'found' ? found.value : null;
}

/**
 * Strips the block `extractJsonBlock` reads, so the human-facing copy stays clean.
 * The result has LF line endings whatever the input had.
 */
export function stripJsonBlock(text) {
  const found = findJsonBlock(text);
  if (found.status === 'none') return found.text.trim();
  return (found.text.slice(0, found.start) + found.text.slice(found.end)).trim();
}
