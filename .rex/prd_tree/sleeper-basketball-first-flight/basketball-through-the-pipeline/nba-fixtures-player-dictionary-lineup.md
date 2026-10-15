---
id: "2c70587d-6c15-433a-9841-d0d946ad1974"
level: "task"
title: "NBA fixtures, player dictionary, lineup solver and week data"
status: "pending"
priority: "high"
blockedBy:
  - "51a8a0fa-3778-4e1d-b35f-5726ce17c62f"
acceptanceCriteria:
  - "Invented NBA fixtures (players, teams, a points league, two weeks of matchups) in the shapes docs/sleeper-basketball-data.md documents, with no real names or responses"
  - "/players/nba is cached separately from /players/nfl; normalized players carry every eligible position"
  - "The lineup solver's eligibility is sport-aware and fills basketball slots (per the data doc), so potential points and lineup efficiency work for basketball"
  - "captureWeek saves and reads basketball weeks; a matchup period that is not one week is refused as ESPN's multi-week periods are"
  - "Shape guards throw on an unexpected NBA shape, naming the field"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md section 3."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
