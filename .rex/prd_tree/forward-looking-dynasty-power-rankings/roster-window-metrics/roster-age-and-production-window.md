---
id: "fefb9782-3333-4b6d-8f68-6c5febb46d2e"
level: "task"
title: "Roster age and production-window aggregates"
status: "completed"
priority: "medium"
startedAt: "2026-10-09T21:01:30.535Z"
completedAt: "2026-10-09T21:03:27.034Z"
endedAt: "2026-10-09T21:03:27.034Z"
resolutionType: "code-change"
resolutionDetail: "New src/analysis/rosterWindow.mjs plus readRosterWindow in pipeline; commit db81404."
acceptanceCriteria: []
description: "Compute per-team age structure from the player records already normalized.\n\nWHAT\n- Age distribution across the roster, weighted toward players who actually start — a 34-year-old on the bench is not the same problem as a 34-year-old in the starting lineup, and league.startingSlots plus the starter IDs make that distinction available.\n- Position-aware age: running backs age out years before quarterbacks and tight ends, so a single mean age across the roster is close to meaningless. Produce per-position age summaries.\n- Production concentration by age band: how much of the team's season points to date came from players over and under a given age. This is the number that separates 'old and winning' from 'young and winning' without projecting anything.\n\nACCEPTANCE\n- Per-team, per-position age summaries plus the production-by-age-band split.\n- All values derive from data already fetched; no new external source."
lastModified: "2026-10-09T21:03:27.047Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
