---
id: "d62ecb3f-96e7-4b40-af80-287a01a8fac2"
level: "task"
title: "Write docs/espn-data.md from cited sources"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "docs"
blockedBy:
  - "e5169f1d-6c76-408d-95e9-a65b1cdb3fc9"
acceptanceCriteria:
  - "Every claim and table in docs/espn-data.md carries a label (operator-checked, verified or assumed) and a source"
  - "No code table entry is filled from memory; unreadable sources are listed under Open questions"
  - "No real league data appears in the doc"
  - "An 'Open questions' section lists every assumed fact the test-league check must confirm"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Write docs/espn-data.md, the ESPN counterpart of docs/sleeper-data.md. It is the reference every later ESPN task builds against. Part of PR 2 on feat/espn-football, cut from main after PR 1 (feat/provider-boundary) merges.\n\nDOCUMENT\n- the host, and the endpoints and views the client will use;\n- authentication: public leagues, and the espn_s2 and SWID cookies for private ones;\n- how the current week and the last fully scored week are worked out. If ESPN reports no 'last scored week', say so; see plan risk R6;\n- scoring period versus matchup period;\n- lineups and slots;\n- transactions and waivers, both FAAB and rolling;\n- pro teams;\n- the player list and its daily cache.\n\nLABELS\nEvery fact carries one label:\n- operator-checked: the facts in docs/plans/espn-football.md §4, checked by the operator on 2026-10-11;\n- verified: with the date and how it was checked;\n- assumed: naming the source file it came from, for example a specific file in a community ESPN client library (the espn-api Python package, the espn-fantasy-football-api JS package).\n\nCODE TABLES\nLineup slot, position, pro team and scoring stat IDs are copied from a cited source, with the source named beside each table. If a source can't be read, record the gap under 'Open questions'.\n\nNEVER FILL A TABLE OR A FIELD FROM MEMORY. No test league exists. Do not call ESPN's league endpoints from this task.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: no league IDs, team or manager names, scores or cookies."
lastModified: "2026-10-12T03:15:19.912Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
