/**
 * A fetch that fails the test if anything calls it, preloaded into a spawned
 * process with `node --import ./tests/fixtures/throwing-fetch.mjs ...`.
 *
 * It proves a route makes no network request: the call is logged to
 * THROWING_FETCH_LOG (when set), then throws. The URL is logged, never a header.
 */
import { appendFileSync } from 'node:fs';

globalThis.fetch = async (url) => {
  if (process.env.THROWING_FETCH_LOG) appendFileSync(process.env.THROWING_FETCH_LOG, `${url}\n`);
  throw new Error(`a request was made to ${url}, and this route must make none`);
};
