---
id: "a561550d-8ea6-4443-81b4-2923adf8c167"
level: "epic"
title: "Trade analyzer: grade trades on availability, role, age and intent"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
description: "An operator review of a dynasty trade report on 2026-10-22 found the grades followed the FantasyCalc totals almost alone. A 2-4 team below the playoff line sold three veteran starters (a 31-year-old TE who missed two of six games, a 29-year-old RB, a 28-year-old WR whose role Sleeper projects to halve after week 8) for younger depth and a contender's 2028 1st. The contender got an A- although none of the three entered its lineup, because prompts/trade-report.md makes the market 'the anchor' and hands the model summed totals. The values themselves were correct (FantasyCalc dynasty, superflex, 12 teams, half-PPR). What was missing: availability (games played and snap share, not points per rostered week, which counts missed games as 0), role (this week's projection, rest-of-season projections, depth chart), each player's stage on the position's age curve (config/rankings.yml age_curves, already used by five-year-plan), whether a side looks like it is tanking for a better pick, and grading guidance that weighs those against the market. Related bug filed separately: 'Trade report blames a missing draft rule when only later-year picks moved' (b6fdfc96). Examples in this epic are described generically: the repo is public and carries no real league's names."
lastModified: "2026-10-22T20:33:42.181Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Player facts from Sleeper: stats, projections and role](./player-facts-from-sleeper-stats/index.md) | pending |
| [Trade facts the grade is built on](./trade-facts-the-grade-is-built-on/index.md) | pending |
| [Grading guidance](./grading-guidance/index.md) | pending |
