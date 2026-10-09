---
id: "dd8d94a4-b1ac-459d-98da-4dfe2f5d6e24"
level: "task"
title: "Key rankings and predictions by roster id"
status: "completed"
priority: "high"
startedAt: "2026-10-09T17:06:13.288Z"
completedAt: "2026-10-09T17:06:13.514Z"
endedAt: "2026-10-09T17:06:13.514Z"
acceptanceCriteria: []
description: "Found 2026-10-08 in the operator's league: roster 5 was ranked #3 as 'user4817' (the manager's username, because the team had never been named), then renamed to 'Pick Six Appeal'. withMovement matched by name, so the week 4 prompt showed a #3 team that no longer existed and a new team with no history, and recording would have filed Pick Six Appeal with no movement.\n\nFixed in src/teamIdentity.mjs: names resolve to roster ids via that week's snapshot, then current names, then the manager username. Recording pins each name to a roster and refuses unknown names; movement, preview grading and chop grading match on roster; the prompt lists last week under current names with 'formerly'. No published file is rewritten.\n\nAlso caught: chop grading compared names, so a rename would have marked a correct chop call WRONG."
lastModified: "2026-10-09T17:06:13.530Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
