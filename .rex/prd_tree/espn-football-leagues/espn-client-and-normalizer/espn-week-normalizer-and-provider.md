---
id: "b19b5d2b-6756-4289-a080-47e22661ef23"
level: "task"
title: "ESPN week normalizer and provider"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "providers"
blockedBy:
  - "f7204756-253f-41a9-b8d3-7d6faf9c156c"
acceptanceCriteria:
  - "analyzeWeek on the ESPN fixtures produces correct games, lineup efficiency and awards"
  - "A FAAB claim, a trade and a drop normalize to the same shapes as their Sleeper equivalents; rolling-waiver claims carry no bid"
  - "A multi-week matchup period is marked, not split"
  - "ESPN is registered in src/providers.mjs and tests/provider-boundary.test.mjs passes with ESPN field names confined to src/espn/"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-12)\nPR 1 merged (#7, 72546f1), and the provider interface it built differs slightly from the plan. Match src/sleeper/provider.mjs, not the plan's sketch:\n- The descriptor has fromConfig(config) and also forClient(client, { config, league }). The pipeline uses forClient (src/providers.mjs providerInstance) to wrap an existing client, and tests use it for fake clients. The ESPN provider needs both.\n- lookupLeague takes { id, declaredFormatType } and reaches no secrets. ESPN needs { id, season, secrets, declaredFormatType } for a private league. Extend the ESPN signature, and check that setup's call site (setup.mjs, through the provider) passes them. Sleeper ignores the extra keys.\n- LEAGUE_PROVIDER is validated against PROVIDER_NAMES in src/providers.mjs. Until ESPN is registered there, LEAGUE_PROVIDER=espn is refused at config load. Registering it is part of this task.\n- hasEliminations and hasFutureDraftCapital in src/format.mjs already take (format, capabilities).\n\nTurn a saved ESPN week into WeekData, and register ESPN as a provider. Part of PR 2 on feat/espn-football.\n\nnormalizeWeek(rawBundle, { league, teams, players }) returns WeekData (docs/plans/espn-football.md §6):\n- rosters: starterIds lined up with league.startingSlots, with null for an empty slot; per-player and team points; and a pairingKey from the matchup;\n- transactions: in the shared moves and sides shape that src/sleeper/ produces, so a trade, a claim and a drop look the same to src/analysis/transactions.mjs;\n- bids: only for FAAB claims. Under rolling waivers there are no bids, so nothing is made up.\n\nA matchup period spanning more than one NFL week is marked on the WeekData, so preview and recap can refuse it. It is never split or summed into one week.\n\nPROVIDER (src/espn/provider.mjs)\n- capabilities: futurePicks false, taxi false, guillotine false;\n- lastScoredWeek: per plan risk R6. Use ESPN's own 'last scored' value if docs/espn-data.md documents one. Otherwise a week counts as settled once ESPN's current scoring period is past it, and the doc says so. Never settle a week still being played;\n- playerIdSpace 'espn', experimental true;\n- register it in src/providers.mjs.\n\nRaw responses are saved by captureWeek tagged with provider 'espn'.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- ESPN field names stay inside src/espn/ (the provider boundary test enforces this)."
lastModified: "2026-10-12T05:15:23.815Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
