---
id: "3cc90608-9568-4f7b-9a86-2921810a4ebc"
level: "task"
title: "Refuse editions on the import route when the saved league page is older than the latest week page"
status: "completed"
priority: "high"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
source: "ndx-adversarial-review"
startedAt: "2026-10-13T03:52:51.523Z"
completedAt: "2026-10-13T04:00:08.249Z"
endedAt: "2026-10-13T04:00:08.249Z"
acceptanceCriteria:
  - "After importing a league page saved at period 3 and a week-5 matchups page saved at period 6, every edition refuses on the import route, naming both periods, the league address to save and the import command"
  - "import-espn reports the stale league page and prints the week's full set of addresses (league page plus both week pages)"
  - "Saving the league page again (a fixture saved at period 6) clears the refusal"
  - "doctor on the import route shows each saved page's period and flags a stale league page"
  - "The fetch route is unaffected (test)"
  - "With the refusal code removed, the tests fail"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-13): OWNER DECISION, option 2: REFUSE\nA warning alone doesn't stop stale standings reaching a post, so:\n- On ESPN_ROUTE=import, every edition that reads anything from the league page refuses when the saved league page's own scoringPeriodId is behind the latest scoring period any saved page shows. That covers standings, records, points-for, rosters, settings and the draft, which is in practice every edition.\n- The refusal says, in plain words: the league page (standings and rosters) was saved at period X, the latest week page at period Y; save the league page again. It gives the league address to open (espnImportLinks) and the import command to run.\n- import-espn: after importing, if the league page is now behind, it says so the same way, and prints all the addresses for this week's routine together: the league page plus that week's two pages. Saving the league page again then fixes it.\n- doctor (import route) shows the period each saved page is from, and flags a stale league page.\n- The fetch route is unaffected: it reads the league live every run.\n- Never compute around it: don't mix a newer week's scores with older standings in one context.\n\nFound by an adversarial review of task 3ab1ae1e.\n\nScenario: on ESPN_ROUTE=import the user imports the league page at week 2, then each week runs `import-espn --week N` with only that week's matchups and transactions pages. The import instance's openLeague (src/espn/provider.mjs, importInstance.openLeague) moves `scoringPeriodId` forward to the latest week page (leagueAsOf), so the League reports current week 9 and last scored week 8. But team records, points-for and rosters still come from the week-2 league page (normalizeTeams on saved.body). Rankings and previews for week 8 would then be built from week-2 standings and rosters, and nothing says so.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere; tests use the invented cast."
lastModified: "2026-10-13T04:00:08.302Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
