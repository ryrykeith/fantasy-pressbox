---
id: "1db97321-028c-4ba3-960d-4c33cb30f144"
level: "task"
title: "README and docs for basketball"
status: "pending"
priority: "medium"
blockedBy:
  - "f1e131a6-87a2-4190-aab4-5a371f8a56a0"
acceptanceCriteria:
  - "README has a 'Basketball (first flight, experimental)' section: what works, what is refused and why"
  - "docs/architecture.md describes the sport axis"
  - "No CHANGELOG.md edit; npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md. Describe what shipped, checked against the code."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
