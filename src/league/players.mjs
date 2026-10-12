/**
 * The player dictionary every module past the provider reads.
 *
 * A provider's normalizer builds it once per run (`openLeague` in
 * src/pipeline.mjs): `players[id] = { id, name, position, team, age, yearsExp,
 * injuryStatus, status }`. A field the provider does not supply is absent,
 * not null. Nothing here knows which platform the record came from.
 */

/** A rostered id the player file does not know. Named, never guessed. */
export function unknownPlayer(id) {
  return { id, name: `Unknown player ${id}`, position: null, team: null };
}

/** The normalized record for `id`, or the unknown-player stand-in. */
export function playerFor(players, id) {
  return players?.[id] ?? unknownPlayer(id);
}
