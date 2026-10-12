---
id: "50918e95-f1c7-4063-89f9-ba91f04867a8"
level: "task"
title: "guardTeams requires teams[].waiverRank in every league, a field the doc says may be spelled wavierRank"
status: "completed"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
  - "espn"
source: "ndx-adversarial-review"
startedAt: "2026-10-12T21:14:03.685Z"
completedAt: "2026-10-12T21:14:35.123Z"
endedAt: "2026-10-12T21:14:35.123Z"
acceptanceCriteria:
  - "guardTeams(body, { faab: true }) passes when teams[].waiverRank is absent"
  - "guardTeams(body, { faab: false }) still throws EspnShapeError naming teams[i].waiverRank when it is absent"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: should-fix (ndx-adversarial-review of task 09aca277, commit fb66e2d). Severity low.\n\nSCENARIO\nsrc/espn/shape.mjs, guardTeams(), requires integer teams[i].waiverRank whatever the league's waiver type. docs/espn-data.md (\"Teams and members\") says espn-api reads waiverRank and the JS client reads wavierRank: \"one of the two is a typo\". Suppose ESPN actually sends wavierRank. Then every league, FAAB leagues included, refuses at mTeam over a field only rolling-waiver coverage needs. A FAAB league's coverage does not use waiver order.\n\nREACHABILITY\nThere is no consumer yet. The league/team normalizer (sibling task) will call guardTeams on every capture.\n\nOPTIONS\n1. (Recommended) Require waiverRank only when { faab: false }, and leave it unchecked in a FAAB league. Cost: one line and one test. Risk: none.\n2. Accept either spelling. Not recommended: that reads a field the doc can't confirm, which is a guess.\nAlso add an open question to the doc on which spelling ESPN sends."
lastModified: "2026-10-12T21:14:35.158Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
