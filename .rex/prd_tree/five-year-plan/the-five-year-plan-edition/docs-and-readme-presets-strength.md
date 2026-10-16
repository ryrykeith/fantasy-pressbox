---
id: "de9b5079-6bef-4f37-9dc6-3b6176a2e8a1"
level: "task"
title: "Docs and README: presets, strength rating, rivalries, five-year plan"
status: "completed"
priority: "medium"
blockedBy:
  - "c91f5b66-9e7b-49a2-a2d0-187662ad3efa"
  - "38312af7-6d10-4cba-a0c9-16885bdfb71e"
  - "df872acf-3511-47a2-84d6-033d23786fbe"
startedAt: "2026-10-16T19:54:05.298Z"
completedAt: "2026-10-16T19:56:28.657Z"
endedAt: "2026-10-16T19:56:28.657Z"
resolutionType: "code-change"
resolutionDetail: "README, architecture and editorial-model docs now cover presets, strength rating, rivalries and the five-year plan, checked against the code."
acceptanceCriteria:
  - "README documents ranking presets, the strength rating, config/rivalries.yml and five-year-plan, with invented examples"
  - "docs/architecture.md lists the new modules (strength, rivalry, fiveYearPlan) and docs/editorial-model.md explains the strength formula and the rivalry intensity rule"
  - "No CHANGELOG.md edit (it is written at release); npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md. Describe what shipped, checked against the code, not the plan."
lastModified: "2026-10-16T19:56:28.694Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
