---
id: "c91f5b66-9e7b-49a2-a2d0-187662ad3efa"
level: "task"
title: "Strength rating in the ranking prompts"
status: "completed"
priority: "medium"
blockedBy:
  - "6bb15567-7681-4e1f-959a-5c611ed32069"
startedAt: "2026-10-15T17:31:18.488Z"
completedAt: "2026-10-15T17:33:30.069Z"
endedAt: "2026-10-15T17:33:30.069Z"
resolutionType: "code-change"
resolutionDetail: "Four ranking prompts explain strength; prompt test added; 1209 tests pass (80e2b11)."
acceptanceCriteria:
  - "prompts/weekly-power-rankings.md, preseason-power-rankings.md, postseason-power-rankings.md and future-stock.md explain strength (the rating, its components and strength.unavailable) and how to use it"
  - "The prompts say the rating is evidence, not the ranking: a team is never ranked on its rating alone, and an unavailable component is said, not guessed"
  - "A prompt test builds each of those editions from the fixtures and finds the strength block in the context and its explanation in the prompt; existing prompt tests pass"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 4. A2 put `strength` in the ranking contexts. Teach the prompts to use it, in the voice of the existing prompts (read docs/prompt-design.md first). Do not change ranking weights or the rating itself."
lastModified: "2026-10-15T17:33:30.132Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
