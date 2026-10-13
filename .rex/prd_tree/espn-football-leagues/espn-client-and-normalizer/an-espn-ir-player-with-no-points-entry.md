---
id: "f516706b-aa4a-4bac-987e-7c19241806b9"
level: "task"
title: "An ESPN IR player with no points entry makes his team's lineup efficiency unavailable every week"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "An ESPN fixture week where an IR-slot player has no stats entry still reports lineupEfficiency for his team (test)"
  - "The decision on IR players is recorded in docs/espn-data.md open question 32"
  - "Sleeper analyzeWeek output is unchanged on the existing fixtures"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: should-fix. It needs an operator decision (found by the adversarial review of b19b5d2b).\n\nScenario: in an ESPN week, a player in lineup slot 21 (IR) has no statSourceId 0 stats entry. That is plausible every week for an injured player (open question 32). src/espn/normalize.mjs weekRoster puts him in noPointsIds, because IR players are in playerIds. src/analysis/week.mjs then treats him as a bench candidate, and optimalLineup returns null because he is not on a bye. As a result, his team's potentialPoints, lineupEfficiency and optimalLineup are dropped for the week. In leagues with IR slots, that could be most teams in most weeks, which removes a core recap fact. Nothing wrong is printed (the failure is conservative), but the feature degrades.\n\nThe operator decision of 2026-10-12 named \"starter or bench\", not IR. An ESPN IR player cannot be put into a lineup without leaving IR, so arguably he is not a lineup candidate at all.\n\nOptions:\n1. (Recommended, needs operator sign-off) Carry reserveIds on ESPN WeekData rosters. week.mjs excludes reserve players from optimal-lineup candidates, and a missing entry for a reserve player no longer blocks efficiency. Cost: small. Risk: Sleeper's analyzeWeek also includes reserve players as candidates today, so the change must apply to ESPN rosters only, or be decided for both.\n2. Leave it as is, and record in docs/espn-data.md that IR players without entries block efficiency."
lastModified: "2026-10-13T00:06:08.520Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
