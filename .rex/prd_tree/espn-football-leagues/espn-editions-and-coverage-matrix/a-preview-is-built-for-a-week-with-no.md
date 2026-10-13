---
id: "e3f80be6-d3e4-4150-b0f5-87a943fecdc8"
level: "task"
title: "A preview is built for a week with no pairings, handing the model an edition about no games"
status: "completed"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
  - "editions"
source: "ndx-adversarial-review"
startedAt: "2026-10-13T23:04:53.521Z"
completedAt: "2026-10-13T23:06:56.262Z"
endedAt: "2026-10-13T23:06:56.262Z"
acceptanceCriteria:
  - "buildPrompt throws for a preview in a head-to-head league whose context has an empty upcomingMatchups list, naming the week"
  - "`preview --week N` for a week with no schedule entries exits non-zero and writes no prompt file"
  - "A test covers the refusal on an ESPN fixture week with no schedule entries; existing Sleeper preview tests still pass"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: out-of-scope (pre-existing; seen while reviewing task f605d547). Severity medium.\n\nScenario: `preview --week N` on an ESPN league whose schedule has no matchup entries for week N's matchup period. Before task f605d547 the fixture had no week 5, so the fetch route returned only period-4 entries for scoringPeriodId=5, and the preview built with `\"upcomingMatchups\": []` and exited 0. A real league can produce the same thing for a week past the schedule or a playoff period ESPN does not list. The prompt asks for a preview of games and the context lists none, which invites the model to invent pairings.\n\nEvidence: src/promptContext.mjs:1052 sets `context.upcomingMatchups = upcomingAnalysis.games.map(...)` with no empty check. buildPrompt (src/promptContext.mjs, around 1811-1829) refuses a trade-report with no trades and a waiver-report with no pickups, but has no equivalent refusal for a preview with no games. The CLI path is src/cli.mjs commandEdition, preview branch.\n\nReachability: the `preview` command on the fetch or import route, for a week whose matchup period has no schedule entries. Sleeper can reach it too, if a week returns no matchups.\n\nOptions:\n1. (Recommended) In buildPrompt, refuse a preview whose head-to-head format has zero upcoming matchups, naming the week, alongside the trade/waiver guards. Cheap, provider-neutral, one test.\n2. Refuse earlier in commandEdition once the capture shows no games. This makes no prompt file at all, but leaves other callers of buildPrompt unguarded."
lastModified: "2026-10-13T23:06:56.282Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
