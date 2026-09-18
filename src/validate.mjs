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

export function checkPosts(text, { maxChars = 900 } = {}) {
  const posts = splitPosts(text);
  const checked = posts.map((post, index) => {
    // Sleeper counts characters, and emoji outside the basic plane count as
    // more than one UTF-16 code unit, so measure the way a chat box would.
    const length = [...post].length;
    return {
      index: index + 1,
      length,
      overBy: length > maxChars ? length - maxChars : 0,
      ok: length <= maxChars,
      firstLine: post.split('\n')[0].slice(0, 60),
      text: post,
    };
  });
  return {
    posts: checked,
    count: checked.length,
    allOk: checked.every((post) => post.ok),
    violations: checked.filter((post) => !post.ok),
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
