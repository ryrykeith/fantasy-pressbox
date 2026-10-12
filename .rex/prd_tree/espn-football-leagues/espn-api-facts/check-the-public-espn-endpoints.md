---
id: "cdb18c31-80ea-4006-b268-3ec67a75a1b1"
level: "task"
title: "Check the public ESPN endpoints (operator-run)"
status: "blocked"
priority: "medium"
tags:
  - "espn"
  - "live-check"
  - "operator-run"
blockedBy:
  - "e5169f1d-6c76-408d-95e9-a65b1cdb3fc9"
acceptanceCriteria:
  - "The script prints no player names or values and saves nothing"
  - "It runs only by hand and is not part of npm test"
  - "docs/espn-data.md records each result as verified, with how and when"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "BLOCKED UNTIL THE OPERATOR ASKS. An autonomous run must not make live requests for this task.\n\nWrite scripts/check-espn-shapes.mjs. It requests only the public endpoints that need no league:\n- the season endpoint;\n- players_wl with an x-fantasy-filter header;\n- proTeamSchedules_wl;\n- FantasyCalc's current values.\n\nIt prints only key names, types, array lengths and counts, never values, and saves nothing. It also prints the CORS headers from a request carrying an Origin header.\n\nThe operator runs it and the results go into docs/espn-data.md as verified, with the date. It answers:\n- whether ESPN players carry an age or a birth date;\n- the pro team ID to abbreviation table from proTeamSchedules_wl, compared with config/bye-weeks.<season>.yml (NFL codes are public, not league data);\n- the share of FantasyCalc's priced players that carry an espnId.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Never save a real response in the repository."
lastModified: "2026-10-12T03:15:36.687Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
