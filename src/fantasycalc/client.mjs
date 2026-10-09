/**
 * FantasyCalc trade values — the market a trade grade is anchored to.
 *
 * Without a market, a model grades a trade on its memory of what players are
 * worth: stale, unverifiable, and exactly the kind of invented fact this
 * project refuses. FantasyCalc publishes crowd-sourced trade values for a
 * given league shape, players and draft picks alike, with no key or login.
 *
 * This directory is the FantasyCalc boundary, the same way src/sleeper/ is
 * Sleeper's: its field names (`maybeAge`, `sleeperId`, `positionRank`) stop
 * here. Everything downstream reads the shape `normalizeMarketValues` returns.
 *
 * Values move daily, so unlike the bye-week table this can never be a
 * committed file. src/pipeline.mjs#readMarketValues fetches it once per week
 * and saves the snapshot, so a re-run grades against the same numbers.
 */

const BASE = 'https://api.fantasycalc.com/values/current';

/** The reception scorings FantasyCalc prices. Anything else is approximated. */
const PRICED_PPR = [0, 0.5, 1];

class MarketValuesError extends Error {}

/**
 * The FantasyCalc parameters for a league, built from its resolved format and
 * scoring profile, with a caveat for every way the league differs from what
 * FantasyCalc can price.
 *
 * Caveats are fact-and-instruction pairs, the same shape as `unavailable`
 * entries: a model told only that values ignore TE premium will mention it
 * and then quote them anyway.
 */
export function marketValueQuery({ format, teamCount }) {
  const scoring = format?.scoring ?? null;
  const superflex = Boolean(scoring?.superflex);
  const reception = scoring?.reception?.base ?? 0;
  const ppr = PRICED_PPR.reduce((best, option) =>
    Math.abs(option - reception) < Math.abs(best - reception) ? option : best,
  );
  const isDynasty = format?.type === 'dynasty';

  const params = { isDynasty, numQbs: superflex ? 2 : 1, numTeams: teamCount, ppr };
  const caveats = [];

  if (ppr !== reception) {
    caveats.push({
      factor: 'receptionScoring',
      why:
        `This league pays ${reception} per reception; FantasyCalc only prices 0, 0.5 and 1, so ` +
        `these values are for ${ppr}.`,
      instruction:
        'Treat the values as approximate for pass catchers, and lean on the roster and scoring facts ' +
        'where the two disagree.',
    });
  }

  if ((scoring?.reception?.premiumPositions ?? []).includes('TE')) {
    caveats.push({
      factor: 'tightEndPremium',
      why: 'This league pays a tight end more per catch than other positions. FantasyCalc has no TE-premium setting, so its tight end values ignore it.',
      instruction:
        "Tight end values here understate what a tight end is worth in this league. Say so when a tight end's value " +
        'decides a grade, and weigh the premium in his favour.',
    });
  }

  const label = [
    isDynasty ? 'dynasty' : 'redraft',
    superflex ? 'superflex' : 'one quarterback',
    `${teamCount} teams`,
    ppr === 0 ? 'standard' : ppr === 0.5 ? 'half-PPR' : 'full PPR',
  ].join(', ');

  const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  return { params, label, caveats, url: `${BASE}?${search}` };
}

/** One fetch, no retries beyond the caller's: a failed market is an unavailable entry, not a crash. */
export async function fetchMarketValues(query, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(query.url, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new MarketValuesError(`Could not reach FantasyCalc (${query.url}). ${error?.message ?? ''}`.trim());
  }
  if (!response.ok) throw new MarketValuesError(`FantasyCalc returned HTTP ${response.status} for ${query.url}`);
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new MarketValuesError(`FantasyCalc returned unreadable JSON: ${error.message}`);
  }
  if (!Array.isArray(body)) throw new MarketValuesError('FantasyCalc returned something other than a list of values.');
  return body;
}

/** "2027 1st (Early)", "2027 1st" — FantasyCalc's own pick names. */
const PICK_NAME = /^(\d{4}) (\d+)(?:st|nd|rd|th)(?: \((Early|Mid|Late)\))?$/;

/**
 * FantasyCalc's list → `{ players, picks }`.
 *
 *   players  keyed by Sleeper player id: value, overall and positional rank, age
 *   picks    keyed by `<season>-<round>`: the generic value and any tiered ones
 *
 * A player FantasyCalc has no Sleeper id for cannot be matched to a roster and
 * is dropped. Pick names in any other shape (a specific slot, say) are dropped
 * too: nothing here can say which of them a traded pick is.
 */
export function normalizeMarketValues(entries) {
  const players = {};
  const picks = {};
  for (const entry of entries ?? []) {
    const player = entry?.player ?? {};
    if (!Number.isFinite(entry?.value)) continue;

    if (player.position === 'PICK') {
      const match = PICK_NAME.exec(String(player.name ?? '').trim());
      if (!match) continue;
      const [, season, round, tier] = match;
      const key = `${season}-${Number(round)}`;
      picks[key] ??= { season, round: Number(round), generic: null, tiers: {} };
      if (tier) picks[key].tiers[tier] = entry.value;
      else picks[key].generic = entry.value;
      continue;
    }

    if (!player.sleeperId) continue;
    players[String(player.sleeperId)] = {
      name: player.name ?? null,
      position: player.position ?? null,
      value: entry.value,
      overallRank: entry.overallRank ?? null,
      positionRank: entry.positionRank ?? null,
      age: Number.isFinite(player.maybeAge) ? Math.round(player.maybeAge * 10) / 10 : null,
    };
  }
  return { players, picks };
}

export { MarketValuesError };
