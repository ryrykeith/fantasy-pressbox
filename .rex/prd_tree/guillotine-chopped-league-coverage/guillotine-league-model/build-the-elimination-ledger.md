---
id: "1566989f-ac20-4fa3-a641-877d553aa91d"
level: "task"
title: "Build the elimination ledger"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "Track which teams have been chopped and in which week. This is the spine of every guillotine edition.\n\nWHY IT IS NOT TRIVIAL\nSleeper has no elimination field. A chopped team shows up as a roster whose owner was removed and whose players were force-dropped — so the signals are indirect and depend on the commissioner having done the manual work promptly and correctly. A commissioner who is a day late leaves the tool looking at a league state that contradicts itself.\n\nAPPROACH\n- Derive candidate eliminations: rosters with an empty or near-empty player list, and/or a null owner_id, cross-referenced against being last in cumulative points in a completed week.\n- Allow a declared override: an operator-maintained ledger of week -> eliminated team, which wins over derivation. This is the reliable path and should be what doctor nudges users toward.\n- Reconcile the two and report disagreement explicitly rather than silently preferring one.\n\nACCEPTANCE\n- The ledger yields, for any week, the set of surviving teams and the ordered elimination history.\n- A derived elimination that contradicts the declared ledger is surfaced as a warning naming both, not swallowed.\n- A league where the commissioner has not yet processed the chop produces a clear 'week not yet resolved' state rather than a wrong answer.\n- The snapshot written by captureWeek in src/pipeline.mjs records the ledger state for that week, so history stays immutable in the same way scores already are."
lastModified: "2026-09-23T05:41:32.094Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
