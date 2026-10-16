---
id: "5902709a-b876-4f7f-9d49-cb616dba9ba9"
level: "task"
title: "Head-to-head record from saved history"
status: "completed"
priority: "high"
startedAt: "2026-10-16T19:08:14.361Z"
completedAt: "2026-10-16T19:16:29.914Z"
endedAt: "2026-10-16T19:16:29.914Z"
resolutionType: "code-change"
resolutionDetail: "New pure src/analysis/rivalry.mjs (readSavedSeasons + headToHead) reading saved snapshots through the store; store gains snapshotSeasons() via a new seasons(kind) back-end op; tests in tests/rivalry-record.test.mjs and store-contract."
acceptanceCriteria:
  - "src/analysis/rivalry.mjs (pure) gives a pair's record (wins, losses, ties), total points, last meeting (season, week, score), current streak and biggest margin, from saved snapshots across every saved season"
  - "It counts only weeks where both teams' sides were saved, and says which seasons and weeks that covers"
  - "With no saved meeting the record is unavailable ('no meeting saved'), never 0-0; a season with no saved weeks is named as not covered"
  - "Teams are matched by roster id across renames (src/teamIdentity.mjs), and a guillotine league's weeks (no matchups) give no meetings"
  - "Tests cover renames, a tie, a multi-season history with a gap, and an ESPN week"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 5. History is whatever the store has saved (snapshots per season and week); Sleeper's API only serves the current season, so older meetings exist only if they were captured. Read through the store (src/storeCore.mjs) so it works on the file store and on a league file's memory store."
lastModified: "2026-10-16T19:16:29.938Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
