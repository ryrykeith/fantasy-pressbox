---
id: "1be8aca2-4089-4651-b371-1c937af219a9"
level: "task"
title: "Trade grade prompt and task registration"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Write the prompt and register it as a task in TASK_PROMPTS in src/promptContext.mjs.\n\nCONTENT\n- Grade each side of each trade, with reasoning tied to the structured facts.\n- Judge against roster construction and league format: a win-now move by a contender and the same move by a rebuilding team are not the same trade. In dynasty, factor the pick capital already computed by normalizeFutureDraftCapital. In redraft, ignore picks entirely. In guillotine, judge purely on whether it raises the weekly floor.\n- Keep the existing house rules: the JSON context is authoritative, no invented facts, banned phrases from config/editorial.yml respected, output length-checked for the Sleeper limit.\n\nACCEPTANCE\n- A trade with no clear winner is allowed to be graded as such rather than forced into a verdict.\n- The edition cites only players and picks present in the context.\n- Output passes checkPosts in src/validate.mjs for the configured format."
lastModified: "2026-09-23T05:43:09.248Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
