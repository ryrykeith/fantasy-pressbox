---
id: "34d4f5c9-e224-4b0d-8c29-4159c9238ae3"
level: "task"
title: "Define the format taxonomy and config schema"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "Add a format type with three values to start: dynasty, redraft, guillotine.\n\nWHERE\n- New config surface (see the npm package epic for where league-scoped config eventually lives; until then extend config/ + .env handling in src/config.mjs).\n- src/sleeper/normalize.mjs — normalizeLeague currently owns league.format.\n\nWHAT\n- format.type: 'dynasty' | 'redraft' | 'guillotine' (declared).\n- Keep the existing derived modifiers (superflex, pointsPerReception, tePremium, passingTouchdown) as a separate scoring sub-object — they are orthogonal to the type. A guillotine league can be superflex and TE-premium.\n- format.source: record whether the type was declared or detected, so downstream code and doctor can say which.\n\nACCEPTANCE\n- An unknown/misspelled type fails loudly at config load with the list of valid values, rather than silently defaulting.\n- A league with no declared type still resolves to a usable type via detection."
lastModified: "2026-09-23T05:40:13.947Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
