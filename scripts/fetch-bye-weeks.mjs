#!/usr/bin/env node
/**
 * Builds the bye-week table for a season.
 *
 * A bye is not a published field anywhere — not in Sleeper, not in the NFL's
 * own feeds. It is the *absence* of a game. So the only honest way to get one
 * is to read the schedule and notice who is not playing.
 *
 * This runs once per season, when the schedule is released, and writes a file
 * that is reviewed and committed. Nothing at runtime calls out to ESPN: the
 * table is 32 static rows that never change once published, so putting a
 * third-party API on the critical path of every edition would buy nothing and
 * risk everything. A checked-in table is diffable, inspectable, and cannot
 * fail at 9pm on a Sunday.
 *
 * Usage:
 *   node scripts/fetch-bye-weeks.mjs 2027
 *   node scripts/fetch-bye-weeks.mjs 2027 --print   (stdout, do not write)
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REGULAR_SEASON = 2;
const WEEKS = 18;

/**
 * ESPN's abbreviations are not Sleeper's, and the differences are silent.
 *
 * Washington is the live one: Sleeper says WAS, ESPN says WSH. Left unmapped,
 * every Washington player looks like it never has a bye — which reads as good
 * news rather than as a bug, and so would reach print unchallenged.
 */
const ESPN_TO_SLEEPER = { WSH: 'WAS' };

/**
 * Abbreviations Sleeper still uses that no longer have a schedule.
 *
 * Sleeper carries OAK on players who were Raiders before the move to Las
 * Vegas. Those players are long retired, but a stale id on a roster must not
 * hard-fail an edition, so the alias resolves it to the franchise's current
 * abbreviation rather than leaving it unknown.
 */
const STALE_ALIASES = { OAK: 'LV' };

async function teamsPlayingIn(season, week) {
  const url =
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' +
    `?seasontype=${REGULAR_SEASON}&week=${week}&dates=${season}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Week ${week}: ESPN returned ${response.status}`);
  const payload = await response.json();

  const playing = new Set();
  for (const event of payload.events || []) {
    for (const side of event.competitions?.[0]?.competitors || []) {
      const abbreviation = side.team?.abbreviation;
      if (abbreviation) playing.add(ESPN_TO_SLEEPER[abbreviation] ?? abbreviation);
    }
  }
  if (playing.size === 0) throw new Error(`Week ${week}: no teams found — schedule not published?`);
  return playing;
}

async function buildTable(season) {
  const weeksPlayed = new Map();
  const teams = new Set();

  for (let week = 1; week <= WEEKS; week++) {
    for (const team of await teamsPlayingIn(season, week)) {
      teams.add(team);
      if (!weeksPlayed.has(team)) weeksPlayed.set(team, new Set());
      weeksPlayed.get(team).add(week);
    }
  }

  const byes = new Map();
  const wrong = [];
  for (const team of [...teams].sort()) {
    const played = weeksPlayed.get(team);
    const off = [];
    for (let week = 1; week <= WEEKS; week++) if (!played.has(week)) off.push(week);
    if (off.length !== 1) wrong.push(`${team} has ${off.length} bye weeks (${off.join(', ') || 'none'})`);
    byes.set(team, off[0]);
  }

  // A partial table is worse than no table: it under-counts bye exposure and
  // says nothing about having done so. Refuse rather than ship one.
  if (teams.size !== 32) wrong.unshift(`found ${teams.size} teams, expected 32`);
  if (wrong.length) {
    throw new Error(`Schedule for ${season} did not produce one bye per team:\n  ${wrong.join('\n  ')}`);
  }

  return byes;
}

function render(season, byes) {
  const rows = [...byes.entries()].map(([team, week]) => `  ${team}: ${week}`).join('\n');
  const aliases = Object.entries(STALE_ALIASES)
    .map(([from, to]) => `  ${from}: ${to}`)
    .join('\n');

  return `# ============================================================================
# NFL bye weeks for the ${season} season.
#
# GENERATED — do not edit by hand. Rebuild with:
#   node scripts/fetch-bye-weeks.mjs ${season}
#
# A bye week is the absence of a game, not a field anyone publishes. Sleeper
# has no bye or schedule endpoint at all, so this table is derived from the
# NFL schedule: for each week, the teams with no game are on bye.
#
# Team codes are SLEEPER's, so they match what normalizePlayer returns. The
# generator maps ESPN's spellings across (notably WSH -> WAS).
#
# Static once the schedule is released. Regenerate when the ${season + 1}
# schedule is published, and commit the result.
# ============================================================================

season: ${season}

bye_weeks:
${rows}

# Abbreviations Sleeper still reports that no longer field a team. Resolved to
# the franchise's current code so a stale player id cannot fail an edition.
aliases:
${aliases}
`;
}

const args = process.argv.slice(2);
const season = Number.parseInt(args.find((a) => /^\d{4}$/.test(a)) ?? '', 10);
if (!Number.isInteger(season)) {
  console.error('Usage: node scripts/fetch-bye-weeks.mjs <season> [--print]');
  process.exit(1);
}

const byes = await buildTable(season);
const text = render(season, byes);

if (args.includes('--print')) {
  process.stdout.write(text);
} else {
  const path = join(ROOT, 'config', `bye-weeks.${season}.yml`);
  writeFileSync(path, text);
  console.log(`Wrote config/bye-weeks.${season}.yml — ${byes.size} teams, one bye each.`);
}
