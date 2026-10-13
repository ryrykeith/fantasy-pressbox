---
id: "863e1a94-3b79-48a4-9f21-b96cc0457a45"
level: "task"
title: "Transaction, roster-window and released-pool analysis turn an ESPN player's missing points into 0"
status: "pending"
priority: "high"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "A trade report on ESPN fixtures where a moved player has no points entry that week never shows 0 points for that week (test)"
  - "pointsPerGame excludes or flags a week with no points entry rather than counting it as 0"
  - "Sleeper transaction context is unchanged on existing fixtures"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Verdict: should-fix (found by the adversarial review of b19b5d2b).\n\nScenario: an ESPN WeekData roster lists a player in noPointsIds, so his key is absent from playerPoints. src/analysis/week.mjs now keeps him unknown, but other readers still default the absent value to 0:\n- src/analysis/transactions.mjs:42 (pointsPerGame) and :210 (playerHistory, which prints \"points: 0\" for that week in a trade or waiver grade);\n- src/analysis/rosterWindow.mjs:115;\n- src/analysis/faab.mjs:105 (releasedPool).\n\nA traded player with no entry in a week then shows as scoring 0 for the receiving team in the trade report. That is a made-up fact, because the operator decision is that a missing entry is never 0 by default. The roster window (future stock) and the released pool (guillotine) feed editions ESPN refuses, so the transaction report is the path that matters.\n\nOptions:\n1. (Recommended) playerHistory reports points: null with onBye from byeIds, and pointsPerGame skips weeks with no value (or reports the count of weeks with unknown points). Cost: small; the decision is how a missing week counts in points per game. Risk: low, because Sleeper rosters carry no noPointsIds.\n2. Mark trade-history facts unavailable for ESPN in task 4ed5e1ab."
lastModified: "2026-10-13T00:06:08.454Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
