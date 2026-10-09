---
id: "61fbe539-0bf7-42d7-9d26-edf845180e47"
level: "task"
title: "Wire the forward-looking report into CLI and config"
status: "completed"
priority: "medium"
startedAt: "2026-10-09T21:47:53.741Z"
completedAt: "2026-10-09T21:50:21.958Z"
endedAt: "2026-10-09T21:50:21.958Z"
resolutionType: "code-change"
resolutionDetail: "Commit 6252da4: future-stock command, refusals, weights.future_stock, tests."
acceptanceCriteria: []
description: "READ FIRST (2026-10-09) — this task predates the trade report and rookie draft epics, which have since landed on main. Reuse what they built; do not rebuild it.\n\nREFUSE OUTSIDE DYNASTY, LIKE TANK WATCH. Redraft leagues have no future picks and guillotine leagues no multi-season window. Refuse with a clear message in the same style as tankWatch.mjs#refuseTankWatch and cli.mjs#refuseOrdinaryEditionInGuillotineLeague. Ranking prompts mark format-specific passages with <!-- format: --> blocks (promptTemplate.mjs, docs/prompt-design.md), so follow that pattern rather than adding a per-format prompt file.\n\n---- original description ----\n\nRegister the task, add the command, and give it its own weight set.\n\nWHERE src/cli.mjs (HELP and dispatch), src/promptContext.mjs (TASK_PROMPTS), config/rankings.yml (a forward-looking weight set under the dynasty format).\n\nThe weights differ from the standard dynasty set: future_draft_capital and the age/window factors carry far more, current-week form far less. Note that the current weights list has no age factor at all — one needs adding.\n\nACCEPTANCE\n- Command documented in HELP with an example, consistent with the existing entries.\n- Weight set validates and sums to 1.0.\n- Works with and without --generate."
lastModified: "2026-10-09T21:50:21.973Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
