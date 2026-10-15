---
id: "38312af7-6d10-4cba-a0c9-16885bdfb71e"
level: "task"
title: "Rivalries in the preview, recap and trade report"
status: "pending"
priority: "high"
blockedBy:
  - "9f0cb7e7-2e7a-4c3b-811d-e821c239a06d"
  - "5902709a-b876-4f7f-9d49-cb616dba9ba9"
acceptanceCriteria:
  - "A matchup between declared rivals carries a rivalry block in the preview and recap contexts: the pair's name and note (if set) and the head-to-head record from B2"
  - "prompts/weekly-preview.md and weekly-recap.md turn the intensity up one step above editorial roast_intensity for rivalry matchups only, use only the note and the head-to-head facts, and treat the note as the operator's framing, not a fact about a manager"
  - "A trade between rivals is flagged in the trade report's context and prompt"
  - "Survival editions and leagues with no rivalries file build exactly as before (existing tests pass unchanged)"
  - "Tests build a preview and a recap with a rivalry matchup on Sleeper and on ESPN fixtures and find the block; a context test fails if a rivalry is computed and not passed to buildContext"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 5. Wire through prepareEdition (src/edition.mjs) and buildContext (src/promptContext.mjs); read docs/prompt-design.md before editing prompts. Intensity is editorial: describe the step up in the prompts, and add an editorial.yml comment explaining it."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
