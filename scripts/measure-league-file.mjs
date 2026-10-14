#!/usr/bin/env node
/**
 * Measures the league file (src/leagueFile.mjs) for one full invented season,
 * with and without the raw week bundles. Maintainer tool: not shipped.
 *
 *   node scripts/measure-league-file.mjs
 *
 * The season is tests/fixtures/full-season-league.mjs: a made-up 12-team
 * superflex dynasty league on Sleeper, 17 weeks. It runs through the real
 * pipeline in this process, against stand-ins for the Sleeper API and
 * FantasyCalc (no network): every week is captured, its market saved, a
 * preview and a ranking recorded from pasted replies, and a tank watch saved
 * from week 8. The league folder is then exported as export-league does and
 * the file's size printed, as written (unindented), indented and gzipped.
 *
 * The folder is written under the system's temporary folder and removed
 * afterwards.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { loadConfig, loadDiskAssets } from '../src/config.mjs';
import { recordEdition } from '../src/edition.mjs';
import { leagueFileFromWorkspace, serializeLeagueFile } from '../src/leagueFile.mjs';
import { readLeagueFolder } from '../src/leagueFolder.mjs';
import { captureWeek, openLeague, readDraftOrder, readMarketValues } from '../src/pipeline.mjs';
import { createStore } from '../src/store.mjs';
import {
  LEAGUE_ID,
  ROSTER_SIZE,
  SEASON,
  TEAMS,
  WEEKS,
  fakeFantasyCalc,
  installFakeSleeper,
  pairings,
  random,
} from '../tests/fixtures/full-season-league.mjs';

installFakeSleeper();

/** Reply text of about the length a real edition runs to. */
const rand = random(17);
const WORDS = ('the week belonged to a roster that started its kicker and still won while the bench outscored ' +
  'half the league and the waiver wire coughed up a running back nobody wanted').split(' ');
const prose = (words) => Array.from({ length: words }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ');
const reply = (posts, block) =>
  [...posts.flatMap((post) => [post, '%%%']).slice(0, -1), '```json', JSON.stringify(block, null, 2), '```', ''].join('\n');

const root = mkdtempSync(join(tmpdir(), 'pressbox-measure-'));
try {
  writeFileSync(join(root, '.env'), `SLEEPER_LEAGUE_ID=${LEAGUE_ID}\nLEAGUE_FORMAT=dynasty\nLEAGUE_DISPLAY_NAME="Invented Full Season League"\n`);
  mkdirSync(join(root, 'config'));
  writeFileSync(
    join(root, 'config', 'rookie-draft.yml'),
    'order:\n  - teams: non_playoff\n    sort: max_points_for\n    direction: ascending\n' +
      '  - teams: playoff\n    sort: max_points_for\n    direction: ascending\nrounds: linear\n',
  );
  const config = loadConfig({ workspaceRoot: root });
  const store = createStore({ dataDir: config.dataDir });
  const ctx = await openLeague(config, { store, assets: loadDiskAssets({ promptsDir: null }) });
  const names = ctx.teams.map((team) => team.name);
  const silent = { say() {}, warn() {} };
  const record = (task, week, text) => recordEdition({ task, week, text, store, league: ctx.league, teams: ctx.teams, log: silent });

  for (let week = 1; week <= WEEKS; week++) {
    await captureWeek({ ...ctx, config, week });
    await readMarketValues({ store, league: ctx.league, teams: ctx.teams, week, fetchImpl: fakeFantasyCalc });
    const games = pairings(week);
    const predictions = games.map(([a, b]) => ({
      week,
      team_a: names[a - 1],
      team_b: names[b - 1],
      predicted_winner: names[a - 1],
      confidence: 'medium',
      reason: prose(14),
    }));
    record('preview', week, reply(games.map(() => prose(70)), predictions));
    record('rankings', week, reply([prose(60), ...names.map(() => prose(45))], names.map((team, i) => ({ rank: i + 1, team }))));
    if (week >= 8) {
      const draftOrder = readDraftOrder({ league: ctx.league, teams: ctx.teams, config });
      if (draftOrder) store.saveTankWatch(SEASON, week, draftOrder);
    }
  }

  const { entries } = readLeagueFolder({ workspaceRoot: root, dataDir: config.dataDir });
  const { leagueFile } = leagueFileFromWorkspace(entries, { surface: 'cli' });
  const withoutRawFile = {
    ...leagueFile,
    seasons: Object.fromEntries(Object.entries(leagueFile.seasons).map(([season, kinds]) => [season, { ...kinds, raw: {} }])),
  };

  const kb = (bytes) => `${(bytes / 1024).toFixed(0).padStart(6)} KB`;
  const sizes = (label, file) => {
    const text = serializeLeagueFile(file);
    const indented = JSON.stringify(file, null, 2);
    console.log(
      `${label.padEnd(12)} ${kb(Buffer.byteLength(text))} as written   ${kb(Buffer.byteLength(indented))} indented   ` +
        `${kb(gzipSync(text).length)} gzipped`,
    );
  };
  console.log(`One invented season: ${TEAMS} teams, ${WEEKS} weeks, ${ROSTER_SIZE} players a roster.\n`);
  sizes('with raw', leagueFile);
  sizes('without raw', withoutRawFile);
  console.log('\nBy kind (as written):');
  for (const [kind, files] of Object.entries(leagueFile.seasons[SEASON])) {
    const bytes = Buffer.byteLength(JSON.stringify(files));
    console.log(`  ${kind.padEnd(12)} ${String(Object.keys(files).length).padStart(3)} entries ${kb(bytes)}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
