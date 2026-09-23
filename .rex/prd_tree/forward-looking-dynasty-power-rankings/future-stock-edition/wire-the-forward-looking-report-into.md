---
id: "61fbe539-0bf7-42d7-9d26-edf845180e47"
level: "task"
title: "Wire the forward-looking report into CLI and config"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "Register the task, add the command, and give it its own weight set.\n\nWHERE src/cli.mjs (HELP and dispatch), src/promptContext.mjs (TASK_PROMPTS), config/rankings.yml (a forward-looking weight set under the dynasty format).\n\nThe weights differ from the standard dynasty set: future_draft_capital and the age/window factors carry far more, current-week form far less. Note that the current weights list has no age factor at all — one needs adding.\n\nACCEPTANCE\n- Command documented in HELP with an example, consistent with the existing entries.\n- Weight set validates and sums to 1.0.\n- Works with and without --generate."
lastModified: "2026-09-23T05:43:15.199Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
