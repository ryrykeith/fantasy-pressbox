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
 * Pulls the trailing ```json block out of a generated edition.
 * Previews end with their predictions in machine-readable form so that the
 * recap can grade them later without anyone re-typing anything.
 */
export function extractJsonBlock(text) {
  const blocks = [...String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (blocks.length === 0) return null;
  try {
    return JSON.parse(blocks.at(-1)[1]);
  } catch {
    return null;
  }
}

/** Strips the machine-readable tail so the human-facing copy stays clean. */
export function stripJsonBlock(text) {
  return String(text).replace(/```json\s*\n[\s\S]*?```\s*$/, '').trim();
}
