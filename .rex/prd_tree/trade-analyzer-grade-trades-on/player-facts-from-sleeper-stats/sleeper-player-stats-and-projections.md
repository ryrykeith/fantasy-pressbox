---
id: "c8669d28-ab5e-4d15-ab5e-fd2a2aa24cb6"
level: "task"
title: "Sleeper player stats and projections, cached per league"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "Stats for a settled week are fetched once and read from disk after"
  - "Projections are saved per week and reused on a re-run"
  - "A response that fails the shape check is reported unavailable, naming the field"
  - "Points follow the league's reception scoring, with a caveat when it is approximated"
  - "An ESPN league reports both unavailable through the capability gate"
  - "docs/sleeper-data.md lists both endpoints as observed, with the fields read"
  - "Tests run on fixtures with no network"
description: "Sleeper serves per-player NFL stats and projections that the league endpoints do not. Probed 2026-10-22: api.sleeper.app/v1/stats/nfl/regular/<season>/<week> and the per-player api.sleeper.app/stats/nfl/player/<id>?season_type=regular&season=<season>&grouping=week return gp, gs, off_snp, tm_off_snp and pts_std / pts_half_ppr / pts_ppr for each week, back through earlier seasons; a bye or a missed game has no stats for that week. api.sleeper.app/v1/projections/nfl/regular/<season>/<week> and the per-player projections endpoint return a projected gp and points for every remaining week. These endpoints are not in Sleeper's documented API: docs/sleeper-data.md must label them as observed, not documented, and the client must shape-check them (as src/espn/shape.mjs does) and report a failure as unavailable, never as zeros. WHAT TO ADD: a client in src/sleeper/ for both, a normalizer to a provider-neutral shape (week, gamesPlayed, gamesStarted, offensiveSnaps, teamOffensiveSnaps, points in the league's reception scoring, choosing pts_std, pts_half_ppr or pts_ppr as src/fantasycalc/client.mjs chooses its ppr, with the same caveat when the league's scoring is none of the three), and a store cache under data/: a settled week's stats are fixed and fetched once; projections are as of their fetch and saved per week like the market (src/storeCore.mjs saveMarketValues), so a re-run reads the same numbers. A provider capability (playerStats, playerProjections) gates it, and ESPN reports both unavailable. Previous-season bye weeks come from the same nflverse source as config/bye-weeks.<season>.yml (scripts/fetch-bye-weeks.mjs) so a bye is never counted as a missed game."
lastModified: "2026-10-22T20:34:03.662Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
