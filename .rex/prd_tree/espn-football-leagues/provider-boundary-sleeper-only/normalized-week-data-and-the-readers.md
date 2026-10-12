---
id: "f49ef93c-9c9b-4217-923d-139c0f0ae55c"
level: "task"
title: "Normalized week data and the readers of saved weeks"
status: "completed"
priority: "high"
tags:
  - "providers"
  - "refactor"
blockedBy:
  - "8679cf98-a4c2-4529-84f4-c327eff08149"
startedAt: "2026-10-12T04:12:59.210Z"
completedAt: "2026-10-12T04:27:04.702Z"
endedAt: "2026-10-12T04:27:04.702Z"
acceptanceCriteria:
  - "No module outside src/sleeper/ reads roster_id, matchup_id, players_points, starters_points, waiver_bid, adds, drops or the '0' empty-slot marker"
  - "analyzeWeek output is unchanged on the existing fixtures, including unpairedRosterIds and the guillotine no-pairing path"
  - "A raw bundle with no provider field, as written before this change, reads exactly as before (fixture test)"
  - "The 671 existing tests pass, with only import-path changes"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Make analysis read a provider-neutral week instead of raw Sleeper matchups and transactions.\n\nTODAY\ncaptureWeek (src/pipeline.mjs:432) saves raw Sleeper matchups and transactions under data/raw/. Analysis then reads raw Sleeper fields:\n- src/analysis/week.mjs:18-20 reads players_points, starters and starters_points. Line 28 uses Sleeper's empty-slot marker '0'. Lines :130 and :139 read roster_id.\n- pairMatchups returns raw: side.\n- src/analysis/faab.mjs:86, :99 (releasedPool) and :179-182 (weekBids) read roster_id, players_points, settings.waiver_bid, leg and adds.\n- In src/pipeline.mjs, readTransactions (:186-207), readRosterWindow (:360), readFaabMarket (:169) and readSettledWeek (:404) re-parse the saved raw bundles as Sleeper.\n\nCHANGE\nAdd `normalizeWeek(rawBundle, { league, teams, players })` to src/sleeper/normalize.mjs, returning WeekData:\n- rosters: `[{ rosterId, playerIds, starterIds (lined up with league.startingSlots; null for an empty slot), starterPoints, playerPoints, points, pairingKey }]`\n- transactions: today's normalizeTransactions output, with moves and sides\n- bids: `[{ playerId, rosterId, week, amount, outcome }]`. This covers what weekBids and waiverBidsFor read today, including failed bids.\n\nThen:\n- Move pairing on pairingKey into src/league/pairing.mjs. A null key, or a key with other than two sides, stays unpaired as today.\n- analyzeWeek, releasedPool, weekBids and the four readers consume WeekData.\n\nRaw bundles are still saved exactly as fetched. Do not rewrite data/raw/ or any settled snapshot (isSettledSnapshot).\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere. Use the invented cast in tests/fixtures/mock-dynasty-league.mjs.\n- No behaviour change for Sleeper.\n\nPlan: docs/plans/espn-football.md §6."
lastModified: "2026-10-12T04:27:04.727Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
