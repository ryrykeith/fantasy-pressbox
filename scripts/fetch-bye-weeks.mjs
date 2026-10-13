#!/usr/bin/env node
/**
 * Builds the bye-week table for a season.
 *
 * A bye is not a published field anywhere — not in Sleeper, not in the NFL's
 * own feeds. It is the *absence* of a game. So the only honest way to get one
 * is to read the schedule and notice who is not playing.
 *
 * The schedule is nflverse's games.csv, from the nflverse-data 'schedules'
 * release, published under CC BY 4.0 (credit, licence link and a note of
 * changes are written into the generated file's header).
 *   https://github.com/nflverse/nflverse-data/releases/tag/schedules
 *   https://creativecommons.org/licenses/by/4.0/
 *
 * This runs once per season, when the schedule is released, and writes a file
 * that is reviewed and committed. Nothing at runtime calls out to anyone: the
 * table is 32 static rows that never change once published, so putting a
 * third-party feed on the critical path of every edition would buy nothing and
 * risk everything. A checked-in table is diffable, inspectable, and cannot
 * fail at 9pm on a Sunday.
 *
 * Usage:
 *   node scripts/fetch-bye-weeks.mjs 2027                      (downloads games.csv)
 *   node scripts/fetch-bye-weeks.mjs 2027 path/to/games.csv    (local copy, no network)
 *   node scripts/fetch-bye-weeks.mjs 2027 --print              (stdout, do not write)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STALE_CODES, nflverseTeamCode } from '../src/nflTeams.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GAMES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const REGULAR_SEASON = 'REG';
const WEEKS = 18;

// Team-code spellings (nflverse's LA -> LAR) live in src/nflTeams.mjs. A code
// it does not know is refused.

/** Parse CSV text (RFC 4180 quoting) into an array of rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** games.csv text from a local file, or downloaded from the nflverse release. */
export async function loadGamesCsv(localPath) {
  if (localPath) return readFileSync(localPath, 'utf8');
  const response = await fetch(GAMES_URL);
  if (!response.ok) throw new Error(`games.csv: nflverse release returned ${response.status}`);
  return response.text();
}

/** The weeks each team plays in the season's regular season, from games.csv text. */
export function weeksPlayedFromCsv(season, csvText) {
  const [header, ...rows] = parseCsv(csvText);
  if (!header) throw new Error('games.csv is empty.');
  const column = {};
  for (const name of ['season', 'game_type', 'week', 'away_team', 'home_team']) {
    column[name] = header.indexOf(name);
    if (column[name] === -1) throw new Error(`games.csv has no "${name}" column.`);
  }

  const weeksPlayed = new Map();
  let games = 0;
  for (const row of rows) {
    if (Number(row[column.season]) !== season || row[column.game_type] !== REGULAR_SEASON) continue;
    const week = Number(row[column.week]);
    if (!Number.isInteger(week) || week < 1 || week > WEEKS) {
      throw new Error(
        `games.csv has a regular-season game in week ${JSON.stringify(row[column.week])}, outside weeks 1-${WEEKS}.`,
      );
    }
    games++;
    for (const code of [row[column.away_team], row[column.home_team]]) {
      const team = nflverseTeamCode(code);
      if (!weeksPlayed.has(team)) weeksPlayed.set(team, new Set());
      weeksPlayed.get(team).add(week);
    }
  }
  if (games === 0) throw new Error(`games.csv has no regular-season games for ${season} — schedule not published?`);
  return weeksPlayed;
}

export function buildTable(season, csvText) {
  const weeksPlayed = weeksPlayedFromCsv(season, csvText);
  const teams = [...weeksPlayed.keys()].sort();

  const byes = new Map();
  const wrong = [];
  for (const team of teams) {
    const played = weeksPlayed.get(team);
    const off = [];
    for (let week = 1; week <= WEEKS; week++) if (!played.has(week)) off.push(week);
    if (off.length !== 1) wrong.push(`${team} has ${off.length} bye weeks (${off.join(', ') || 'none'})`);
    byes.set(team, off[0]);
  }

  // A partial table is worse than no table: it under-counts bye exposure and
  // says nothing about having done so. Refuse rather than ship one.
  if (teams.length !== 32) wrong.unshift(`found ${teams.length} teams, expected 32`);
  if (wrong.length) {
    throw new Error(`Schedule for ${season} did not produce one bye per team:\n  ${wrong.join('\n  ')}`);
  }

  return byes;
}

export function render(season, byes) {
  const rows = [...byes.entries()].map(([team, week]) => `  ${team}: ${week}`).join('\n');
  const aliases = Object.entries(STALE_CODES)
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
# Source: nflverse schedule data (games.csv, nflverse-data 'schedules'
#   release), CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
# Changes: reduced to each team's bye week, team codes mapped to this
#   project's (LA to LAR).
#
# Team codes are SLEEPER's, so they match what normalizePlayer returns.
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

async function main() {
  const args = process.argv.slice(2);
  const season = Number.parseInt(args.find((a) => /^\d{4}$/.test(a)) ?? '', 10);
  const localPath = args.find((a) => !a.startsWith('--') && !/^\d{4}$/.test(a));
  if (!Number.isInteger(season)) {
    console.error('Usage: node scripts/fetch-bye-weeks.mjs <season> [games.csv] [--print]');
    process.exit(1);
  }

  const byes = buildTable(season, await loadGamesCsv(localPath));
  const text = render(season, byes);

  if (args.includes('--print')) {
    process.stdout.write(text);
  } else {
    const path = join(ROOT, 'config', `bye-weeks.${season}.yml`);
    writeFileSync(path, text);
    console.log(`Wrote config/bye-weeks.${season}.yml — ${byes.size} teams, one bye each.`);
  }
}

// Importable for tests; runs only when invoked as a script.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
