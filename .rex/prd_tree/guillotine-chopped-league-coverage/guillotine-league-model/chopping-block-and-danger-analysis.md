---
id: "05f6c331-8ac8-46d2-9cab-d0c10dc757cc"
level: "task"
title: "Chopping-block and danger analysis"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Produce the facts the coverage is actually about: who nearly died, who is trending toward the block, and by how much.\n\nWHAT TO COMPUTE (facts only — src/analysis/ produces numbers, never prose)\n- Weekly scoring order among survivors, and the margin between last and second-to-last (the survival margin).\n- Each surviving team's margin above the chop line this week.\n- Rolling floor: a team's lowest and median weekly score, since floor is the thing that kills you in this format.\n- Bye-week exposure: count of rostered starters on bye in upcoming weeks. Bye clustering is a named elimination risk in this format and the data to compute it exists in the player records.\n\nACCEPTANCE\n- Each week produces a survival margin and a per-team distance from the chop line.\n- Upcoming bye exposure is reported per team for the next few weeks.\n- All outputs are numeric facts consumable by the prompt layer, consistent with how src/analysis/week.mjs already separates facts from editorialising."
lastModified: "2026-09-23T05:41:33.196Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
