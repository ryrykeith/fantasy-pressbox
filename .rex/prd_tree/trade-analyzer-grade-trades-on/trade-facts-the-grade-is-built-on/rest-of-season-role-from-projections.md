---
id: "7a7b5e05-17b0-4d72-9ead-a77325b47632"
level: "task"
title: "Rest-of-season role from projections"
status: "pending"
priority: "medium"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A player whose weekly projection halves from some week shows the split and the week"
  - "A steady projection shows one rest-of-season figure"
  - "The prompt states projections are expectations and forbids inventing why one changes"
  - "A player whose starts all came while the player above him on today's depth chart was out is marked a contingent backup, naming the weeks"
  - "A contingent backup's fill-in average is never used as his expected weekly output or by the starter solver"
description: "Builds on 'Sleeper player stats and projections, cached per league' and 'Keep Sleeper's depth chart on each player'. A role change ahead is often visible in Sleeper's weekly projections before it shows in points: in the reviewed trade, a WR projected about 8 a week through week 8 was projected about 4 a week from week 9, consistent with a teammate returning. WHAT TO ADD, per moved player: projected points per game for the rest of the regular season, split where the weekly projection changes by more than a configured share (for example 'about 8.2 a week through week 8, about 4.0 from week 9'), plus today's depth chart position. The prompt treats a projected drop as the projector's expectation, not a fact, and does not invent a reason for it. CONTINGENT ROLE (added after a mock run): a player whose starts all came in weeks the player above him on today's depth chart did not play is a fill-in, and his points from those weeks are not his role. Observed: a third-string quarterback started two games while the starter missed three weeks, then went back to the bench when the starter returned, and had no projection after. WHAT TO ADD: for each moved player, the weeks he started and whether every one came while a player listed above him on today's depth chart did not play; if so, role = contingent backup, with the weeks and the reason. His per-game average from those weeks is shown as a fill-in figure, never as his expected weekly output, and the solver in 'Starters from per-game averages and this week's projection' ranks him on his projection (none = 0), not on those games."
lastModified: "2026-10-22T22:42:26.123Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
