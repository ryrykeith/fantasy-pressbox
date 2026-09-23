---
id: "64ee423c-b258-4027-90a5-6727951ae274"
level: "epic"
title: "Trade and waiver wire coverage"
status: "pending"
priority: "high"
description: "Add press coverage of transactions: trade grades and waiver/free-agent pickup commentary. These are press-worthy events in EVERY league format.\n\nWHY\nTransactions are the second most discussed thing in a league chat after scores, and the project currently does almost nothing with them. normalizeTransactions in src/sleeper/normalize.mjs already does solid work — it filters to completed moves, reads adds, drops, traded picks (correctly excluding picks for drafts already held) and FAAB transfers, and captures the winning waiver bid. But the output is a flat array of prose-ish strings, it is passed to the model only as incidental colour alongside whatever edition is being written, and there is no edition about it and no CLI command for it.\n\nWHAT THIS ADDS\nA transaction scan that builds a dedicated brief — trade grades, and comments on pickups judged against the acquiring roster's actual needs — usable either as a pasteable prompt or via the provider API, matching the two existing paths in src/generate.mjs.\n\nAPPLIES TO all three formats. In guillotine it matters more than anywhere else, because the FAAB market after each chop is the central drama of the season."
lastModified: "2026-09-23T05:43:06.915Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Trade report edition](./trade-report-edition/index.md) | pending |
| [Transaction analysis](./transaction-analysis/index.md) | pending |
| [Waiver wire edition](./waiver-wire-edition/index.md) | pending |
