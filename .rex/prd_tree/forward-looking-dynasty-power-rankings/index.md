---
id: "793fccd2-780b-401f-be48-f8d99ed64892"
level: "epic"
title: "Forward-looking dynasty power rankings"
status: "pending"
priority: "medium"
description: "A second, explicitly forward-looking dynasty ranking that weighs future draft capital and roster age alongside current production.\n\nWHY\nThe existing weekly rankings blend current strength and dynasty context in one number, which makes it impossible to see the thing dynasty managers most want to know: who is actually set up for the next three years. A team that is winning now with a 30-year-old core and no picks through the next three drafts should rank near the BOTTOM of a forward-looking report, however good its record is — and the current single ranking cannot express that.\n\nTHE BALANCE THIS MUST STRIKE\nForward-looking must not collapse into youth worship. A roster of unproven 22-year-olds and a pile of picks is not better than a team producing now with a reasonable age curve. Current production stays in the model; the report weighs the window, it does not project fantasy outcomes for young players the tool has no data on. Concretely: reward demonstrated production from players young enough to keep producing, and treat picks and youth as upside on top of that, not as a substitute for it.\n\nFOUNDATIONS ALREADY IN PLACE\nnormalizeFutureDraftCapital computes net pick capital per team per season, correctly excluding picks for drafts already held. normalizePlayer captures age and yearsExp. Neither is aggregated into a roster-level window view yet.\n\nAPPLIES TO dynasty leagues only. In redraft this report has no meaning and the command should refuse, in the same way the guillotine guard rails work."
lastModified: "2026-09-23T05:43:11.626Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Future stock edition](./future-stock-edition/index.md) | pending |
| [Roster window metrics](./roster-window-metrics/index.md) | pending |
