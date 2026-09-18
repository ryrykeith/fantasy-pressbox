/**
 * Optimal lineup solving.
 *
 * "Lineup efficiency" is one of the publication's sharpest tools — it is the
 * difference between "you lost" and "you beat yourself" — so it is computed
 * here from data rather than guessed at by a model.
 */

const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
  DL: ['DL'],
  LB: ['LB'],
  DB: ['DB'],
};

export function eligiblePositions(slot) {
  return SLOT_ELIGIBILITY[slot] ?? [slot];
}

function canFill(slot, entry) {
  return entry?.player?.position
    ? eligiblePositions(slot).includes(entry.player.position)
    : false;
}

const pointsOf = (entry) => entry?.points ?? 0;

/**
 * Highest-scoring legal lineup available from an entire roster.
 *
 * Slots are filled most-restrictive-first, which is already optimal for the
 * usual Sleeper lineup (QB/RB/WR/TE/FLEX/SUPER_FLEX), where each flex is a
 * superset of the slots before it. Leagues with overlapping-but-unrelated
 * flexes (WRRB_FLEX alongside REC_FLEX) break that guarantee, so a swap pass
 * runs afterwards until no single exchange improves the total.
 */
export function bestLineup({ slots, candidates }) {
  const pool = candidates.filter((entry) => entry.player?.position);
  const fillOrder = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => eligiblePositions(a.slot).length - eligiblePositions(b.slot).length);

  const assignment = new Array(slots.length).fill(null);
  const used = new Set();

  for (const { slot, index } of fillOrder) {
    let best = null;
    for (const entry of pool) {
      if (used.has(entry.id) || !canFill(slot, entry)) continue;
      if (!best || entry.points > best.points) best = entry;
    }
    if (best) {
      assignment[index] = best;
      used.add(best.id);
    }
  }

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 100) {
    improved = false;

    // Straight upgrade: an unused player outscores whoever holds a slot.
    for (let i = 0; i < slots.length; i++) {
      for (const entry of pool) {
        if (used.has(entry.id) || !canFill(slots[i], entry)) continue;
        if (entry.points > pointsOf(assignment[i])) {
          if (assignment[i]) used.delete(assignment[i].id);
          assignment[i] = entry;
          used.add(entry.id);
          improved = true;
        }
      }
    }

    // Shift: move a starter into another slot so a stronger bench player can
    // take the slot they vacated. Worth it when the displaced starter outscores
    // the player they replace.
    for (let i = 0; i < slots.length && !improved; i++) {
      for (let j = 0; j < slots.length && !improved; j++) {
        if (i === j) continue;
        const held = assignment[i];
        if (!held || !canFill(slots[j], held)) continue;
        const displaced = assignment[j];
        if (pointsOf(held) <= pointsOf(displaced)) continue;
        for (const entry of pool) {
          if (used.has(entry.id) || !canFill(slots[i], entry)) continue;
          const before = pointsOf(held) + pointsOf(displaced);
          const after = entry.points + pointsOf(held);
          if (after > before) {
            if (displaced) used.delete(displaced.id);
            assignment[j] = held;
            assignment[i] = entry;
            used.add(entry.id);
            improved = true;
            break;
          }
        }
      }
    }
  }

  const lineup = slots.map((slot, index) => ({ slot, entry: assignment[index] }));
  const total = Number(lineup.reduce((sum, { entry }) => sum + pointsOf(entry), 0).toFixed(2));
  return { lineup, total };
}

export function lineupEfficiency(actual, optimal) {
  if (!optimal) return null;
  return Number(((actual / optimal) * 100).toFixed(1));
}
