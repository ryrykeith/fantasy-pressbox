---
id: "6bb15567-7681-4e1f-959a-5c611ed32069"
level: "task"
title: "Compute a team strength rating"
status: "completed"
priority: "high"
blockedBy:
  - "2d8f1346-a499-4d62-b21e-e7e3a56a5af2"
startedAt: "2026-10-15T17:16:26.756Z"
completedAt: "2026-10-15T17:31:17.626Z"
endedAt: "2026-10-15T17:31:17.626Z"
resolutionType: "code-change"
resolutionDetail: "src/analysis/strength.mjs computes a 0-100 strength rating per team from lineup, depth, market_value, age_window and draft_capital, scored by league rank. Weights per preset are in config/rankings.yml. The rating is wired through readStrength and prepareEdition into buildContext for the rankings and future-stock editions. Commit 475db34; 1208 tests pass."
acceptanceCriteria:
  - "src/analysis/strength.mjs (no node: imports) rates every team 0-100 relative to its league from components lineup, depth, market_value, age_window and draft_capital, each with its own value and league rank"
  - "A component the league cannot supply is listed in strength.unavailable with its reason, the remaining weights are rescaled to 1.0, and the context says so; nothing counts as 0"
  - "Weights strength.dynasty and strength.redraft live in config/rankings.yml, are chosen by the preset, sum to 1.0 and are validated like the ranking weights; guillotine leagues get no strength rating"
  - "The weekly, preseason and postseason rankings contexts and the future stock context carry the rating; tests cover a Sleeper dynasty league, a redraft league, a preseason (no settled weeks) and an ESPN league (no draft capital)"
  - "The same saved data always gives the same rating (pure, deterministic; a test pins one league's ratings)"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 4. The rankings are written by the model under weights; the strength rating is a number the CODE computes from facts, reproducible and checkable. Components: lineup = optimal-lineup points over the last N settled weeks (src/analysis/lineup.mjs bestLineup; choose N, default in config); depth = bench strength the solver would start on a short week (define precisely and document); market_value = FantasyCalc roster value when priced (readMarketValues); age_window = points-weighted starter age against position (src/analysis/rosterWindow.mjs), dynasty only; draft_capital = priced future picks (src/analysis/pickCapital.mjs), dynasty on Sleeper only. Scale each component by league rank/percentile so the rating is relative; document the formula in docs/editorial-model.md. Wire it through prepareEdition (src/edition.mjs) into buildContext (src/promptContext.mjs); tests/cli-context-inputs.test.mjs must still pass."
lastModified: "2026-10-15T17:31:17.654Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
