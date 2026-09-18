/**
 * Thin wrapper around the public Sleeper API.
 *
 * This module only knows how to *retrieve* data. It performs no analysis and
 * holds no editorial opinions. Everything it returns is raw Sleeper shape;
 * turning that into league concepts is normalize.mjs's job.
 *
 * The Sleeper API is public and read-only — there is no API key and no login.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://api.sleeper.app/v1';
const PLAYERS_URL = `${BASE}/players/nfl`;

// Sleeper asks callers to pull the full player file at most once per day.
const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

class SleeperError extends Error {}

async function getJson(url, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (response.status === 404) return null;
      if (response.status === 429) {
        await sleep(1000 * (attempt + 1));
        lastError = new SleeperError('Sleeper rate-limited this request (HTTP 429).');
        continue;
      }
      if (!response.ok) {
        throw new SleeperError(`Sleeper returned HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  throw new SleeperError(
    `Could not reach Sleeper (${url}). Check your internet connection. ${lastError?.message ?? ''}`.trim(),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createClient({ leagueId, dataDir }) {
  if (!leagueId) throw new SleeperError('No Sleeper league ID configured.');

  return {
    leagueId,

    async league() {
      const league = await getJson(`${BASE}/league/${leagueId}`);
      if (!league) {
        throw new SleeperError(
          `Sleeper has no league with ID "${leagueId}". Open your league in a browser and ` +
            'copy the long number out of the address bar.',
        );
      }
      return league;
    },

    users: () => getJson(`${BASE}/league/${leagueId}/users`),
    rosters: () => getJson(`${BASE}/league/${leagueId}/rosters`),
    matchups: (week) => getJson(`${BASE}/league/${leagueId}/matchups/${week}`),
    transactions: (week) => getJson(`${BASE}/league/${leagueId}/transactions/${week}`),
    tradedPicks: () => getJson(`${BASE}/league/${leagueId}/traded_picks`),
    drafts: () => getJson(`${BASE}/league/${leagueId}/drafts`),
    draftPicks: (draftId) => getJson(`${BASE}/draft/${draftId}/picks`),

    /** Sleeper's own idea of the current NFL week — used when nothing else says. */
    state: () => getJson(`${BASE}/state/nfl`),

    /**
     * The full NFL player dictionary (~15 MB). Cached on disk because it changes
     * slowly and re-downloading it every run would be rude and slow.
     */
    async players({ refresh = false } = {}) {
      const cacheDir = join(dataDir, 'cache');
      const cachePath = join(cacheDir, 'players-nfl.json');
      if (!refresh && existsSync(cachePath)) {
        const age = Date.now() - statSync(cachePath).mtimeMs;
        if (age < PLAYER_CACHE_MAX_AGE_MS) {
          return JSON.parse(readFileSync(cachePath, 'utf8'));
        }
      }
      const players = await getJson(PLAYERS_URL);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify(players));
      return players;
    },
  };
}

export { SleeperError };
