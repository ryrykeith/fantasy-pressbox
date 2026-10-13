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

/** What a player with no name on file is printed as. Never his ID. */
export const NAME_UNAVAILABLE = 'Name unavailable (not in the league data on file)';

/**
 * A player the provider knows only by an ID, with no name to print: one an
 * ESPN import met only in a transaction, since the saved files name only
 * rostered players. `nameUnavailable` makes describePlayer print
 * NAME_UNAVAILABLE instead of the ID, because a platform's raw player ID must
 * never reach a prompt. `name` says the same thing, so a reader that prints
 * `name` directly does too; no name is invented.
 */
export function unnamedPlayer(id) {
  return { id, name: NAME_UNAVAILABLE, position: null, team: null, nameUnavailable: true };
}

/** The normalized record for `id`, or the unknown-player stand-in. */
export function playerFor(players, id) {
  return players?.[id] ?? unknownPlayer(id);
}

/**
 * An empty starting slot (a null starter id in WeekData), as the weekly
 * analysis has always printed it: the unknown-player stand-in for the id
 * Sleeper fills an empty slot with. Kept exactly so no Sleeper edition
 * changes; it is a display name, not a player.
 */
export function emptySlotPlayer() {
  return unknownPlayer('0');
}

/**
 * Players are written as one compact line each rather than as objects.
 *
 * A 12-team dynasty league is around 400 players. Spelling each one out as a
 * pretty-printed JSON object turns the prompt into something too large to
 * paste into a chat window and expensive to send to an API, without telling
 * the model anything the line below does not.
 *
 * `player` is a record from the player dictionary, or undefined for an id the
 * dictionary does not know.
 */
export function describePlayer(id, player) {
  if (!player) return `Unknown player ${id}`;
  if (player.nameUnavailable) return NAME_UNAVAILABLE;
  const details = [player.position, player.team || 'FA', player.age ? `age ${player.age}` : null]
    .filter(Boolean)
    .join(', ');
  const injury = player.injuryStatus ? ` [${player.injuryStatus}]` : '';
  return `${player.name || id} (${details})${injury}`;
}
