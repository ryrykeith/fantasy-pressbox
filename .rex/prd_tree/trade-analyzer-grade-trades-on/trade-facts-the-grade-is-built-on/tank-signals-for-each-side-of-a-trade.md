---
id: "dc80f43e-fc34-4c2e-a765-8e7eea84acb6"
level: "task"
title: "Tank signals for each side of a trade"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A side below the playoff line that sheds lineup points and adds a 1st carries a tankSignal with each piece of evidence"
  - "A contender's side carries none"
  - "The change in projected weekly lineup points is reported per side"
  - "When the league's rule sorts on max points-for or points-for, the context says the lineup change bears on the slot; on record it does not"
  - "The prompt frames a tank as a read with evidence, never as intent"
description: "In the reviewed league the rookie draft orders non-playoff teams by max points-for, lowest first (config/rookie-draft.yml). A 2-4 team below the playoff line sold three veteran starters and took back a future 1st: every point of lineup ceiling it sheds moves its own pick toward the top, which is the case for the deal, and the grade missed it. The tank watch already projects the order, each slot's group and sort value, and the gap and cliff around each slot (src/analysis/draftOrder.mjs, src/tankWatch.mjs). WHAT TO ADD, per side in a dynasty league with a projectable order: whether it is below the playoff line; its own next-draft round-1 pick's projected slot and who holds it now; what the league's rule sorts its group on (max points-for, points-for or record); the trade's change in the side's projected weekly starting-lineup points (the solver's lineup before and after, on the basis from 'Starters from per-game averages and this week's projection'), and, when the rule sorts on points, that this change bears on its slot; and picks received and given up. A side that is below the line, lowers its lineup and adds picks gets a tankSignal summarising that evidence. The prompt may call it a tank as its own read, citing the evidence, never as a fact about the manager's intent (managerMotives stays unavailable), and grades such a side on draft position and future value rather than this season's points. Without a projectable order, unavailable with the reason (and not the misleading one fixed in b6fdfc96)."
lastModified: "2026-10-22T20:34:45.112Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
