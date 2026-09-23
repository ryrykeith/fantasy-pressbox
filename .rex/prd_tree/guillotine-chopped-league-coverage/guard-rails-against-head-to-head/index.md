---
id: "8e209368-ac6b-4401-aeda-a406c0cad065"
level: "feature"
title: "Guard rails against head-to-head output in non-matchup leagues"
status: "completed"
priority: "critical"
startedAt: "2026-09-23T07:49:33.000Z"
completedAt: "2026-09-23T07:49:33.000Z"
endedAt: "2026-09-23T07:49:33.000Z"
acceptanceCriteria: []
description: "Make it impossible to generate a matchup-shaped edition for a guillotine league. This is the literal bug that was reported — the tool cheerfully produced irrelevant content instead of saying it could not.\n\nFailing loudly here is worth more than any of the new editions, because it converts a confusing bad output into an actionable message."
lastModified: "2026-09-23T07:49:33.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Refuse head-to-head editions for guillotine leagues](./refuse-head-to-head-editions-for.md) | completed |
| [Strip matchup-shaped facts from guillotine context](./strip-matchup-shaped-facts-from.md) | completed |
