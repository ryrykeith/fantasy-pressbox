---
id: "8679cf98-a4c2-4529-84f4-c327eff08149"
level: "task"
title: "Normalized player dictionary"
status: "pending"
priority: "high"
tags:
  - "providers"
  - "refactor"
acceptanceCriteria:
  - "No module outside src/sleeper/ reads full_name, first_name, last_name, injury_status or years_exp"
  - "src/analysis/week.mjs, faab.mjs and transactions.mjs no longer import normalizePlayer"
  - "Prompt context output for every edition is byte-identical on the existing fixtures; a new test pins one edition's context"
  - "describePlayer output is unchanged, including the FA fallback and the injury suffix"
  - "The 671 existing tests pass, with only import-path changes"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Stop passing the raw Sleeper player dictionary through the application.\n\nTODAY\nopenLeague (src/pipeline.mjs:47) passes the raw Sleeper /players/nfl dictionary everywhere as `players`. It is read by raw Sleeper field name outside src/sleeper/:\n- src/promptContext.mjs:128 `describePlayer` duplicates `normalizePlayer`, reading full_name, first_name, last_name, team, injury_status. It is used at :163, :440, :554, :691 and :736.\n- src/analysis/rosterWindow.mjs:95, :98 read age and position.\n- src/analysis/byeExposure.mjs:170 reads team.\n- src/analysis/week.mjs, faab.mjs and transactions.mjs import normalizePlayer from src/sleeper/normalize.mjs.\n\nCHANGE\n- openLeague builds `players[id] = { id, name, position, team, age, yearsExp, injuryStatus, status }` once, with src/sleeper/normalize.mjs#normalizePlayer.\n- Every consumer reads that normalized record.\n- describePlayer takes a normalized player and keeps its exact output, including the 'FA' fallback and the injury suffix.\n- The analysis modules stop importing normalizePlayer. A missing player stays 'Unknown player <id>' as today.\n- A field a provider does not supply is absent, not null. For Sleeper every field is present as today.\n- Mind the size: the dictionary is around 12,000 players, so build it once per run, not per call.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: code, tests, fixtures, docs or commits. Use the invented cast in tests/fixtures/mock-dynasty-league.mjs.\n- No behaviour change for Sleeper.\n\nPlan: docs/plans/espn-football.md §5 and §6."
lastModified: "2026-10-12T03:14:26.431Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
