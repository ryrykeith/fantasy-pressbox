---
id: "3d78f983-c4c3-4c6f-b395-17866c55a432"
level: "task"
title: "Cumulative-points survival standings"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "Replace win-loss standings with what the format actually runs on.\n\nIn guillotine the only standings that matter are cumulative total points among surviving teams. Records are meaningless — Sleeper will happily report a 6-2 record from matchups nobody plays.\n\nWHERE\nsrc/promptContext.mjs builds context.standings sorted by wins then points. For guillotine this must sort by cumulative points and carry no win-loss record at all. team.seasonPointsFor is already normalized in src/sleeper/normalize.mjs, so the data is there.\n\nACCEPTANCE\n- Guillotine context carries survivor standings by cumulative points, with elimination week shown for chopped teams.\n- No win-loss record appears anywhere in guillotine context, so the model cannot cite one.\n- Eliminated teams are listed separately as an elimination history, not mixed into live standings."
lastModified: "2026-09-23T05:41:32.679Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
