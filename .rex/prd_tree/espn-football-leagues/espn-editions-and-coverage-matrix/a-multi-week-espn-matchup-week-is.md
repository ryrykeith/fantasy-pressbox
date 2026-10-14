---
id: "66f040dc-8613-4d8e-9217-82e820e58df2"
level: "task"
title: "A multi-week ESPN matchup week is analyzed as every team scoring 0 by rankings, record and transactions"
status: "completed"
priority: "high"
tags:
  - "ndx-adversarial-review"
  - "severity:high"
  - "espn"
source: "ndx-adversarial-review"
startedAt: "2026-10-13T02:35:06.878Z"
completedAt: "2026-10-13T02:41:44.608Z"
endedAt: "2026-10-13T02:41:44.608Z"
acceptanceCriteria:
  - "captureWeek on the MULTI_WEEK_LEAGUE_ID fixture week 4 saves no analysis with 0-point teams (a test asserts no teamWeeks entry has points 0 drawn from a null score)"
  - "Every edition that reads the week's analysis refuses a multi-week ESPN week, naming the reason (one test per edition)"
  - "Sleeper captureWeek output is unchanged on the existing fixtures"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Verdict: should-fix (found by the adversarial review of b19b5d2b, ESPN week normalizer).\n\nScenario: an ESPN league whose matchup period 4 covers scoring periods 4 and 5 (the MULTI_WEEK_LEAGUE_ID fixture). src/espn/normalize.mjs normalizeWeek marks the week with multiWeekMatchup and sets every roster's points and pairingKey to null. But src/pipeline.mjs captureWeek still calls analyzeWeek on those rosters, and src/analysis/week.mjs reads a null roster score as 0 (`roster.points ?? 0`, the Sleeper rule). The saved snapshot and the analysis then hold every team at 0 points, unpaired, with awards such as teamOfTheWeek at 0. Task 4ed5e1ab (capability gates) refuses only preview and recap for such a week. rankings, record, transactions and grade all go through captureWeek and would build context from those zeros.\n\nReachable: LEAGUE_PROVIDER=espn is accepted at config load since b19b5d2b, so any command that captures a multi-week week on ESPN gets there.\n\nOptions:\n1. (Recommended) captureWeek checks weekData.multiWeekMatchup. It skips analyzeWeek and saves no snapshot analysis for that week, and the editions that need the week's scores refuse, naming the reason. Cost: one branch plus refusal wording. Risk: low, because Sleeper never sets the marker.\n2. Fold this into 4ed5e1ab by widening its refusal list to every edition that reads weekAnalysis. Cost: same. Risk: the item grows."
lastModified: "2026-10-13T02:41:44.662Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
