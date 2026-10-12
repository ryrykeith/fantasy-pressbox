---
id: "4ed5e1ab-f215-4585-bc73-5760fe65fafa"
level: "task"
title: "Provider capability gates for editions and context"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "editions"
  - "unavailable"
blockedBy:
  - "b19b5d2b-6756-4289-a080-47e22661ef23"
acceptanceCriteria:
  - "One test per refusal and per unavailable entry, each asserting the wording names the reason"
  - "No ESPN context contains a Sleeper-only fact (potential points, taxi, traded picks)"
  - "Sleeper output for every edition is unchanged on the existing fixtures"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Refuse what ESPN can't support, and mark what it can't supply as unavailable, so an ESPN league never gets a Sleeper-only fact made up to fill the gap. Part of PR 2 on feat/espn-football.\n\nREFUSALS\nEach refusal names the reason, through the capability-aware helpers in src/format.mjs:\n- tank-watch and future-stock: ESPN has no traded future picks;\n- survival-preview, chop-recap and survival-rankings: guillotine is not supported on ESPN in v1;\n- preview and recap for a matchup period spanning more than one NFL week.\n\nRun each gate before contacting ESPN where the declared format allows, as refuseTankWatch already does, and again with the resolved league.\n\nUNAVAILABLE ENTRIES\nEach entry tells the model what not to say. Add one, via describeMissingContext and its siblings in src/promptContext.mjs, for:\n- season potential points (Sleeper's ppts has no known ESPN equivalent);\n- taxi squads;\n- keeper designations in a keeper league;\n- bids under rolling waivers;\n- the future_draft_capital ranking factor in a declared-dynasty ESPN league;\n- player age when ESPN doesn't supply it;\n- the projected playoff field, when the league's seeding is not wins then points for.\n\nSleeper behaviour is unchanged.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Absent, not null, for fields a provider doesn't have."
lastModified: "2026-10-12T03:17:12.960Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
