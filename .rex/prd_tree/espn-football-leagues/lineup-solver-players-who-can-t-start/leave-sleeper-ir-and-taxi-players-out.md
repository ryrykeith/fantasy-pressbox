---
id: "539ef3f0-cda3-41e6-950b-571aff676503"
level: "task"
title: "Leave Sleeper IR and taxi players out of the optimal lineup, if the check says so"
status: "blocked"
priority: "medium"
tags:
  - "sleeper"
  - "lineup"
blockedBy:
  - "4accdf77-8903-40ac-aebf-28e4867a9584"
acceptanceCriteria:
  - "The task acts only on the operator's recorded check result"
  - "Today's reserve or taxi list is never applied to a past week"
  - "Bundles saved before the change produce byte-identical output"
  - "docs/sleeper-data.md records the finding, the date and how it was checked"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "BLOCKED until the operator has run scripts/check-sleeper-reserve.mjs on their league and recorded the result (counts only) in a dated READ FIRST note on this task. Without that note, stop: don't guess the result.\n\nApply what the check shows to Sleeper's optimal-lineup solver (src/analysis/week.mjs). ESPN already leaves IR players out (443e528), through reserveIds on WeekData rosters.\n\nIF Sleeper's matchup `players` list already leaves out reserve and taxi players (check question 1 found none):\n- Change no code.\n- Record the finding in docs/sleeper-data.md, under 'Lineups', with the date and how it was checked.\n- Close the task.\n\nIF it includes them, and leaving them out makes more rosters match ppts (question 2):\n- Sleeper keeps no roster history, so who was on IR or taxi in a past week is unknown. NEVER apply today's reserve or taxi list to a past week.\n- From now on, captureWeek records each roster's reserve and taxi IDs in the raw bundle at capture time, as the roster stood when the week was fetched. Do this only for the week being captured live, not for a re-fetch of an old week.\n- Sleeper's normalizeWeek carries reserveIds and taxiIds on WeekData rosters only when the bundle recorded them. week.mjs leaves those players out of the candidates, as it does for ESPN.\n- Weeks saved before this change have no record. They keep today's behaviour, and docs/sleeper-data.md says so.\n- Settled snapshots are not rewritten (isSettledSnapshot).\n- Tests: a bundle with recorded reserve/taxi IDs leaves them out; a bundle without keeps today's output byte-identical.\n\nIF the check is inconclusive (both ways match, or neither does): record that in docs/sleeper-data.md and change no code.\n\nAdd a user-facing line to the PR description if lineup efficiency or potential points change for Sleeper leagues.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: the operator's counts are aggregates, and no league's numbers go into the repository."
lastModified: "2026-10-13T02:13:03.557Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
