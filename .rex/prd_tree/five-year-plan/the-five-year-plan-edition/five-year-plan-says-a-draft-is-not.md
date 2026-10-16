---
id: "f71d68d6-f332-4c92-8f01-b604218965e7"
level: "task"
title: "Five-year plan says a draft is 'not issued yet' when it is only untraded and unpriced"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "With no market and no trades beyond the next draft, a later plan season's picks are unavailable with a reason that does not assert the draft is not issued (test in tests/five-year-plan.test.mjs)"
  - "'not issued yet' is emitted only for a season known not to be issued, and a test pins which seasons that covers"
  - "docs/plans/football-settings-rivalries-five-year-plan.md section 6 and the architecture.md row describe the rule as implemented"
description: "Verdict: should-fix (medium). Found by the adversarial review of cd725331 (run 1640c247).\n\nFailure: src/analysis/fiveYearPlan.mjs picksBySeason infers which drafts are issued from pickCapital.seasons, which pickCapitalSeasons builds from traded seasons, priced seasons and the next draft. Nothing reads which seasons Sleeper actually issues. Scenario: a dynasty league, 2026 rookie draft held. The week's FantasyCalc fetch failed (market { unavailable }), and no 2028 pick has been traded. pickCapital.seasons is ['2027'], so 2028, 2029 and 2030 all come out as { unavailable: 'not issued yet' }. In fact Sleeper has already issued 2028 picks (they can be traded), and the edition's model is told as a fact that they don't exist. This breaks the never-invent-a-fact rule: the true state is \"not known\", not \"not issued\". With a working market, FantasyCalc prices about three drafts, so the most common case reads correctly.\n\nReachable: through the five-year-plan edition (sibling task the-five-year-plan-edition-and-team) once it is wired, on any market outage or league without priced future seasons. Not reachable yet: no command calls buildFiveYearPlan.\n\nOptions:\n1. (Recommended) Use two reasons. Keep 'not issued yet' only where it is known, for example a season beyond a horizon Sleeper documents or a league setting. Otherwise say \"no pick of this draft has been traded or priced, so whether it is issued is not known\". Cheap; a change to the string and a test.\n2. Find out whether Sleeper's API exposes the issued-seasons horizon (league settings / draft endpoints) and read it in src/sleeper/normalize.mjs. More work: it needs a provider capability, and ESPN would be unavailable anyway.\nRisk of either: the edition prompt must quote the reason, so its wording changes with the reason."
lastModified: "2026-10-16T19:42:36.570Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
