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
lastModified: "2026-10-12T03:14:01.544Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [ESPN client and shape guards](./espn-client-and-shape-guards.md) | pending |
| [ESPN code tables](./espn-code-tables.md) | completed |
| [ESPN fixtures and fake fetch](./espn-fixtures-and-fake-fetch.md) | pending |
| [ESPN league, team and player normalizer](./espn-league-team-and-player-normalizer.md) | pending |
| [ESPN week normalizer and provider](./espn-week-normalizer-and-provider.md) | pending |
| [One NFL team alias module](./one-nfl-team-alias-module.md) | completed |
| [positionFromEligibleSlots refuses every D/ST player (slot name "D/ST" contains '/')](./positionfromeligibleslots-refuses.md) | pending |
| [positionFromEligibleSlots throws for IDP players whose first slot is DT/DE/CB/S, which can break non-IDP leagues](./positionfromeligibleslots-throws-for.md) | pending |
