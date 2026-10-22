---
id: "cb8d0364-251e-4174-8189-374fda025e28"
level: "task"
title: "Leave unplayed weeks out of a trade's player history"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A trade report built before the trade week is played shows no points and no started/benched for that week"
  - "Once the week is settled, its points and lineup appear as now"
  - "Tests cover an unplayed, a partly played and a settled trade week"
description: "A trade report built mid-week (the trade cleared Wednesday, the report ran Thursday before kickoff) listed every moved player's current week as 'week 7: <new team>, 0, started/benched'. The week had not been played, so 0 is not a score, and started/benched is only the lineup as it stood, which many managers do not set until Sunday. The model then wrote that every moved player had scored 0 for his new team. playerHistory reads every saved week through the trade week (src/promptContext.mjs, the trade-report block; src/analysis/transactions.mjs). FIX: a week that is not settled (isSettledSnapshot, src/pipeline.mjs) or has no scores is left out of playerHistory, or shown as 'not played yet' with no points and no started/benched; the history notes the last week it covers."
lastModified: "2026-10-22T20:34:42.015Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
