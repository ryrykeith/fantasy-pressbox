---
id: "05f6c331-8ac8-46d2-9cab-d0c10dc757cc"
level: "task"
title: "Chopping-block and danger analysis"
status: "completed"
priority: "high"
startedAt: "2026-09-23T08:20:35.400Z"
completedAt: "2026-09-23T14:38:47.420Z"
endedAt: "2026-09-23T14:38:47.420Z"
acceptanceCriteria: []
description: "Produce the facts the coverage is actually about: who nearly died, who is trending toward the block, and by how much.\n\nWHAT TO COMPUTE (facts only — src/analysis/ produces numbers, never prose)\n- Weekly scoring order among survivors, and the margin between last and second-to-last (the survival margin).\n- Each surviving team's margin above the chop line this week.\n- Rolling floor: a team's lowest and median weekly score, since floor is the thing that kills you in this format.\n- Bye-week exposure: count of rostered starters on bye in upcoming weeks. Bye clustering is a named elimination risk in this format and the data to compute it exists in the player records.\n\nACCEPTANCE\n- Each week produces a survival margin and a per-team distance from the chop line.\n- Upcoming bye exposure is reported per team for the next few weeks.\n- All outputs are numeric facts consumable by the prompt layer, consistent with how src/analysis/week.mjs already separates facts from editorialising.\n\nRESOLUTION NOTE (2026-09-23): the first two ACCEPTANCE bullets and the weekly-scoring-order/rolling-floor WHAT-TO-COMPUTE bullets shipped in src/analysis/danger.mjs, wired into captureWeek's snapshot. The bye-week-exposure bullet did not: its premise (\"the data to compute it exists in the player records\") is false — the full cached Sleeper player dictionary has no bye-week field anywhere, verified directly. Split into a new task, \"Bye-week exposure per team\", with the finding and two candidate designs written up there rather than guessed at here."
lastModified: "2026-09-23T14:38:47.467Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
