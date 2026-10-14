---
id: "3da51f03-72cc-4446-a5e6-cb95fbfad324"
level: "task"
title: "One NFL team alias module"
status: "completed"
priority: "high"
tags:
  - "espn"
  - "bye-weeks"
blockedBy:
  - "e5169f1d-6c76-408d-95e9-a65b1cdb3fc9"
startedAt: "2026-10-12T16:50:13.689Z"
completedAt: "2026-10-12T16:52:00.515Z"
endedAt: "2026-10-12T16:52:00.515Z"
acceptanceCriteria:
  - "One alias table, imported by scripts/fetch-bye-weeks.mjs and available to src/espn/"
  - "Tests cover WSH to WAS, OAK to LV, and an unknown code refused"
  - "With the network stubbed by a fixture schedule, fetch-bye-weeks output is unchanged from before the move; no live ESPN request in tests"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Gather the NFL team abbreviation aliases into one module that the bye-week generator and the ESPN normalizer share. Part of PR 2 on feat/espn-football.\n\nTODAY\nThe aliases live only in scripts/fetch-bye-weeks.mjs:\n- ESPN_TO_SLEEPER at :35 (WSH to WAS);\n- STALE_ALIASES at :45 (OAK to LV).\n\nsrc/analysis/byeExposure.mjs refuses any code its table doesn't know.\n\nCHANGE\nAdd src/nflTeams.mjs with:\n- the canonical codes, which are the bye-week table's codes, today Sleeper's spelling;\n- the ESPN-to-canonical aliases;\n- the stale codes.\n\nscripts/fetch-bye-weeks.mjs imports it, and the ESPN normalizer will too. An unknown code is refused, never passed through. Add an alias only if a cited source or the committed table shows it. Do not add guessed aliases.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Tests never touch the network."
lastModified: "2026-10-12T16:52:00.590Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
