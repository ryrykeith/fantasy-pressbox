---
id: "aa7ebbb8-cb04-44b2-9b4a-c9c8244420f1"
level: "task"
title: "ESPN fetchWeek sends no matchup-period filter, so a full-season schedule response fails guardSchedule"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "Option 1: guardSchedule's per-entry lineup check runs only on schedule entries in the requested week's matchup period; entries for other periods are not required to carry rosterForCurrentScoringPeriod"
  - "A fixture returning the whole season's schedule, with lineups only in the requested period, normalizes the week without EspnShapeError"
  - "An entry in the requested period that lacks its lineup still throws EspnShapeError naming the path"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: should-fix (found by the adversarial review of b19b5d2b).\n\nScenario: src/espn/provider.mjs fetchWeek requests view=mMatchupScore&view=mScoreboard&view=mSettings&scoringPeriodId=N without an x-fantasy-filter. espn-api restricts the schedule to one matchup period with that header (docs/espn-data.md: espn-api football/league.py:364). If ESPN then returns the whole season's schedule[], entries for other matchup periods likely lack rosterForCurrentScoringPeriod. guardSchedule(body, { week }) requires that field on every entry, so every ESPN week capture would throw EspnShapeError. normalizeWeek already filters entries by matchupPeriodId, but only after the guard has run on all of them.\n\nReachable only against a live league; no test league exists, and the fixture returns one period. The failure is loud, not a wrong fact.\n\nOptions:\n1. Guard only the schedule entries in the week's matchup period (filter before guardSchedule's per-entry lineup check). Cost: small, a guard variant. Risk: low.\n2. Add header support to client.league and send {\"schedule\":{\"filterMatchupPeriodIds\":{\"value\":[p]}}} as espn-api does. Cost: client change plus fake-fetch support. Risk: the filter's shape is assumed.\n3. Wait for the test-league check (b68a41d0) to show the response shape.\nRecommended: option 1, because it is correct whichever way the response turns out."
lastModified: "2026-10-13T00:06:08.584Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
