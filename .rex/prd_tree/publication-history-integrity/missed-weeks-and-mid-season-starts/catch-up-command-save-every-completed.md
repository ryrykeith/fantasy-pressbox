---
id: "ef577729-a71c-4e59-97f6-d68a7bf9e741"
level: "task"
title: "catch-up command: save every completed week not yet on disk"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "On a folder with weeks 1-4 saved and week 6 completed, catch-up saves week 5 and 6 and reports weeks 1-4 as already settled without fetching them"
  - "On an empty folder mid-season it saves weeks 1 through the last completed week, in ascending order"
  - "--through N stops at week N"
  - "A second run fetches nothing and says every week is already settled"
  - "On the ESPN import route it lists the missing weeks and their pages and fetches nothing"
  - "README, --help and init's closing screen for a season under way name the command"
  - "Tests cover each case with a stub provider (no network)"
description: "Requested by the operator 2026-10-22. Starting coverage of a league in week 7 meant running 'for w in 1 2 3 4 5; do fantasy-pressbox fetch --week $w; done' by hand, and a skipped week needs the same (fetch --week 5). Make it one command. WHAT TO ADD: 'fantasy-pressbox catch-up' captures, in ascending order, every week from 1 through the last completed week (league.lastScoredWeek on Sleeper; the provider's current week minus one otherwise) that has no settled snapshot on disk, through captureWeek (src/pipeline.mjs). --through N stops earlier. Ascending order matters: captureWeek builds the guillotine elimination ledger and FAAB market from the weeks already stored. Settled weeks on disk are skipped without a fetch (the existing isSettledSnapshot rule), so running it twice is a no-op. It prints one line per week (saved, already settled, not played yet) and a closing line saying the backfilled weeks carry today's team names and records, because Sleeper keeps no history of them. On ESPN's import route it fetches nothing: it lists the missing weeks and the pages to save (importLinks), as import-espn does. Wire it like fetch: the command list in src/cli.mjs, its option set in src/options.mjs (--through, --workspace, --refresh-players), --help, the README Commands table and weekly routine (a short 'Starting mid-season or missed a week' note), and the closing screen of init for a league whose season is under way. Flagging the snapshots it writes as backfilled is part of 'Capture missing earlier weeks before a backward-looking edition'; if this task lands first, write the flag here and let that task reuse it."
lastModified: "2026-10-22T19:48:13.273Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
