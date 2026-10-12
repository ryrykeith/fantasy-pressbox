---
id: "4de14992-c01a-4cd3-b090-9ccaa52e8451"
level: "task"
title: "ESPN fixtures and fake fetch"
status: "completed"
priority: "high"
tags:
  - "espn"
  - "tests"
blockedBy:
  - "d62ecb3f-96e7-4b40-af80-287a01a8fac2"
  - "080c68eb-8448-4ca1-8c5d-13dcb37cafc0"
startedAt: "2026-10-12T18:20:32.122Z"
completedAt: "2026-10-12T18:23:41.998Z"
endedAt: "2026-10-12T18:23:41.998Z"
acceptanceCriteria:
  - "Fixtures use only the invented cast and invented IDs, scores and cookie strings"
  - "Each fixture names the source of its shape and says unverified"
  - "The fake fetch serves a public league, a private league (401 without cookies) and a 404; no test touches the network"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Hand-build ESPN-shaped test data, so no ESPN test ever touches the network or real data. Part of PR 2 on feat/espn-football.\n\nADD tests/fixtures/mock-espn-league.mjs\nESPN-shaped responses for a 12-team league, using the invented cast from tests/fixtures/mock-dynasty-league.mjs (Bye Week Blues, Taco Tuesday, Rebuild Szn and the rest), covering:\n- mSettings, mTeam and mRoster;\n- one week's mMatchup and mBoxscore, including bench points;\n- mTransactions2, with a trade, a FAAB claim, a losing bid, a free-agent add and a drop;\n- the season endpoint;\n- a small players_wl.\n\nMake it a FAAB league, with a variant using rolling waivers. Add a separate matchup period spanning two NFL weeks, for the refusal test.\n\nADD tests/fixtures/fake-espn-fetch.mjs\nModelled on tests/fixtures/fake-sleeper-fetch.mjs. It serves:\n- a public league;\n- a private league that answers 401 without the fixture cookies;\n- a 404 for an unknown league.\n\nShapes follow docs/espn-data.md. Each fixture opens with a comment naming the source of its shape and the word 'unverified'.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: no real names, IDs, scores or cookies.\n- Never save a real ESPN response, even redacted."
lastModified: "2026-10-12T18:23:42.054Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
