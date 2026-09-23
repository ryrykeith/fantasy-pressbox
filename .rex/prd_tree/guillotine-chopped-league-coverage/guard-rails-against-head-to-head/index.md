---
id: "8e209368-ac6b-4401-aeda-a406c0cad065"
level: "feature"
title: "Guard rails against head-to-head output in non-matchup leagues"
status: "pending"
priority: "critical"
blockedBy:
  - "c750f1eb-2d36-4204-9e92-47524cddc656"
acceptanceCriteria: []
description: "Make it impossible to generate a matchup-shaped edition for a guillotine league. This is the literal bug that was reported — the tool cheerfully produced irrelevant content instead of saying it could not.\n\nFailing loudly here is worth more than any of the new editions, because it converts a confusing bad output into an actionable message."
lastModified: "2026-09-23T05:41:36.305Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Refuse head-to-head editions for guillotine leagues](./refuse-head-to-head-editions-for.md) | pending |
| [Strip matchup-shaped facts from guillotine context](./strip-matchup-shaped-facts-from.md) | pending |
