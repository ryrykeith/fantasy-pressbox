---
id: "53afc1f4-2658-48cd-811c-e12595f23b23"
level: "task"
title: "Projected rookie draft order module"
status: "completed"
priority: "high"
startedAt: "2026-10-09T19:21:39.596Z"
completedAt: "2026-10-09T19:28:07.655Z"
endedAt: "2026-10-09T19:28:07.655Z"
resolutionType: "code-change"
resolutionDetail: "Added src/analysis/draftOrder.mjs (projectDraftOrder, draftOrderMovement), futurePickOwnership in normalize.mjs (normalizeFutureDraftCapital now built on it), readDraftOrder + draftOrder key in captureWeek snapshots; 17 tests reproduce the 2026-10-09 order and the JD 1.07→1.02 cliff."
acceptanceCriteria: []
description: "Numbers only, in src/analysis/, consistent with danger.mjs: no prose.\n\nFOR EACH SLOT\n- original team, current owner (Sleeper's traded_picks lists only picks that moved, so start every team owning its own and apply the moves; normalizeFutureDraftCapital already does this and should be reused),\n- which group it falls in, the team's max points-for, and the gap to the slots either side,\n- distance from the top-3 line, which is the race tank watch reports.\n\nTHE CLIFF\nFor teams on the playoff bubble, compute the slot their pick would move to if they crossed the playoff line. In this league that jump is large: on 2026-10-09 Taco Tuesday' pick projected 1.07 and would have moved to 1.02. Report it per bubble team and name the pick's current owner, because the owner is the one with something at stake.\n\nHISTORY\nPersist the projection with each week's snapshot (captureWeek) so movement week over week can be reported without recomputing the past from today's data.\n\nACCEPTANCE\n- Reproduces the 2026-10-09 order from fixtures with that day's records, points-for and max points-for.\n- A traded pick reports its owner, not its original team, everywhere it appears."
lastModified: "2026-10-09T19:28:07.671Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
