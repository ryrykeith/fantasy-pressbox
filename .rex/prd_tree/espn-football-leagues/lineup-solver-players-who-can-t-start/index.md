---
id: "bd665b91-ee51-4aa9-a8ad-9b9951a1274d"
level: "feature"
title: "Lineup solver: players who can't start"
status: "pending"
priority: "medium"
tags:
  - "sleeper"
  - "lineup"
acceptanceCriteria: []
description: "Whether Sleeper players on IR (reserve) or the taxi squad should be left out of the optimal-lineup solver, as ESPN IR players are since 443e528.\n\nAdded to the ESPN epic at the operator's request (2026-10-13), so it ships in the same PR (feat/espn-football).\n\nToday src/analysis/week.mjs treats every player in a Sleeper week's matchup `players` list as a lineup candidate. If that list includes IR or taxi players, lineup efficiency and potential points can count a player the manager could not have started.\n\nSleeper keeps no roster history, so who was on IR or taxi in a past week is unknown. The solver was validated by reproducing Sleeper's published season potential points (ppts). So the rule must come from a check against a real league, not from reasoning."
lastModified: "2026-10-13T02:12:30.949Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Leave Sleeper IR and taxi players out of the optimal lineup, if the check says so](./leave-sleeper-ir-and-taxi-players-out.md) | blocked |
| [Sleeper reserve and taxi check script (operator runs it)](./sleeper-reserve-and-taxi-check-script.md) | pending |
