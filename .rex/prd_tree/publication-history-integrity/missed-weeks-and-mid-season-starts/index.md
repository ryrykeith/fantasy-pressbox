---
id: "b0e4afdc-50ca-4cf5-956a-b642e3eea0b5"
level: "feature"
title: "Missed weeks and mid-season starts"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria: []
description: "Two operator cases found 2026-10-22, both verified on copies of a league folder. (1) A skipped edition: the operator's league recorded rankings through week 4 and skipped week 5, so the week 6 rankings measure movement against week 4 and week 5 was never captured. The week 6 prompt carried previousRankings.publishedFor 4 with no note, and the strength window was weeks 2, 3, 4, 6. (2) A cold start: a second league starting coverage in week 7 with nothing on disk. Its first rankings prompt had a one-week strength window (week 6 only) and a first-edition note that reads as if it were week 1."
lastModified: "2026-10-22T19:07:38.727Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Capture missing earlier weeks before a backward-looking edition](./capture-missing-earlier-weeks-before-a.md) | pending |
| [Carry LEAGUE_FIRST_SEASON in the league file](./carry-league-first-season-in-the.md) | pending |
| [catch-up command: save every completed week not yet on disk](./catch-up-command-save-every-completed.md) | completed |
| [Coverage labels name the weeks actually on file](./coverage-labels-name-the-weeks.md) | pending |
| [Gap-aware ranking movement](./gap-aware-ranking-movement.md) | pending |
| [Mid-season debut edition](./mid-season-debut-edition.md) | pending |
| [Summarize skipped weeks in a ranking that spans a gap](./summarize-skipped-weeks-in-a-ranking.md) | pending |
| [Tell the model how old the league is, apart from the publication](./tell-the-model-how-old-the-league-is.md) | completed |
