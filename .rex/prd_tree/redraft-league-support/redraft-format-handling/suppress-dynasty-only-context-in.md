---
id: "9e43d244-6524-444e-83b7-baa6bf06c94c"
level: "task"
title: "Suppress dynasty-only context in redraft leagues"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Stop emitting concepts that do not exist in a redraft league.\n\nWHERE src/promptContext.mjs (buildContext, rosterView, describeMissingContext) and src/cli.mjs where normalizeFutureDraftCapital is called.\n\nWHAT\n- Skip the futureDraftCapital computation and context block entirely. Sleeper may still report traded picks for a redraft league's own upcoming rookie/startup draft, so do not rely on the data being empty — branch on format.\n- Omit taxiSquad from rosterView when the league has no taxi slots (league.taxiSlots is already normalized). Keep injuredReserve, which redraft leagues do have.\n- Replace the futureDraftCapital entry in describeMissingContext with a redraft-specific one: future picks are not a concept in this format, do not discuss draft capital at all.\n\nACCEPTANCE\n- A redraft league's ranking context contains no futureDraftCapital key and no empty taxiSquad arrays.\n- The unavailable list tells the model draft capital does not apply, rather than that nothing has been traded.\n- Dynasty leagues are unaffected."
lastModified: "2026-09-23T05:43:06.319Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
