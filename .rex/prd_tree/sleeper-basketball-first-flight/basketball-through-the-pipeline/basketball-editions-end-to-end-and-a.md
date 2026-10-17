---
id: "f1e131a6-87a2-4190-aab4-5a371f8a56a0"
level: "task"
title: "Basketball editions end to end and a coverage matrix"
status: "pending"
priority: "high"
blockedBy:
  - "ff440121-d033-412a-abfa-29df74b1246b"
  - "04b80313-7ebf-4f40-b4aa-a83a15636241"
acceptanceCriteria:
  - "Through the CLI against a fake Sleeper NBA API (like tests/sleeper-cli-guillotine.test.mjs): fetch, preview, recap, rankings, record, grade and check on an invented basketball league"
  - "Every refused edition is refused with its reason through the CLI"
  - "docs/sleeper-basketball-data.md has a coverage matrix (edition by fact: supplied, unavailable, refused) and a test keeps it matching the code, like tests/espn-coverage-matrix.test.mjs"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/sleeper-basketball.md section 4."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
