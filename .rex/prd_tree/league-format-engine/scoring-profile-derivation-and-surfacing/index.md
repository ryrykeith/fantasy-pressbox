---
id: "5bd82641-f568-4a23-a99e-35797d46eff0"
level: "feature"
title: "Scoring profile derivation and surfacing"
status: "completed"
priority: "high"
startedAt: "2026-09-23T06:58:37.040Z"
completedAt: "2026-09-23T06:58:37.040Z"
endedAt: "2026-09-23T06:58:37.040Z"
acceptanceCriteria: []
description: "Derive a complete scoring profile from Sleeper's scoring_settings and surface it to every edition.\n\nWHY\nnormalizeLeague captures scoring wholesale into league.scoring but only four values are promoted into league.format. Only prompts/preseason-power-rankings.md actually references league.format.tePremium; the weekly rankings, preview and recap prompts never mention it. So in a TE-premium league the weekly editions rank and describe tight ends as if they were ordinary flex pieces — the position is systematically undervalued in exactly the editions published most often.\n\nThis is the TE-premium ask, generalised so the next scoring wrinkle does not need the same fix again."
lastModified: "2026-09-23T06:58:37.054Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Derive a structured scoring profile from scoring_settings](./derive-a-structured-scoring-profile.md) | completed |
| [Report the scoring profile in doctor](./report-the-scoring-profile-in-doctor.md) | completed |
| [Surface positional value implications in every edition prompt](./surface-positional-value-implications.md) | completed |
