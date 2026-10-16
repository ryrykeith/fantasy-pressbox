---
id: "e25b88e5-da83-4ceb-87e5-3e8e45ccf0eb"
level: "task"
title: "Head-to-head record counts a pre-0.1.0 snapshot with no settled flag as a finished week"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "A snapshot with no `settled` key, in the current season, past league.lastScoredWeek, gives no meeting and is not in `covered`"
  - "The rule for unflagged snapshots in earlier seasons is decided and covered by a test in tests/rivalry-record.test.mjs"
  - "A snapshot with `settled: true` still counts exactly as today"
description: "Verdict: should-fix (adversarial review of task 5902709a, severity medium).\n\nScenario: a league folder holds snapshots written before commit 0f89be4 (the `settled` flag, which shipped in 0.1.0). One of them was captured mid-week (Thursday's game scored, the rest not), so it has `played: true` and no `settled` key. src/analysis/rivalry.mjs `isResult` (`snapshot.settled !== false && snapshot.played !== false && analysis`) counts it, so a partial score becomes a meeting: a wrong W/L, total points, last meeting or biggest margin printed as fact. That breaks the rule \"never invent a fact\".\n\nReachable: once the sibling task wires headToHead into the preview and recap, any league folder with pre-0.1.0 data (the operator's own league predates 0.1.0). pipeline.mjs `isSettledSnapshot` has a fallback for unflagged snapshots (played, and week <= league.lastScoredWeek), but it only applies to the current season and rivalry.mjs does not use it.\n\nOptions:\n1. (Recommended) Pass the league's lastScoredWeek and season in. An unflagged snapshot counts in the current season only when week <= lastScoredWeek, the same rule as isSettledSnapshot. In an earlier season it counts only when a later snapshot of that season exists, since that week was certainly over by then. Cheap, and consistent with the pipeline.\n2. Count only `settled === true`, and name the unflagged weeks as not covered (\"saved before results were final\"). The strictest option, but it drops legacy history that is very likely correct.\nWhich to pick is the owner's call: legacy coverage versus strictness."
lastModified: "2026-10-16T19:15:35.804Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
