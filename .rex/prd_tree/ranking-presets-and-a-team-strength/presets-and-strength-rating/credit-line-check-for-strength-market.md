---
id: "14d210d9-c6a0-4a78-af06-c06ac34d9c53"
level: "task"
title: "Credit-line check for strength market values has no test: reverting it fails nothing"
status: "completed"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
source: "ndx-adversarial-review"
startedAt: "2026-10-16T19:07:23.083Z"
completedAt: "2026-10-16T19:08:13.466Z"
endedAt: "2026-10-16T19:08:13.466Z"
resolutionType: "code-change"
resolutionDetail: "Added 5 tests to tests/market-credit.test.mjs covering the strength walk in marketValueNumbers and checkPosts credit reporting."
acceptanceCriteria:
  - "A test asserts marketValueNumbers includes a strength market_value and draft_capital value, and excludes lineup/depth/age_window values"
  - "A test asserts checkPosts reports missingCredit for a ranking post quoting a strength market_value without the credit line, and none when the line is present"
  - "Removing the strength walk from marketValueNumbers makes that test fail"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Found by an adversarial review of commit 475db34. Verdict: should-fix.\n\nsrc/validate.mjs#marketValueNumbers now walks context.strength.teams[].components.market_value and .draft_capital, so a ranking post that quotes a strength market value without the FantasyCalc credit line is flagged. No test covers it. Delete that walk and every test still passes, and a ranking post quoting e.g. a team's market_value (18400) without the credit line would no longer be flagged by checkPosts.\n\nReachable through `fantasy-pressbox check <file>`, and wherever checkPosts runs with a ranking context. Ranking contexts now carry marketCredit whenever the strength rating used FantasyCalc values.\n\nFix: add a test (tests/market-credit.test.mjs) that builds a context carrying strength with a priced market_value, and checks that checkPosts flags a post quoting that value without the credit line. Cost: one test; no risk."
lastModified: "2026-10-16T19:08:13.494Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
