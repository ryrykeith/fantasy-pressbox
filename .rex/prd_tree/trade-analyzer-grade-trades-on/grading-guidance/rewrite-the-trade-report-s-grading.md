---
id: "7746daf2-9b40-45d2-baef-bff1f29e6f92"
level: "task"
title: "Rewrite the trade report's grading guidance"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "The prompt no longer calls the market the anchor and orders fit, availability, age stage and tank signal against it"
  - "A trade that changes no starter for a contender is described to the model as a depth move"
  - "The prompt ties the letter gap to the verdict"
  - "A fixture with an invented cast reproduces the reviewed trade and its context carries every new fact"
  - "The redraft and guillotine branches of the prompt are unchanged except where a new fact applies to them"
description: "Builds on every task in 'Trade facts the grade is built on'. prompts/trade-report.md calls marketValues 'the anchor' and lists value, fit, window and age with no order between them, and age is 'opinion'. In the reviewed trade the model noted that none of a contender's three new players would start, then gave it an A- on the market total, and called the verdict narrow while grading A- against B-. WHAT TO CHANGE: market value is one input, quoted with its best-single-asset context, not the anchor. Fit comes first for a contending side: a trade that changes no projected starter is a depth move, worth what that depth covers (availability of the starters it backs up), not its market total. Age-curve stage and availability weigh on the side taking on older or less available players, more so when it gave up picks. A side carrying a tankSignal is graded on draft position and future value, not this season's points. Follow editorial.rankingPreset (win-now or rebuild) where the league declares one. The letter gap between the two sides matches the verdict: a narrow win is at most one letter apart, and the verdict post names the fact that decided it. Keep the existing rules (cite only context, credit line, rivals framing). Add a test fixture in tests/fixtures with an invented cast (no real league's names): a 2-4 team below the line selling a 31-year-old TE with two missed games, a 29-year-old RB and a WR projected to lose his role, for younger depth and a contender's 1st, and assert on the context the prompt receives (stages, availability, tank signal, unchanged contender lineup), not on model output."
lastModified: "2026-10-22T20:34:58.869Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
