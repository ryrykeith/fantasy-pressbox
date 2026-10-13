---
id: "ace1180a-bb08-4788-98bc-ad780b5d9ffb"
level: "task"
title: "Make the settings layer pure"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "promptContext.mjs and pipeline.mjs import no module that uses node:, process or import.meta.url"
  - "loadConfig returns the same object as before for every existing test workspace"
  - "resolveSettings has tests for the replaceKeys tables (ranking_emoji, awards, banned_phrases) and for the table-replaced-by-a-value error"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "config.mjs mixes pure helpers with .env, disk and process reads, and promptContext.mjs and pipeline.mjs import it.\n\n- Move the pure parts into a module with no node: imports: DEFAULT_EDITORIAL, deepMerge, validateRankingWeights, resolveRankingWeights, resolveFutureStockWeights, rankEmoji, parseLeagueProvider, LEAGUE_ID_KEYS, and the parse* checks config.mjs imports.\n- Add resolveSettings({ defaults, league, overrides }), which merges plain objects the way loadConfig does today, replaceKeys tables included.\n- loadConfig stays in config.mjs for the CLI. It reads .env and the YAML files, then calls resolveSettings. PACKAGE_ROOT stays CLI-only."
lastModified: "2026-10-13T02:35:35.979Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
