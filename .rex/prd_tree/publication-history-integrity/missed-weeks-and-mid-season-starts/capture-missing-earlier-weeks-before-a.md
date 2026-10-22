---
id: "4fe5cc92-b02c-488c-bb31-6abe1ffc3b3b"
level: "task"
title: "Capture missing earlier weeks before a backward-looking edition"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A rankings run with weeks 1-4 and 6 on disk either captures week 5 first (and the strength window includes it) or stops naming catch-up, per the decision recorded in the task"
  - "A backfilled snapshot is flagged, and its team names are not used to resolve published names for that week"
  - "Settled weeks already on disk are not refetched"
  - "On the ESPN import route the edition names the missing pages instead of fetching"
description: "Builds on 'catch-up command: save every completed week not yet on disk'. captureWeek (src/pipeline.mjs) fetches only the week an edition is about, so a skipped week has no raw bundle or snapshot, and everything built from saved weeks silently leaves it out: the strength window (settledWeeks, readStrength), rivalry head-to-head (readSavedSeasons in src/analysis/rivalry.mjs), trade-report player history and pointsPerGame (src/analysis/transactions.mjs), the guillotine ledger and FAAB market. A league that starts coverage mid-season has only the current week. Sleeper's matchups and transactions endpoints return past weeks accurately (verified: fetch --week 5 on a copy put week 5 into the strength window), but team names, records and the projected draft order come from today's league. catch-up fixes this when the operator remembers to run it; this task makes the editions themselves notice. WHAT TO ADD: recap and rankings check for any week from 1 to week-1 with no settled snapshot before building, and either capture it through catch-up's loop or stop and name the command (decide which; at minimum warn). On ESPN's import route, name the pages still to save instead. A snapshot written by a backfill is flagged backfilled: true (catch-up may already write this), and src/teamIdentity.mjs does not read its team names as the names that week went by. The settled-snapshot rule is unchanged: a settled week on disk is never refetched or rewritten."
lastModified: "2026-10-22T19:48:25.639Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
