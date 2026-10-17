---
id: "04b80313-7ebf-4f40-b4aa-a83a15636241"
level: "task"
title: "init, doctor and the league file for basketball"
status: "pending"
priority: "medium"
blockedBy:
  - "2c70587d-6c15-433a-9841-d0d946ad1974"
acceptanceCriteria:
  - "init detects a Sleeper NBA league and says it is basketball (first flight, experimental), offering only the formats in scope"
  - "doctor shows the sport and the basketball coverage; inspectLeague reports sport"
  - "A league file round-trips a basketball league; a categories league is refused at init and doctor with the reason"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
