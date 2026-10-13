---
id: "2a3f59ec-ecb0-461a-9036-14ba4c3a3ef4"
level: "task"
title: "The transactions command builds a trade report when every trade that week arrived without its contents"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "`transactions` on an ESPN week whose only trades have contentsUnknown builds no trade-report, exits 0, and its message names the reason (ESPN sent the trades without their contents)"
  - "buildPrompt refuses a trade-report whose trades all have contentsUnknown"
  - "A week that has one trade with known contents and one without still builds; the unknown one appears as made by its teams, contents unknown, and is not graded"
  - "A test drives each case through the CLI with the fake ESPN fetch"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Found by an adversarial review of task 4ed5e1ab (provider capability gates). Severity: medium. Verdict: should-fix.\n\nFAILURE SCENARIO\n1. An ESPN week has one completed trade, and ESPN sent it with empty items. espn-api says it often does, unless the cookies belong to the account that made the trade.\n2. `transactions --week N` runs. summarizeTransactionWeek (src/cli.mjs) counts the trade, so describeQuietTransactionWeek reports the week as not quiet.\n3. buildContext gets `trades: [{ week, completedAt, teams, contentsUnknown: true }]`, so buildPrompt's \"no trade in the context\" guard (src/promptContext.mjs, `task === 'trade-report' && !context.trades?.length`) passes.\n4. The result is a trade-report prompt. prompts/trade-report.md tells the model to grade every trade, while the `tradeContents` unavailable entry tells it not to grade this one.\n5. The edition has nothing to grade, and its instructions conflict. That is the kind of prompt where a model fills the gap with a made-up grade.\n\nREACHABILITY\nReached through `fantasy-pressbox transactions` on any ESPN league that has a week like this. It is not covered by any test: tests/espn-capability-gates.test.mjs builds such a context directly and checks only that the trade shows the teams and the entry exists.\n\nOPTIONS\n(a) Recommended. Treat a week whose trades all have unknown contents as having no gradeable trade. Either summarizeTransactionWeek counts only trades with known contents, or buildPrompt refuses when every trade has contentsUnknown. Say so plainly, naming the reason: ESPN sent the trades without their contents. Exit 0 with no edition, the same as a quiet week. Cost: small. Risk: a week with a mix of known and unknown trades must still build, with the unknown ones reported as made but not graded.\n(b) Keep building the edition, and add a format block to prompts/trade-report.md that says \"report a contentsUnknown trade as made, not graded\". Cost: prompt churn. It also leaves an edition whose only content is \"a trade happened\"."
lastModified: "2026-10-13T19:21:57.212Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
