---
id: "7f7c8d1c-3de9-4fe1-88d0-f47b2d091077"
level: "task"
title: "Waiver and FAAB market context"
status: "in_progress"
priority: "medium"
startedAt: "2026-10-09T18:26:10.395Z"
acceptanceCriteria: []
description: "FINDINGS FROM THE DJ MOORE PROTOTYPE (2026-10-08) — read before starting\nA one-off trade-grade prompt was built by hand for the week 3 DJ Moore trade in the operator's own league, to see what a good grade actually needs. What it showed:\n\nREUSE, DO NOT REBUILD. src/analysis/faab.mjs landed on main with the guillotine FAAB work (#10): balances, released pools and bids. This task should consume it and add only what transaction coverage needs on top. Check the module before writing anything new.\n\n---- original description ----\n\nBuild the market picture that makes a single pickup legible.\n\nWHAT\n- Remaining FAAB per team and spend to date (waiverBudget and waiverBudgetUsed are already normalized).\n- Bid distribution for the week: what other claims were placed and at what price, so an overpay or a bargain can be identified as such.\n- Whether the added player was a chop-pool release, in guillotine leagues — cross-reference the elimination ledger from the guillotine epic.\n\nACCEPTANCE\n- A pickup can be described relative to the market: what it cost, what it cost relative to budget, and what else was going for similar money that week."
lastModified: "2026-10-09T18:26:10.409Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
