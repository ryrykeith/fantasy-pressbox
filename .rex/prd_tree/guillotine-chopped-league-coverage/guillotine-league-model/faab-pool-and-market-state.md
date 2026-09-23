---
id: "f36cf83f-9806-4e3c-bc19-3bb64dd1a714"
level: "task"
title: "FAAB pool and market state"
status: "pending"
priority: "high"
startedAt: "2026-09-23T08:29:54.874Z"
acceptanceCriteria: []
description: "The waiver market IS the story in a guillotine league — every chop dumps a full roster of talent onto the wire.\n\nWHAT\n- Remaining FAAB per surviving team. league.waiverBudget and team.waiverBudgetUsed are already normalized in src/sleeper/normalize.mjs, so this is mostly plumbing.\n- The pool released by the most recent chop: which players hit the wire and their quality.\n- Bid history from transactions: normalizeTransactions already captures waiver_bid, so winning bids on released players can be reported.\n\nACCEPTANCE\n- Context carries remaining FAAB per survivor and FAAB spent to date.\n- The players released by each elimination are identifiable and attributable to the team that was chopped.\n- Overlaps with the transactions epic — reuse that work rather than duplicating transaction normalization."
lastModified: "2026-09-23T14:39:00.411Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
