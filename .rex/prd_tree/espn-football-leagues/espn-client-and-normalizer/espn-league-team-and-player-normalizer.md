---
id: "f7204756-253f-41a9-b8d3-7d6faf9c156c"
level: "task"
title: "ESPN league, team and player normalizer"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "format"
  - "scoring"
blockedBy:
  - "09aca277-0e30-4d6d-8e52-0f758311de1d"
  - "3bb252d4-e95d-451b-8724-d38e3df34979"
acceptanceCriteria:
  - "Normalizing the ESPN fixtures gives the expected League, Team and Player shapes"
  - "A declared guillotine on ESPN is refused, naming the reason; a declared dynasty is accepted"
  - "A league starting any IDP slot is refused, naming the slots"
  - "A keeper league resolves to redraft with a keeper flag"
  - "format.scoring has exactly the deriveScoringProfile shape; with no defaults table, nonDefault lists every scored item and isDefault is false"
  - "Without members[].displayName the Team has no manager; a test asserts no firstName, lastName or owner value reaches a team, snapshot or prompt"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-12)\ndocs/espn-data.md was refilled from the two community clients (commit 6a730ae), with field paths for settings, teams, members, rosters and the draft. Build against those field paths. Four points change this task:\n\n1. MANAGER NAMES: neither client reads members[].displayName (open question 27). The JS client reads teams[].owner.firstName and lastName, which are real names. Until displayName is confirmed:\n   - manager is absent from the Team record, and the editions mark manager names unavailable;\n   - never fall back to firstName/lastName or owner;\n   - if members[].displayName is present in a response, it may be used.\n2. SCORING: there is no ESPN defaults table (open question 5), so nonDefault can't be a real diff. Follow the doc's decision under 'Scoring':\n   - nonDefault lists every scored item, with isDefault false and a note saying why;\n   - reception base is stat 53, passing TD stat 4, passing yards stat 3 (or exactly one of stats 5-10), interceptions stat 20;\n   - pointsOverrides keys are not understood, so premiumPositions stays empty and an override on stat 53 goes to notModelled.\n3. DRAFT STATUS: only draftDetail.drafted is documented (open question 28). Map drafted true to 'complete' and false to 'pre_draft'. Never report 'drafting'.\n4. POSITIONS AND IDP (added after the code-tables review):\n   - A player's position is positionFromEligibleSlots(eligibleSlots, fullName) from src/espn/codes.mjs, fixed by the task this one is blocked by. Pass the player's fullName, because the rule needs it for team defenses.\n   - A league whose starting slots (rosterSettings.lineupSlotCounts with a count above 0, excluding bench and IR) include DT, DE, LB, DL, CB, S, DB or DP is REFUSED. The message names those slots and says individual defensive players are not covered for ESPN in this version (docs/espn-data.md 'Positions', open question 31). Test it.\n\nTurn ESPN responses into the shared League, Team and Player shapes (docs/plans/espn-football.md §6). Part of PR 2 on feat/espn-football.\n\nLEAGUE (src/espn/normalize.mjs)\n- startingSlots and bench slots through src/espn/codes.mjs;\n- draftStatus;\n- playoff team count and start week, and the seeding setting;\n- waiver type (FAAB or rolling) and budget;\n- trade deadline.\n\nUse null where docs/espn-data.md says a value is not reported. Never borrow a value from Sleeper's defaults.\n\nFORMAT\n- detectFormatType reports 'redraft' for ESPN, keeper leagues included, and flags a keeper league so the editions can mark keeper designations unavailable.\n- A declared LEAGUE_FORMAT wins, exactly as on Sleeper (src/format.mjs). A declared 'dynasty' is accepted.\n- A declared 'guillotine' is refused on ESPN, with the reason: not supported on ESPN in v1.\n\nSCORING\nformat.scoring keeps exactly the shape deriveScoringProfile returns: superflex, reception, passing, nonDefault, notModelled and isDefault. It is built from the scoring stat-ID table (and, per READ FIRST, without a defaults table). Unmapped stats go to notModelled. Each nonDefault entry carries a readable label beside its key.\n\nTEAM\n- rosterId is the ESPN team ID.\n- name is the team name.\n- manager: see READ FIRST. Never firstName or lastName: they must not reach a team, a snapshot or a prompt.\n\nPLAYER\n- position by positionFromEligibleSlots(eligibleSlots, fullName) in src/espn/codes.mjs;\n- team as the canonical code through src/nflTeams.mjs;\n- injury status if present;\n- age only if ESPN supplies an age or a birth date, otherwise absent.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere. Use the fixtures in tests/fixtures/mock-espn-league.mjs."
lastModified: "2026-10-12T17:56:03.718Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
