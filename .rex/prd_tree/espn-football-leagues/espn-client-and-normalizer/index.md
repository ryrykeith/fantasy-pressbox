---
id: "b35ba60a-c1c7-4821-b52f-4248b0b249af"
level: "feature"
title: "ESPN client and normalizer"
status: "pending"
priority: "high"
tags:
  - "espn"
acceptanceCriteria: []
description: "src/espn/: an HTTP client, shape guards, code tables, and normalizers into the shared League, Team, Player and WeekData shapes; plus the ESPN provider registered in src/providers.mjs.\n\nBuilt against hand-made fixtures with the invented cast. ESPN field names stop at src/espn/. Part of PR 2 on feat/espn-football."
lastModified: "2026-10-12T17:55:45.284Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [An ESPN IR player with no points entry makes his team's lineup efficiency unavailable every week](./an-espn-ir-player-with-no-points-entry.md) | completed |
| [ESPN client and shape guards](./espn-client-and-shape-guards.md) | completed |
| [ESPN code tables](./espn-code-tables.md) | completed |
| [ESPN fetchWeek sends no matchup-period filter, so a full-season schedule response fails guardSchedule](./espn-fetchweek-sends-no-matchup-period.md) | pending |
| [ESPN fixtures and fake fetch](./espn-fixtures-and-fake-fetch.md) | completed |
| [ESPN league, team and player normalizer](./espn-league-team-and-player-normalizer.md) | completed |
| [ESPN week normalizer and provider](./espn-week-normalizer-and-provider.md) | completed |
| [Fix positionFromEligibleSlots: team defenses and IDP positions](./fix-positionfromeligibleslots-team.md) | completed |
| [guardSchedule refuses a whole week when one lineup player has no actual-points stats entry](./guardschedule-refuses-a-whole-week.md) | completed |
| [guardTeams requires teams[].waiverRank in every league, a field the doc says may be spelled wavierRank](./guardteams-requires-teams-waiverrank.md) | completed |
| [One NFL team alias module](./one-nfl-team-alias-module.md) | completed |
| [Transaction, roster-window and released-pool analysis turn an ESPN player's missing points into 0](./transaction-roster-window-and-released.md) | pending |
