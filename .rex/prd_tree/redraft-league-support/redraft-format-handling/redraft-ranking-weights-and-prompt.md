---
id: "e11d3d25-5c26-408e-87f8-c87593df8a39"
level: "task"
title: "Redraft ranking weights and prompt guidance"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Give redraft its own weight set and make the ranking prompts respect it.\n\nWEIGHTS\nDrop dynasty_value and future_draft_capital to zero. Redistribute into starting_lineup, depth, contender_viability and roster_flexibility — in a redraft league the only question is who wins this season.\n\nPROMPTS\nprompts/weekly-power-rankings.md and prompts/preseason-power-rankings.md both instruct on dynasty asset value and age curves. preseason-power-rankings.md line 20 asks for 'dynasty asset value and age curve' unconditionally. These sections must become conditional on format, or the prompt files must be selected per format.\n\nDESIGN NOTE\nDecide between (a) conditional sections inside the shared prompt files driven by the context, or (b) per-format prompt files. Option (b) duplicates the house style across files and will drift; option (a) keeps one file but makes it harder to read. Prefer (a) with clearly delimited conditional blocks, and record the decision wherever the prompts are documented.\n\nACCEPTANCE\n- Redraft rankings never mention draft capital, taxi squads, or long-term asset value.\n- Age is still allowed as a factor where it bears on THIS season (an ageing RB in decline), but not as an asset-value argument.\n- The weight set sums to 1.0 and passes the validation added in the format engine epic."
lastModified: "2026-09-23T05:43:06.617Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
