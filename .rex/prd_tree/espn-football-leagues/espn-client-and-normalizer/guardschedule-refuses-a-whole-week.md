---
id: "32cdbc1a-03a2-40e2-a04f-7fdf2bcf913f"
level: "task"
title: "guardSchedule refuses a whole week when one lineup player has no actual-points stats entry"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "ndx-adversarial-review"
  - "severity:high"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "A week response where a bench player's stats[] has no statSourceId-0 entry for that week passes guardSchedule(body, { week }), and the value is left absent, not set to 0"
  - "A present statSourceId-0 entry with a missing or non-number appliedTotal still throws EspnShapeError naming the path"
  - "docs/espn-data.md lists, as an open question, whether ESPN writes an actual-points entry for a player who did not play"
  - "The week normalizer's handling of a starter with no entry is decided and tested (refused, or unavailable), never 0"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: should-fix (ndx-adversarial-review of task 09aca277, commit fb66e2d). Severity medium.\n\nSCENARIO\nsrc/espn/shape.mjs, teamEntry() (called by guardSchedule with { week }). Every entry in rosterForCurrentScoringPeriod.entries[] must carry a stats[] entry with scoringPeriodId === week and statSourceId 0. If not, the guard throws EspnShapeError for the whole response. Bench and IR players are in the same list (doc, \"Rosters and lineups\"). docs/espn-data.md doesn't say whether ESPN writes an actual-points entry for a player who did not play: on a bye, inactive, or on IR. If it doesn't, nearly every real week has such a player on some bench, so preview and recap would refuse every week, not just the one wrong player. This is unverified, because no test league exists.\n\nREACHABILITY\nThere is no consumer yet. The ESPN week normalizer (sibling task \"ESPN week normalizer and provider\") will call guardSchedule(body, { week }) on every recap.\n\nOPTIONS\n1. (Recommended) In the guard, treat a missing actual-points entry as allowed and leave it absent, but still type-check the entry when it is present. The week normalizer then decides per player: a starter with no entry is refused, naming the player; a bench or IR player with no entry has unavailable points, never 0. Cost: a branch plus tests. Risk: low. This keeps \"never default to 0\".\n2. Keep the guard strict and add an open question to docs/espn-data.md. Cost: nothing now. Risk: every real ESPN recap may refuse until it is checked against a live league.\nDecision for the operator: whether a starter with no stats entry is refused or reported as unavailable."
lastModified: "2026-10-12T21:07:05.490Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
