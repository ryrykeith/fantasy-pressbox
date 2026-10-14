/**
 * The league providers, keyed by name.
 *
 * This is the only module that imports a provider directory (src/sleeper/
 * and src/espn/). Everything else asks it for a provider and reads the
 * shared shapes the provider hands back (docs/plans/espn-football.md §6).
 */
import { espnProvider } from './espn/provider.mjs';
import { sleeperProvider } from './sleeper/provider.mjs';

const PROVIDERS = Object.freeze({
  [sleeperProvider.name]: sleeperProvider,
  [espnProvider.name]: espnProvider,
});

/** What a league folder means when its .env names no provider. */
export const DEFAULT_PROVIDER = 'sleeper';

/** Every value LEAGUE_PROVIDER may take. */
export const PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDERS));

/** The provider called `name`. An unknown name throws, listing the known ones. */
export function getProvider(name = DEFAULT_PROVIDER) {
  const provider = PROVIDERS[name];
  if (provider) return provider;
  throw new Error(`No league provider called "${name}". Known providers: ${PROVIDER_NAMES.join(', ')}.`);
}

/** How a provider name is printed, including one this build does not know. */
export function providerDisplayName(name) {
  return PROVIDERS[name]?.displayName ?? String(name);
}

/** The provider a League came from. A League with no `provider` is Sleeper's, as every one was before it had one. */
export function providerOf(league) {
  return getProvider(league?.provider ?? DEFAULT_PROVIDER);
}

/** A fetching instance for the league `config` describes (`config.league.provider`). */
export function openProvider(config) {
  return getProvider(config?.league?.provider ?? DEFAULT_PROVIDER).fromConfig(config);
}

/**
 * The instance to fetch with: `provider` when the caller has one, else the
 * league's provider wrapped around `client`.
 */
export function providerInstance({ provider = null, client = null, league = null, config = null } = {}) {
  if (provider) return provider;
  return providerOf(league).forClient(client, { config, league });
}
