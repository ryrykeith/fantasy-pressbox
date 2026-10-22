---
id: "3506983f-cdeb-426a-bf0e-1a5c8ea7d162"
level: "task"
title: "Starters from per-game averages and this week's projection"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "The solver ranks on the configured blend of per-game average and this week's projection"
  - "A player who missed games is not dragged down by zeros for those weeks"
  - "A player on bye that week is marked and ranked on his per-game average"
  - "Without projections the basis falls back and valueBasis says so"
  - "Changing the literal Sleeper lineup does not change startsAfter or startedBefore"
description: "Builds on 'Sleeper player stats and projections, cached per league' and 'Availability: games played and snap share over two seasons'. Whether a moved player starts (startsAfter, startedBefore, startersBefore/After) comes from the lineup solver over points per rostered game (positionalShape and sideRoster, src/analysis/transactions.mjs). That is right not to use the literal Sleeper lineup, which managers often set only on Saturday or Sunday, but its value per player counts missed games as 0 and ignores the coming week. WHAT TO CHANGE: the value the solver ranks on blends this season's points per game played with the player's projection for the week the trade lands in (the next unplayed week), with the blend set in config (a trade block in config/rankings.yml, for example per_game_weight and projection_weight, defaulting to equal) and named in valueBasis. A player on a bye or projected not to play that week is ranked on his per-game average and marked as such. Each starter line shows both numbers (for example 'TE <name> 9.6/g, proj 9.3'). Without projections (ESPN, or a failed fetch) it falls back to per-game average and says so. The literal lineup is never used for starts."
lastModified: "2026-10-22T20:34:43.204Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
