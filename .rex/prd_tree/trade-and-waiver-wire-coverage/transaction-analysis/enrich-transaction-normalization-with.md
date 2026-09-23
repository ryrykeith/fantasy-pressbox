---
id: "b2be6fc5-5174-4094-97c1-95c45ad7ae32"
level: "task"
title: "Enrich transaction normalization with roster and need context"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "normalizeTransactions currently emits { type, week, teams, bid, moves[] } where moves are formatted strings like 'Team A gets Josh Allen (QB, BUF, age 29)'. A grade needs structure, not sentences.\n\nWHAT TO ADD\n- Keep the human-readable strings (the existing incidental use depends on them) but add a structured side: per-transaction, per-team, what was received and what was given up, as player references rather than prose.\n- Attach the acquiring team's positional shape before and after the move: starting slot requirements come from league.startingSlots, and the roster is on the team record. A WR added to a team already starting three good WRs is a different move from the same WR filling a hole.\n- Attach the scoring profile context from the format engine epic, so a TE acquired in a TE-premium league is graded on the right scale.\n- For waiver claims, attach the winning bid AND the acquiring team's remaining FAAB, so the cost can be judged as a share of budget rather than as a raw number.\n\nACCEPTANCE\n- Each transaction carries enough structure for a model to say who won it and why, without the model inventing roster context.\n- Existing consumers of the moves strings keep working unchanged."
lastModified: "2026-09-23T05:43:07.622Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
