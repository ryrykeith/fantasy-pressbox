---
id: "a8dad0b0-fc33-4f7f-a0b2-3d9f45d3b21a"
level: "task"
title: "Coverage labels name the weeks actually on file"
status: "pending"
priority: "low"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A rivalry record through week 6 with week 3 unsaved lists week 3 as missing"
  - "strength.window lists missing weeks inside its range"
  - "With every week saved, neither carries missingWeeks"
description: "Facts built from saved weeks are labelled as if every week were saved. A rivalry record (src/edition.mjs, rivalryRecords) is through a week but counts only the weeks on disk, so a pair whose only meeting fell in an unsaved week shows 'no meeting saved' and a partial record reads as a full one. strength.window lists the weeks it used but not the weeks it is missing. WHAT TO ADD: missingWeeks on each rivalry record and on strength.window, listing weeks up to its through week with no saved data; prompts say not to state a season-long record or trend when weeks are missing, and to say which weeks it covers."
lastModified: "2026-10-22T19:08:16.277Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
