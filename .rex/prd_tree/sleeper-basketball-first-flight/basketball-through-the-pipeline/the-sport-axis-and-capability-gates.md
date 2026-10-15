---
id: "51a8a0fa-3778-4e1d-b35f-5726ce17c62f"
level: "task"
title: "The sport axis and capability gates"
status: "pending"
priority: "high"
blockedBy:
  - "cc0f60e4-95ba-4406-b3b4-f1e74f05e58b"
  - "de9b5079-6bef-4f37-9dc6-3b6176a2e8a1"
acceptanceCriteria:
  - "Sleeper's league.sport normalizes to league.sport 'football' or 'basketball' (detected, no .env key); ESPN leagues are football; an unknown sport is refused, naming it"
  - "Capabilities depend on provider and sport; every edition outside the plan's scope is refused for basketball with a reason, through the existing gates, before the provider is contacted where possible"
  - "The NFL bye table, NFL team aliases and nflverse are only reached for football; a guard test fails if a basketball league reaches them"
  - "Every football test passes unchanged"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md sections 1 and 3. Read docs/sleeper-basketball-data.md (D1) first; where it leaves a question open, refuse rather than guess."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
