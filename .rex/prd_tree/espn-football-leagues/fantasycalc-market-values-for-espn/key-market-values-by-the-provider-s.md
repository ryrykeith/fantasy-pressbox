---
id: "9635fa99-8c5c-4ed1-941f-1c46b4702235"
level: "task"
title: "Key market values by the provider's player-ID space"
status: "pending"
priority: "medium"
tags:
  - "espn"
  - "fantasycalc"
blockedBy:
  - "f7204756-253f-41a9-b8d3-7d6faf9c156c"
acceptanceCriteria:
  - "A test shows an ESPN player with no espnId entry is unpriced, never matched by name"
  - "Sleeper market output and existing saved snapshots read unchanged"
  - "A snapshot with a mismatched idSpace is fetched again (tested with a fake fetch)"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Price ESPN rosters by joining FantasyCalc on espnId. Part of PR 2 on feat/espn-football.\n\nTODAY\nnormalizeMarketValues (src/fantasycalc/client.mjs:111-140) keys players by player.sleeperId and drops entries without one. FantasyCalc entries also carry espnId; the operator checked this on 2026-10-11.\n\nCHANGE\n- normalizeMarketValues takes the provider's playerIdSpace ('sleeper' or 'espn') and keys players by sleeperId or espnId. Entries without that ID are dropped, as today.\n- readMarketValues (src/pipeline.mjs) passes the league's provider.\n- A saved market snapshot records its idSpace.\n- A saved snapshot with no idSpace reads as 'sleeper'.\n- A saved snapshot whose idSpace doesn't match the league is fetched again, never misread.\n- marketValueQuery is unchanged, except that a keeper league is priced as redraft (isDynasty false) and a declared-dynasty ESPN league as dynasty.\n\nHOUSE RULES\n- Never invent a fact. A player with no matching ID is unpriced, never matched by name.\n- No real league data anywhere.\n- Tests use fixture market data, never the network."
lastModified: "2026-10-12T03:17:13.023Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
