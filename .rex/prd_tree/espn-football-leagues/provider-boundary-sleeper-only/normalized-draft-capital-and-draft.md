---
id: "5c5b2132-9d39-434b-8b12-88f72d437fa6"
level: "task"
title: "Normalized draft capital and draft status"
status: "pending"
priority: "high"
tags:
  - "providers"
  - "refactor"
acceptanceCriteria:
  - "No module outside src/sleeper/ reads roster_id, owner_id or previous_owner_id from a pick"
  - "Draft order, pick capital, tank watch, future stock and trade-report pick projections are unchanged on the existing fixtures"
  - "The 671 existing tests pass, with only import-path changes"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Move traded picks and draft status into provider-neutral shapes.\n\nTODAY\n- Raw Sleeper traded picks (roster_id, owner_id, previous_owner_id) go from openLeague (src/pipeline.mjs:63) into readDraftOrder and readPickCapital (:311, :334, :343) and src/cli.mjs:600 (normalizeFutureDraftCapital).\n- isFuturePick and currentSeasonDrafted (src/sleeper/normalize.mjs:371-382) compare Sleeper's raw league.status values pre_draft and drafting, which normalizeLeague passes straight through (:242).\n\nCHANGE\n- In src/sleeper/, normalize traded picks to `{ season, round, originalRosterId, ownerRosterId, previousOwnerRosterId }`.\n- openLeague returns `draftCapital: { tradedPicks }`.\n- Add `league.draftStatus` ('pre_draft' | 'drafting' | 'complete'), mapped from Sleeper's status in the normalizer.\n- Move isFuturePick, currentSeasonDrafted, futurePickOwnership and normalizeFutureDraftCapital into src/league/draftCapital.mjs, reading only the normalized fields.\n- Keep their behaviour exactly, including spent startup picks being excluded and the draft_rounds baseline (docs/sleeper-data.md, 'Draft picks, spent and future').\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere. Use the invented cast in tests/fixtures/mock-dynasty-league.mjs.\n- No behaviour change for Sleeper.\n\nPlan: docs/plans/espn-football.md §6."
lastModified: "2026-10-12T03:14:26.496Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
