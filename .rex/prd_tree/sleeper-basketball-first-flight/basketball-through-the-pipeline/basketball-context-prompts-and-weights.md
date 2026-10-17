---
id: "ff440121-d033-412a-abfa-29df74b1246b"
level: "task"
title: "Basketball context, prompts and weights"
status: "pending"
priority: "high"
blockedBy:
  - "2c70587d-6c15-433a-9841-d0d946ad1974"
acceptanceCriteria:
  - "weights.basketball_dynasty and weights.basketball_redraft (and their strength sets and presets) exist in config/rankings.yml with no QB, superflex or TE premium factors, each summing to 1.0"
  - "Basketball contexts never carry football facts (bye weeks, superflex, TE premium, NFL teams); games this week is a fact only if the data doc names a usable source, otherwise unavailable"
  - "Preview, recap and weekly rankings have basketball prompts (own files or sport sections; the run says which and why), in the house voice"
  - "Market value is unavailable for basketball unless the data doc cites FantasyCalc NBA as usable"
  - "Tests build each of the three editions in memory for an invented basketball league"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md section 3. Read docs/prompt-design.md first."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
