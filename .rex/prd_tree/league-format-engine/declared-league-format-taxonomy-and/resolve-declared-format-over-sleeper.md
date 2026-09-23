---
id: "4988da4f-eeb5-4a9e-8e2b-2cd5e38b2387"
level: "task"
title: "Resolve declared format over Sleeper detection"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "Implement the precedence and make it observable.\n\nPRECEDENCE (highest first)\n1. Declared config value.\n2. Sleeper detection: dynasty when settings.type == 2 or taxi_slots > 0.\n3. Default: redraft.\n\nGuillotine is never detected — it can only be declared, because a Sleeper guillotine league is indistinguishable from a head-to-head league over the API. Document that in the code comment so the next reader does not go looking for a detection rule.\n\nACCEPTANCE\n- commandDoctor in src/cli.mjs prints the resolved format type AND its source, e.g. 'Format  guillotine (declared)' / 'dynasty (detected from taxi slots)'.\n- When a league is detected as dynasty but declared redraft, the declared value wins and doctor says so."
lastModified: "2026-09-23T05:40:14.180Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
