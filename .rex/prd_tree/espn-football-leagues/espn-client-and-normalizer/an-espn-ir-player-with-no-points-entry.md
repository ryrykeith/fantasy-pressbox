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
  - "An ESPN fixture week where an IR-slot player has no stats entry still reports lineupEfficiency for his team, computed without him (test)"
  - "An IR-slot player who does have points is still excluded from the optimal lineup on ESPN (test)"
  - "The decision is recorded in docs/espn-data.md (open question 32 and 'Rosters and lineups')"
  - "Sleeper analyzeWeek output is unchanged on the existing fixtures"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13): operator decision, option 1\nIR players are not lineup candidates on ESPN: a manager can't start a player sitting in the IR slot. Do this:\n- Carry reserveIds (players in lineup slot 21, IR) on ESPN WeekData rosters.\n- src/analysis/week.mjs leaves reserve players out of the optimal-lineup candidates when the roster carries reserveIds, so a reserve player with no points entry no longer blocks lineup efficiency.\n- Apply this to ESPN rosters ONLY. Sleeper's WeekData doesn't carry reserveIds today, and Sleeper output must stay byte-identical. Whether Sleeper should do the same is a separate question, outside this epic: Sleeper's solver was validated against Sleeper's own published potential points (ppts), so changing it needs that check re-run.\n- Record the decision in docs/espn-data.md, at open question 32 and under 'Rosters and lineups'.\n\nVerdict: should-fix (found by the adversarial review of b19b5d2b).\n\nScenario: in an ESPN week, a player in lineup slot 21 (IR) has no statSourceId 0 stats entry. That is plausible every week for an injured player (open question 32). src/espn/normalize.mjs weekRoster puts him in noPointsIds, because IR players are in playerIds. src/analysis/week.mjs then treats him as a bench candidate, and optimalLineup returns null because he is not on a bye. As a result, his team's potentialPoints, lineupEfficiency and optimalLineup are dropped for the week. In leagues with IR slots, that could be most teams in most weeks, which removes a core recap fact.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-13T02:03:57.957Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
