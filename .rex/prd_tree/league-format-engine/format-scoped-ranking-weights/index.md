---
id: "ac2c8227-bc26-433d-8162-8e07dfacc506"
level: "feature"
title: "Format-scoped ranking weights"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Make config/rankings.yml weights depend on the resolved format type.\n\nWHY\nThe current single weight set spends 35% of the ranking on dynasty_value and future_draft_capital. Applied to a redraft league that is straightforwardly wrong — there are no future picks and long-term asset value is irrelevant the moment the season ends. Applied to a guillotine league it is worse than wrong, because survival depends on weekly floor, not asset quality."
lastModified: "2026-09-23T05:40:15.634Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Restructure rankings.yml into per-format weight sets](./restructure-rankings-yml-into-per.md) | completed |
| [Validate weight sets and fail loudly on mismatch](./validate-weight-sets-and-fail-loudly.md) | pending |
