---
id: "ad7c471d-74f6-4be9-9efb-3232e7fed655"
level: "task"
title: "Tank watch prompt, task registration and CLI command"
status: "completed"
priority: "high"
startedAt: "2026-10-09T19:32:24.326Z"
completedAt: "2026-10-09T19:41:12.609Z"
endedAt: "2026-10-09T19:41:12.609Z"
resolutionType: "code-change"
resolutionDetail: "tank-watch edition (src/tankWatch.mjs, prompts/tank-watch.md, CLI command, store persistence) committed as eab7e14; 493 tests pass"
acceptanceCriteria: []
description: "A standalone edition, tank-watch, run when the operator wants it from a configurable start week (around the season midpoint).\n\nREFUSALS\n- No declared rookie-draft rule: refuse, naming the config key (same style as the guillotine refusals).\n- Not a dynasty league: refuse. Redraft leagues have no rookie draft.\n- Before the configured start week: refuse unless overridden, saying when it opens.\n\nCONTENT\n- The race for 1.01-1.03 among projected non-playoff teams, with the max points-for gaps between them.\n- Pick ownership: who is rooting for whom. A team that owns another team's pick has a stake in that team losing.\n- The playoff cliff: bubble teams whose pick would jump across the line, and by how much.\n- The prize: the board's top prospects for the top slots, only when a prospect board exists; otherwise an unavailable entry.\n- Movement since the previous tank watch, from the persisted projections.\n\nPosts are within the configured length limit, and the edition follows the house rules: no invented facts, and the unavailable list is honored."
lastModified: "2026-10-09T19:41:12.623Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
