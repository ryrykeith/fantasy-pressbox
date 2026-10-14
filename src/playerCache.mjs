/**
 * The player-list cache rule, shared by the Sleeper and ESPN clients.
 *
 * Pure: no disk, no clock of its own beyond `Date.now`. Where the list is kept
 * is the caller's choice and arrives as a `playerCache` option on the client:
 *
 *   async get(key)        -> { value, savedAt } | null     (savedAt: epoch ms)
 *   async set(key, value) -> void
 *
 * The CLI passes the disk cache (src/diskPlayerCache.mjs); a browser passes
 * memory or IndexedDB. The one-day rule lives here, not in the cache, so every
 * cache gets it for free.
 */

// Sleeper asks callers to pull the full player file at most once per day.
export const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * An in-memory playerCache. Lasts as long as the object does.
 * @param {() => number} [now]
 */
export function createMemoryPlayerCache(now = Date.now) {
  const entries = new Map();
  return {
    async get(key) {
      return entries.get(key) ?? null;
    },
    async set(key, value) {
      entries.set(key, { value, savedAt: now() });
    },
  };
}

/**
 * The player list: from the cache when it holds a fresh, acceptable entry,
 * otherwise from `fetchFresh`, which is then cached.
 *
 * @param {object} options
 * @param {{get: Function, set: Function}|null} options.cache  null means no caching
 * @param {string} options.key
 * @param {boolean} [options.refresh]  skip the cache read, still write the result
 * @param {() => Promise<any>} options.fetchFresh  returns what is safe to cache
 * @param {(value: any) => any} [options.accept]  throws on a cached value that is not trusted
 * @param {() => number} [options.now]
 */
export async function cachedPlayers({
  cache,
  key,
  refresh = false,
  fetchFresh,
  accept = (value) => value,
  now = Date.now,
}) {
  if (cache && !refresh) {
    const entry = await cache.get(key);
    if (entry && now() - entry.savedAt < PLAYER_CACHE_MAX_AGE_MS) {
      try {
        return accept(entry.value);
      } catch {
        // An unreadable or out-of-shape entry is fetched again, never trusted.
      }
    }
  }
  const players = await fetchFresh();
  if (cache) await cache.set(key, players);
  return players;
}
