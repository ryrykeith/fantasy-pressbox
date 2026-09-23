---
id: "98a63c11-622a-4c0e-8795-8455cc897d6e"
level: "task"
title: "Strip matchup-shaped facts from guillotine context"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "Even in the guillotine editions, the context builder must not hand the model matchup data it could accidentally cite.\n\nWHY\nSleeper still returns matchup pairings for a guillotine league, pairMatchups in src/sleeper/normalize.mjs will still pair them, and analyzeWeek will still compute winner, loser, margin, opponent and result for every team. If any of that reaches the JSON context block, the model will use it — the prompt tells it the JSON is authoritative, so a fabricated-looking matchup is exactly the kind of false fact this project exists to prevent.\n\nWHAT\n- In guillotine mode, analyzeWeek produces per-team scoring facts with no opponent, result or margin fields.\n- buildContext emits no thisWeek.games, no upcomingMatchups, no unpairedTeams.\n- describeMissingContext in src/promptContext.mjs gains an entry stating that this league has no matchups and instructing the model never to describe one — consistent with how that function already turns absence into an explicit instruction.\n\nACCEPTANCE\n- A guillotine context JSON contains no opponent, winner, loser, margin or matchupId anywhere.\n- The unavailable list explicitly names matchups as a non-concept for this league.\n- A test asserts the absence, so a future refactor cannot quietly reintroduce the fields."
lastModified: "2026-09-23T05:41:37.426Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
