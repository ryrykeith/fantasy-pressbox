---
id: "e212ce29-9f37-429f-bccb-e15699bff3c8"
level: "task"
title: "Keep Sleeper's depth chart on each player"
status: "pending"
priority: "medium"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A Sleeper player with depth chart fields carries depthChart; one without carries null"
  - "The trade report shows each moved player's depth chart position, labelled as today's"
description: "Sleeper's player list (already downloaded and cached as data/cache/players-nfl.json) carries depth_chart_position and depth_chart_order for each player, for example a slot receiver listed second (SWR 2) or a quarterback third (QB 3). normalizePlayers (src/sleeper/normalize.mjs) keeps yearsExp and injuryStatus but drops both depth fields. WHAT TO ADD: keep them on the normalized player as depthChart { position, order } (null when Sleeper has none; ESPN null), and describe them in the player line the trade report reads (for example 'SWR 2 on the depth chart'). They are today's chart, not the chart at the time of the trade: say so where they are shown."
lastModified: "2026-10-22T20:34:04.253Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
