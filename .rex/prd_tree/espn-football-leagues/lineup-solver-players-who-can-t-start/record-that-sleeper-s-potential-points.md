---
id: "539ef3f0-cda3-41e6-950b-571aff676503"
level: "task"
title: "Record that Sleeper's potential points count IR and taxi players (no code change)"
status: "completed"
priority: "medium"
tags:
  - "sleeper"
  - "lineup"
blockedBy:
  - "4accdf77-8903-40ac-aebf-28e4867a9584"
startedAt: "2026-10-13T02:23:26.993Z"
completedAt: "2026-10-13T02:23:56.578Z"
endedAt: "2026-10-13T02:23:56.578Z"
acceptanceCriteria:
  - "docs/sleeper-data.md records that Sleeper's ppts counts reserve and taxi players, with the date, the method and the aggregate counts"
  - "docs/espn-data.md notes the intended difference between ESPN (IR left out) and Sleeper (kept to match Sleeper's figure)"
  - "No change under src/; the full suite passes"
  - "No team, player or league identifier appears in either doc"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13): check result and operator decision\nThe operator ran scripts/check-sleeper-reserve.mjs (commit 5891b9f) on their own Sleeper league. Aggregate counts only:\n- Question 1: 12 rosters checked. In the latest saved week's matchup `players` lists, 33 entries were in their roster's reserve (IR) and 44 in its taxi squad, judged by today's lists. 11 rosters hold reserve players today and 11 hold taxi players. Reading: Sleeper's matchup list includes reserve and taxi players.\n- Question 2: 4 saved scored weeks summed. Rosters matching Sleeper's ppts within 0.01: 12 of 12 with the solver as today; 4 of 12 leaving out today's reserve and taxi players. The 12-of-12 result doesn't depend on today's reserve/taxi lists.\n- Conclusion: Sleeper's published season potential points count IR and taxi players as lineup candidates. The solver already reproduces them exactly.\n\nOPERATOR DECISION: keep matching Sleeper. NO CODE CHANGE to the Sleeper solver.\n\nTHIS TASK, therefore:\n- Add to docs/sleeper-data.md, under 'Lineups' and in 'Verifying changes', a short dated note: Sleeper's matchup `players` include reserve and taxi players; Sleeper's ppts treats them as candidates; the solver keeps them so its potential points and lineup efficiency match the figure Sleeper shows managers. Say how it was checked (scripts/check-sleeper-reserve.mjs, 2026-10-13; 12 of 12 rosters matched as today, 4 of 12 without them, over 4 weeks).\n- Do not quote any team, player or league identifier. The counts above are aggregates and may be quoted.\n- Add a sentence to docs/espn-data.md under 'Rosters and lineups' saying the providers differ on purpose: ESPN IR players are left out (ESPN publishes no potential-points figure to match), while Sleeper keeps them to match Sleeper's own figure.\n- Leave src/ unchanged.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-13T02:23:56.602Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
