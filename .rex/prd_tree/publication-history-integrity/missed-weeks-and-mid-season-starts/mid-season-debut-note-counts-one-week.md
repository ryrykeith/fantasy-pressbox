---
id: "1a22ef97-bfac-42b5-afca-1c9b2ac2a904"
level: "task"
title: "Mid-season debut note counts one week too few"
status: "pending"
priority: "medium"
source: "review of feat/missed-weeks, 2026-10-22"
acceptanceCriteria:
  - "A week 6 ranking with nothing recorded says it arrives 6 weeks into the season, in both why and instruction"
  - "A week 2 ranking with nothing recorded says 2 weeks"
  - "A week 1 ranking keeps the ordinary first-edition note"
  - "tests/mid-season-debut.test.mjs asserts the corrected counts; npm test passes"
description: "Found in review 2026-10-22 of 'Mid-season debut edition' (64f86236, commit 7f47703), on a copy of a league starting coverage mid-season. A ranking edition for week N is built after week N is played: rankings --week 6 captures week 6, and the records, points-for and strength window in its context run through week 6. The mid-season debut note in buildContext (src/promptContext.mjs, the previousRankings missing-context entry, weeksIn = week - 1) told the model the edition 'arrives 5 weeks into the season', so the model would write 'five weeks in' beside records that show six games. tests/mid-season-debut.test.mjs asserts the same 5 for week 6, so the suite passed. WHAT TO CHANGE: count the weeks played as week (week 6 -> '6 weeks', week 2 -> '2 weeks'; the singular only if a week 1 path ever reaches it, which it does not today, as week 1 keeps the ordinary first-edition note) in both the why and the instruction text. Check whether survival-rankings and postseason rankings reach the same note and count the same way. Update the test's expected text and add a week 2 case. Nothing else in the note changes."
lastModified: "2026-10-23T02:27:10.207Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
