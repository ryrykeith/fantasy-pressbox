/**
 * The package's shipped text assets, loaded through one function.
 *
 * Prompts (prompts/*.md) and the default config (config/editorial.yml,
 * config/rankings.yml, config/bye-weeks.<season>.yml) ship with the package.
 * Reading them from disk would tie every caller to Node, so this module never
 * does: it takes `readText(path)`, where `path` is a package file's path from
 * the package root ('prompts/system.md') and the result is that file's text,
 * or null/undefined when the package has no such file.
 *
 *   - the CLI's readText reads the disk, and lets a workspace's own prompt
 *     shadow the shipped one (src/config.mjs, diskReadText);
 *   - the website's fetches the same path from jsDelivr at the pinned version.
 *
 * No `node:` import and no `process`: this is on the browser-safe core's path.
 *
 * `readText` is synchronous because everything downstream is. A caller whose
 * source is asynchronous fetches the files it needs first and hands over a
 * lookup into what it fetched.
 */
import { parseYaml } from './lib/yaml.mjs';
import { byeWeekTableSource, parseByeWeekTable } from './analysis/byeExposure.mjs';

/**
 * @param {(path: string) => string | null | undefined} readText
 * @returns the loaded assets, which `buildPrompt`, `systemPromptOnly`,
 *   `taskPromptOnly` and the pipeline's bye-week reads take in place of a path
 */
export function loadAssets(readText) {
  if (typeof readText !== 'function') {
    throw new Error("loadAssets needs readText(path), a function returning a package file's text.");
  }
  // A file is read once per set of assets, so a prompt built for every edition
  // does not fetch system.md again each time.
  const cache = new Map();

  /** A package file's text, or null when the package has no such file. */
  function text(path) {
    if (!cache.has(path)) {
      const found = readText(path);
      if (found !== null && found !== undefined && typeof found !== 'string') {
        throw new Error(`readText("${path}") returned ${typeof found}, expected the file's text or null.`);
      }
      cache.set(path, found ?? null);
    }
    return cache.get(path);
  }

  function yaml(path) {
    const body = text(path);
    if (body === null) throw new Error(`Missing config file: ${path}`);
    try {
      return parseYaml(body);
    } catch (error) {
      throw new Error(`Could not read ${path}: ${error.message}`);
    }
  }

  return Object.freeze({
    text,

    /** A prompt file's raw text, e.g. prompt('system.md'). Refused when missing. */
    prompt(file) {
      const body = text(`prompts/${file}`);
      if (body === null) throw new Error(`Missing prompt file: prompts/${file}`);
      return body;
    },

    /** The shipped default editorial and rankings settings, parsed. */
    defaultConfig() {
      return { editorial: yaml('config/editorial.yml'), rankings: yaml('config/rankings.yml') };
    },

    /**
     * The season's bye-week table, validated. A season without its table is
     * refused loudly, naming the generator that produces it.
     */
    byeWeekTable(season) {
      const source = byeWeekTableSource(season);
      const path = `config/bye-weeks.${season}.yml`;
      if (text(path) === null) {
        throw new Error(
          `No bye-week table for season ${season} (expected ${source}).\n` +
            `Generate it with: node scripts/fetch-bye-weeks.mjs ${season}`,
        );
      }
      return parseByeWeekTable(yaml(path), { season, source });
    },
  });
}
