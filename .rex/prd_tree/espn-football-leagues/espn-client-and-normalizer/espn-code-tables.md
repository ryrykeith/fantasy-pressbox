---
id: "080c68eb-8448-4ca1-8c5d-13dcb37cafc0"
level: "task"
title: "ESPN code tables"
status: "pending"
priority: "high"
tags:
  - "espn"
blockedBy:
  - "d62ecb3f-96e7-4b40-af80-287a01a8fac2"
  - "3da51f03-72cc-4446-a5e6-cb95fbfad324"
acceptanceCriteria:
  - "Every entry in src/espn/codes.mjs traces to a source cited in docs/espn-data.md"
  - "Tests cover an unknown ID being refused for each table"
  - "Pro team codes resolve through src/nflTeams.mjs"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Turn ESPN's numeric codes into the project's vocabulary. Part of PR 2 on feat/espn-football.\n\nESPN reports lineup slots, positions, pro teams and scoring stats as numeric IDs. Add src/espn/codes.mjs with four tables, transcribed from the sources cited in docs/espn-data.md:\n- lineup slot ID to the shared slot vocabulary: QB, RB, WR, TE, FLEX, SUPER_FLEX, K, DEF, BN, IR and so on. The names in src/analysis/lineup.mjs's SLOT_ELIGIBILITY are the shared vocabulary;\n- position ID to position;\n- pro team ID to the canonical NFL code, through src/nflTeams.mjs;\n- scoring stat ID to a readable label and, where one exists, the matching scoring-profile field.\n\nEach table carries a comment naming its source file and marking it unverified.\n\nAn unknown ID throws, naming the table and the ID. It is never skipped or defaulted.\n\nNEVER FILL AN ENTRY FROM MEMORY. If docs/espn-data.md lists a table as open, leave it out, and note in the PR description that it remains open.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-12T03:15:47.592Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
