---
id: "345d826c-9537-43d1-94d7-79358d650f81"
level: "task"
title: "League file v1: schema, validator, import and export"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "Exporting a league folder and importing it again gives identical data/ files (round-trip test with the invented cast)"
  - "parseLeagueFile refuses unknown keys, a newer schemaVersion and malformed history, with errors naming the field"
  - "No API key, ESPN_S2 or ESPN_SWID value reaches a league file (tested with a .env that contains them)"
  - "record saves the full reply text alongside the rankings or predictions"
  - "The size of a full invented season, with and without raw, is written in the task's log"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "One JSON file holding a league's history. Its seasons mirror the store one to one.\n\nSHAPE\n- schemaVersion: 1\n- kind: 'fantasy-pressbox.league'\n- writtenBy: { package, version, surface }, and writtenAt\n- league: { provider, leagueId }\n- settings: { displayName, format, tone, roastIntensity, postFormat, maxChars, rankEmoji, declared: { eliminations, rookieDraft, prospects } }\n- seasons: { <season>: { raw, snapshots, rankings, predictions, market, tankWatch, editions } }\n\nRULES\n- The file never holds an API key, ESPN_S2, ESPN_SWID, AI_PROVIDER, AI_MODEL, DATA_DIR, OUTPUT_DIR or DEBUG.\n- An unknown top-level key, kind or kind of history is refused. A newer schemaVersion is refused with \"update the package\" in plain words; an older one is migrated.\n- editions is new. record now saves the whole reply text, keyed week-<n>-<task>, in the file store too.\n\nFOLDER MAPPING\nleagueFileFromWorkspace(entries) maps a list of { path, text } pairs from a league folder. It reads an allowlist only:\n- from .env, only LEAGUE_PROVIDER, SLEEPER_LEAGUE_ID, ESPN_LEAGUE_ID, LEAGUE_FORMAT, LEAGUE_DISPLAY_NAME, PRESSBOX_TONE, SLEEPER_POST_MAX_LENGTH, INCLUDE_EMOJI, SLEEPER_SEASON and FANTASY_WEEK, plus the ESPN epic's non-secret keys once it merges. API key lines are dropped as they are read;\n- config/editorial.yml, rankings.yml, rookie-draft.yml, guillotine.yml and prospects.<YYYY>.yml;\n- data/<kind>/<YYYY>/*.json.\ndata/cache/ is skipped.\n\nCLI\nAdd export-league [file] and import-league <file>.\n\nSIZE\nMeasure a full invented season with and without the raw bundles. The FAAB market reads raw, so record the numbers and whether raw stays in."
lastModified: "2026-10-13T02:35:39.425Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
