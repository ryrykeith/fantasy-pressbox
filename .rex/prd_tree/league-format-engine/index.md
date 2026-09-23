---
id: "45d586e8-b0f8-4e25-bcd1-9ce8e8b306f6"
level: "epic"
title: "League format engine"
status: "pending"
priority: "critical"
description: "Make league format a first-class, resolved concept instead of a loose bag of booleans.\n\nWHY\nsrc/sleeper/normalize.mjs builds league.format ad hoc (superflex, pointsPerReception, tePremium, passingTouchdown, dynasty) and nothing downstream branches on it in a meaningful way. config/rankings.yml applies one dynasty-flavoured weight set (dynasty_value 0.25 + future_draft_capital 0.10 = 35% of the ranking) to EVERY league regardless of format. Worse, some formats cannot be detected from Sleeper at all: guillotine leagues are run on Sleeper by manual commissioner action, so the API reports an ordinary head-to-head league. Format therefore has to be DECLARED as well as detected.\n\nThis epic is the foundation for the guillotine (Epic: Guillotine league coverage), redraft (Epic: Redraft league support) and forward-looking-rankings work. Land it first.\n\nSCOPE\n- A declared format taxonomy resolved over Sleeper detection, with explicit precedence.\n- A derived scoring profile (TE-premium, PPR tier, superflex, passing TD) surfaced to every edition rather than just the preseason prompt.\n- Format-scoped ranking weights so a redraft league is not ranked on dynasty assets.\n\nOUT OF SCOPE\nFormat-specific editions and prompts — those live in the per-format epics."
lastModified: "2026-09-23T05:40:13.490Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Declared league format taxonomy and resolution](./declared-league-format-taxonomy-and/index.md) | completed |
| [Format-scoped ranking weights](./format-scoped-ranking-weights/index.md) | pending |
| [Scoring profile derivation and surfacing](./scoring-profile-derivation-and-surfacing/index.md) | completed |
