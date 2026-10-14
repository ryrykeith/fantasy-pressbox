#!/usr/bin/env node
/**
 * Operator-run check: should Sleeper's optimal-lineup solver leave out IR
 * (reserve) and taxi players? Run it by hand against your own league folder:
 *
 *   node scripts/check-sleeper-reserve.mjs <league folder>
 *
 * It fetches the league's current rosters from Sleeper (public, no key), reads
 * the weeks already saved under the folder's data/, and prints counts only: no
 * team, manager or player names, no IDs, no point values. It saves nothing.
 * Not part of `npm test`.
 */
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { openLeague, savedWeeks } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import { checkSleeperReserve, formatReport } from './sleeperReserveCheck.mjs';

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node scripts/check-sleeper-reserve.mjs <league folder>');
  process.exit(2);
}

try {
  const config = loadConfig({ workspaceRoot: resolve(folder) });
  const { store, league, teams, players } = await openLeague(config, {
    store: createStore({ dataDir: config.dataDir }),
  });
  if ((league.provider ?? 'sleeper') !== 'sleeper') {
    console.error('This check is for Sleeper leagues.');
    process.exit(2);
  }
  const weeks = savedWeeks({ store, league, teams, players, throughWeek: Number.POSITIVE_INFINITY }).map((w) => ({
    week: w.week,
    rosters: w.rosters,
  }));
  console.log(formatReport(checkSleeperReserve({ league, teams, players, weeks })).join('\n'));
} catch (error) {
  // A message can quote a path or an ID from the folder; say only what kind of failure it was.
  console.error(`The check could not run (${error?.name ?? 'Error'}). Check the league folder's .env and data/.`);
  process.exit(1);
}
