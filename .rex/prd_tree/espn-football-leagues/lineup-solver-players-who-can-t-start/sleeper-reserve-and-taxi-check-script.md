---
id: "4accdf77-8903-40ac-aebf-28e4867a9584"
level: "task"
title: "Sleeper reserve and taxi check script (operator runs it)"
status: "completed"
priority: "medium"
tags:
  - "sleeper"
  - "lineup"
  - "operator-run"
startedAt: "2026-10-13T02:14:56.300Z"
completedAt: "2026-10-13T02:16:57.877Z"
endedAt: "2026-10-13T02:16:57.877Z"
acceptanceCriteria:
  - "scripts/check-sleeper-reserve.mjs prints only counts: reserve and taxi presence in the latest saved matchup, and ppts match counts with and without reserve/taxi players"
  - "It refuses to compare when the saved weeks don't cover the scored season, and says why"
  - "A test on invented fixtures asserts the counts and that no name, ID or point value appears in the output"
  - "Not run against a real league by the task; not part of npm test; the pack check passes"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Write a script the operator runs against their own league folder, to settle whether Sleeper's optimal-lineup solver should leave out IR (reserve) and taxi players. Write it and test it on fixtures. DO NOT run it against a real league from this task: the operator does that, by hand.\n\nscripts/check-sleeper-reserve.mjs <league folder>\n- Loads the folder with loadConfig, then opens the league through the provider. That fetches Sleeper's current rosters, which is public: no key.\n- Reads the league's saved raw weeks from its data/ through the store, the way readRosterWindow does.\n- QUESTION 1: in the most recent saved week, how many matchup `players` entries (across all rosters) are players currently in that roster's reserve, and how many in its taxi? Print the two counts and the number of rosters checked. A count of 0 on both, with rosters that have reserve or taxi players today, suggests Sleeper's matchup list already leaves them out. Print that as the reading, plus a caveat: today's IR list may differ from that week's.\n- QUESTION 2: for each roster, sum the solver's optimal lineup over every saved, scored week of the season, two ways: (a) as today; (b) leaving out players currently in reserve or taxi. Compare each with the roster's Sleeper ppts (seasonPotentialPoints) to 0.01. Print only how many rosters match under (a) and under (b), out of how many, and how many weeks were summed.\n- If the saved weeks don't cover the whole scored season, say so: ppts covers every scored week, so a partial sum can't match. Report it rather than comparing.\n- Print NO team names, manager names, player names, IDs or point values. Save nothing. Exit 0.\n- Run by hand only. Not part of npm test; check scripts/check-pack.mjs still passes.\n\nTests: run the script's logic (export it from a module the script calls) on tests/fixtures/mock-dynasty-league.mjs-style invented data. Assert the counts, and that the output contains no name, ID or point value from the fixture.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data in code, tests, fixtures, docs or commits.\n- The operator's output stays on their machine. If they paste counts back, those are aggregates only."
lastModified: "2026-10-13T02:16:57.904Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
