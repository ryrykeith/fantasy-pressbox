---
id: "f605d547-424a-42f5-919d-29bfe32c2188"
level: "task"
title: "Weekly editions end to end on ESPN fixtures"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "editions"
  - "tests"
blockedBy:
  - "4ed5e1ab-f215-4585-bc73-5760fe65fafa"
  - "37d2325f-fa67-4001-b9f1-2c9b8abbcf14"
acceptanceCriteria:
  - "preview, recap, rankings, preseason-rankings, transactions, record, grade and check all build a prompt on the ESPN fixture league"
  - "No context contains a Sleeper-only fact or a raw ESPN field or code"
  - "Settled ESPN snapshots are not rewritten; multi-week matchup periods are refused"
  - "The provider boundary test and the cookie leak test pass"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Prove the weekly editions work on an ESPN league, end to end, without the network. Part of PR 2 on feat/espn-football.\n\nWrite integration tests through tests/fixtures/fake-espn-fetch.mjs and tests/fixtures/mock-espn-league.mjs for: preview, recap, rankings, preseason-rankings, transactions (trade and waiver reports), record, grade and check.\n\nFix whatever they expose. A fix belongs in src/espn/, or in a provider-neutral module if the problem is a Sleeper assumption that leaked; never in an ESPN special case downstream.\n\nEach test asserts the built prompt context contains:\n- no Sleeper-only fact;\n- no raw ESPN field name or numeric code;\n- the expected unavailable entries.\n\nMarket values may be unavailable in these tests; the espnId join is a separate task.\n\nAlso assert:\n- a settled ESPN week's snapshot is not rewritten by a later run (isSettledSnapshot, with ESPN's lastScoredWeek rule);\n- a preview or recap for a multi-week matchup period is refused.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Tests never touch the network."
lastModified: "2026-10-12T03:17:22.389Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
