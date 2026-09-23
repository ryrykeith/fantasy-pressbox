---
id: "1c698a80-41f4-404c-b795-f2b9a573863f"
level: "task"
title: "Surface positional value implications in every edition prompt"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Thread the scoring profile into buildContext for all tasks and reference it in the prompts that currently ignore it.\n\nWHERE\n- src/promptContext.mjs — editorialView / context.league.\n- prompts/weekly-power-rankings.md, prompts/weekly-preview.md, prompts/weekly-recap.md — none of these mention tePremium today.\n- prompts/preseason-power-rankings.md already mentions it; keep it consistent with the new profile shape.\n\nWHAT\nGive the model the profile AND the instruction on how to use it, in the same style as the existing superflex guidance in weekly-power-rankings.md ('In a Superflex league, quarterback...'). The instruction should be about relative positional value, not a formula: in a TE-premium league an every-down TE is a genuine positional advantage and should be ranked as one.\n\nACCEPTANCE\n- Generating weekly rankings for a TE-premium league produces a prompt whose ranking instructions explicitly account for elevated TE value.\n- A standard-scoring league's prompt does not acquire noise about premiums that do not apply."
lastModified: "2026-09-23T05:40:15.136Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
