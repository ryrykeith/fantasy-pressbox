---
id: "8536bc62-2e3b-45f4-b05e-1c8c25fb6aa9"
level: "epic"
title: "Redraft league support"
status: "pending"
priority: "high"
description: "Support standard redraft leagues: a new team every season, no future picks, no taxi squad, no long-term asset value.\n\nWHY\nThe project was built dynasty-first and it shows. config/rankings.yml spends 35% of the ranking weight on dynasty_value and future_draft_capital. rosterView in src/promptContext.mjs always emits taxiSquad and injuredReserve. normalizeFutureDraftCapital and the futureDraftCapital context block run for every ranking edition. describeMissingContext tells the model that 'every team holds its own future picks and nothing else' when no picks have been traded — in a redraft league that sentence implies future picks exist as tradeable assets, which is false.\n\nNone of this crashes. It produces confidently wrong editorial: a redraft league ranked partly on assets that will never be drafted, and prose about draft capital in a league that has none.\n\nDEPENDS ON the format engine epic for the resolved format type and per-format weight sets."
lastModified: "2026-09-23T05:43:05.695Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Redraft format handling](./redraft-format-handling/index.md) | pending |
