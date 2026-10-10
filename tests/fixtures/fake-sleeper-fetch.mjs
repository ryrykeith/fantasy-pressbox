/**
 * A stand-in for Sleeper, preloaded into a spawned process with
 * `node --import ./tests/fixtures/fake-sleeper-fetch.mjs ...`.
 *
 * Replaces the global fetch so setup can be driven end to end without the
 * network. FAKE_SLEEPER_LEAGUES holds a JSON object of raw league payloads
 * keyed by league ID; any other league answers 404, as Sleeper does for an ID
 * it does not know. Every URL asked for is appended to FAKE_SLEEPER_LOG, when
 * set, so a test can show nothing else was fetched.
 */
import { appendFileSync } from 'node:fs';

const leagues = JSON.parse(process.env.FAKE_SLEEPER_LEAGUES ?? '{}');

globalThis.fetch = async (url) => {
  if (process.env.FAKE_SLEEPER_LOG) appendFileSync(process.env.FAKE_SLEEPER_LOG, `${url}\n`);
  const match = /\/league\/(\d+)$/.exec(String(url));
  const league = match ? leagues[match[1]] : undefined;
  if (!league) return new Response('null', { status: 404 });
  return new Response(JSON.stringify(league), { status: 200, headers: { 'content-type': 'application/json' } });
};
