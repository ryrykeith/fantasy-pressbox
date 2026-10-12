---
id: "f7204756-253f-41a9-b8d3-7d6faf9c156c"
level: "task"
title: "ESPN league, team and player normalizer"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "format"
  - "scoring"
blockedBy:
  - "09aca277-0e30-4d6d-8e52-0f758311de1d"
acceptanceCriteria:
  - "Normalizing the ESPN fixtures gives the expected League, Team and Player shapes"
  - "A declared guillotine on ESPN is refused, naming the reason; a declared dynasty is accepted"
  - "A keeper league resolves to redraft with a keeper flag"
  - "format.scoring has exactly the deriveScoringProfile shape; unmapped stats appear in notModelled"
  - "A test asserts no firstName or lastName value reaches a team, snapshot or prompt"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Turn ESPN responses into the shared League, Team and Player shapes (docs/plans/espn-football.md §6). Part of PR 2 on feat/espn-football.\n\nLEAGUE (src/espn/normalize.mjs)\n- startingSlots and bench slots through src/espn/codes.mjs;\n- draftStatus;\n- playoff team count and start week, and the seeding setting;\n- waiver type (FAAB or rolling) and budget;\n- trade deadline.\n\nUse null where docs/espn-data.md says a value is not reported. Never borrow a value from Sleeper's defaults.\n\nFORMAT\n- detectFormatType reports 'redraft' for ESPN, keeper leagues included, and flags a keeper league so the editions can mark keeper designations unavailable.\n- A declared LEAGUE_FORMAT wins, exactly as on Sleeper (src/format.mjs). A declared 'dynasty' is accepted.\n- A declared 'guillotine' is refused on ESPN, with the reason: not supported on ESPN in v1.\n\nSCORING\nformat.scoring keeps exactly the shape deriveScoringProfile returns: superflex, reception, passing, nonDefault, notModelled and isDefault. It is built from the scoring stat-ID table and an ESPN defaults table copied from a cited source. Unmapped stats go to notModelled. Each nonDefault entry carries a readable label beside its key.\n\nTEAM\n- rosterId is the ESPN team ID.\n- name is the team name.\n- manager is the member's displayName only. Never firstName or lastName: they must not reach a team, a snapshot or a prompt.\n\nPLAYER\n- position through the code table;\n- team as the canonical code through src/nflTeams.mjs;\n- injury status if present;\n- age only if ESPN supplies an age or a birth date, otherwise absent.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere. Use the fixtures in tests/fixtures/mock-espn-league.mjs."
lastModified: "2026-10-12T03:16:15.936Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
