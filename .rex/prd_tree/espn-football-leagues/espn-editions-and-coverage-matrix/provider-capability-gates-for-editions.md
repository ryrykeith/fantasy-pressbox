---
id: "4ed5e1ab-f215-4585-bc73-5760fe65fafa"
level: "task"
title: "Provider capability gates for editions and context"
status: "completed"
priority: "high"
tags:
  - "espn"
  - "editions"
  - "unavailable"
blockedBy:
  - "b19b5d2b-6756-4289-a080-47e22661ef23"
  - "66f040dc-8613-4d8e-9217-82e820e58df2"
  - "863e1a94-3b79-48a4-9f21-b96cc0457a45"
startedAt: "2026-10-13T15:56:49.030Z"
completedAt: "2026-10-13T16:10:47.029Z"
endedAt: "2026-10-13T16:10:47.029Z"
resolutionType: "code-change"
resolutionDetail: "Commit 030540e: refuseEditionWithoutCapability in src/format.mjs (CLI before/after contacting the provider, and buildContext); describeProviderGaps unavailable entries in src/promptContext.mjs; four new provider capabilities; tests/espn-capability-gates.test.mjs (28 tests). Suite 970/970, pack check passes."
acceptanceCriteria:
  - "One test per refusal and per unavailable entry (including empty-trade contents, manager names and scoring defaults), each asserting the wording names the reason"
  - "A trade with empty items is never described as a trade of nothing"
  - "No ESPN context contains a Sleeper-only fact (potential points, taxi, traded picks)"
  - "Sleeper output for every edition is unchanged on the existing fixtures"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-12)\ndocs/espn-data.md was refilled from the two community clients (commit 6a730ae). It found three more gaps that need unavailable entries, in addition to the list below:\n- TRADE CONTENTS: espn-api says TRADE_ACCEPT rows from mTransactions2 often have empty items, except for trades made by the account whose cookies were sent. A trade with empty items is reported as a trade between the two teams, with an unavailable entry saying its contents are unknown and must not be described. Never present it as a trade of nothing.\n- MANAGER NAMES: unavailable while members[].displayName is unconfirmed (open question 27).\n- SCORING DEFAULTS: with no ESPN defaults table, the scoring profile can't say which settings are unusual. An unavailable entry tells the model not to call any ESPN scoring setting standard or unusual.\n\nAlso: draftSettings.isTradingEnabled suggests ESPN has some pick trading (open question 25). The tank-watch and future-stock refusal must say 'ESPN traded picks are not read in this version', not 'ESPN has no traded picks', so the refusal makes no claim the sources contradict.\n\nRefuse what ESPN can't support, and mark what it can't supply as unavailable, so an ESPN league never gets a Sleeper-only fact made up to fill the gap. Part of PR 2 on feat/espn-football.\n\nREFUSALS\nEach refusal names the reason, through the capability-aware helpers in src/format.mjs:\n- tank-watch and future-stock: traded picks are not read on ESPN in this version (see READ FIRST);\n- survival-preview, chop-recap and survival-rankings: guillotine is not supported on ESPN in v1;\n- preview and recap for a matchup period spanning more than one NFL week.\n\nRun each gate before contacting ESPN where the declared format allows, as refuseTankWatch already does, and again with the resolved league.\n\nUNAVAILABLE ENTRIES\nEach entry tells the model what not to say. Add one, via describeMissingContext and its siblings in src/promptContext.mjs, for:\n- season potential points (Sleeper's ppts has no known ESPN equivalent);\n- taxi squads;\n- keeper designations in a keeper league;\n- bids under rolling waivers;\n- the future_draft_capital ranking factor in a declared-dynasty ESPN league;\n- player age when ESPN doesn't supply it;\n- the projected playoff field, when the league's seeding is not wins then points for;\n- plus the three in READ FIRST.\n\nSleeper behaviour is unchanged.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Absent, not null, for fields a provider doesn't have."
lastModified: "2026-10-13T16:10:47.096Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
