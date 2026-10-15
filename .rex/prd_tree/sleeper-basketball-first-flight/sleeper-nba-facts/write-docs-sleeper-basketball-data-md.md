---
id: "cc0f60e4-95ba-4406-b3b4-f1e74f05e58b"
level: "task"
title: "Write docs/sleeper-basketball-data.md from cited sources"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "docs/sleeper-basketball-data.md cites a public source for every claim about Sleeper's NBA data: league.sport, /players/nba fields (positions and multi-position eligibility, age, team), /state/nba, matchups and what an NBA matchup period is (including multi-week periods and playoffs), roster slot names, scoring_settings keys, how a categories league differs from a points league, IR and taxi, traded picks"
  - "It answers, with sources, whether a licensed NBA schedule (games per team per week) and FantasyCalc NBA values exist and may be used; if not, it says those facts are unavailable for the first flight"
  - "Every claim without a source is listed under open questions, not stated as fact"
  - "No live request is made and no real league data or response is saved"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md. Model it on docs/sleeper-data.md and docs/espn-data.md (sources, shapes, open questions). The live check is a separate operator-run task (D2)."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
