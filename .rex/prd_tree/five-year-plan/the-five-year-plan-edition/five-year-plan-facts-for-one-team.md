---
id: "cd725331-03af-45dc-8b0b-c8dd7cfa0b1b"
level: "task"
title: "Five-year plan facts for one team"
status: "pending"
priority: "high"
blockedBy:
  - "6bb15567-7681-4e1f-959a-5c611ed32069"
acceptanceCriteria:
  - "src/analysis/fiveYearPlan.mjs (pure) gives, for seasons S to S+4: each rostered player's age at each season's start and age-curve stage (rising, peak, declining, cliff), per-season counts of today's starters past their position's decline age, and the share of today's starter points from players before their cliff"
  - "Age-curve thresholds per position live in config/rankings.yml age_curves, commented as editorial judgement, and agree with what prompts/future-stock.md says about positions"
  - "Picks held per season come from pickCapital; a season Sleeper has not issued picks for is unavailable ('not issued yet'); a player with no age is unavailable, never aged 0"
  - "It carries today's strength rating and components (A2), the team's league rank and its market value"
  - "No projected points, records or titles anywhere in the output (a test asserts the shape has none)"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 6. Age basis: Sleeper's player age shifted forward a year per season; say so in the output (age_basis). Reuse rosterWindow's age bands where they fit."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
