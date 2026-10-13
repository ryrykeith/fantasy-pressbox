---
id: "3cc90608-9568-4f7b-9a86-2921810a4ebc"
level: "task"
title: "Import route silently uses a stale league page's standings and rosters when only week pages are re-imported"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "After importing a league page saved at period 3 and then a week-5 matchups page saved at period 6, import-espn prints a warning that the league page (standings and rosters) is from period 3, with the league address to save again"
  - "An edition built in that state warns, or refuses (per the owner's choice), instead of silently using period-3 standings"
  - "A test imports a stale league page plus a later week page and asserts the warning; with the warning code removed the test fails"
description: "Found by an adversarial review of task 3ab1ae1e (verdict: should-fix).\n\nScenario: on ESPN_ROUTE=import the user imports the league page at week 2, then each week runs `import-espn --week N` with only that week's matchups and transactions pages. The import instance's openLeague (src/espn/provider.mjs, importInstance.openLeague) moves `scoringPeriodId` forward to the latest week page (leagueAsOf), so the League reports current week 9 and last scored week 8. But the team records, points-for and rosters still come from the week-2 league page (normalizeTeams on saved.body). Rankings and previews for week 8 are then built from week-2 standings and rosters, and nothing says so: import-espn prints only \"current week 9 (the latest saved page)\".\n\nReachable: yes, through `import-espn` followed by any edition. It isn't caught upstream: no check compares the league page's own scoringPeriodId with the latest period seen.\n\nOptions:\n1. (recommended) When the league page's own scoringPeriodId is behind the latest period any saved page shows, import-espn prints a warning naming the period the page was saved at, with the league address to re-save. Editions do the same on stderr. Cheap, and nothing that works today is blocked.\n2. Refuse editions when the league page is behind the latest week page. Stricter, but it blocks a recap of a just-saved week until the league page is saved again too. That is a decision for the owner."
lastModified: "2026-10-13T03:36:09.853Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
