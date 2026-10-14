---
id: "5c20b018-656e-4021-b55e-99712e757d53"
level: "task"
title: "Coverage matrix in docs/espn-data.md"
status: "completed"
priority: "medium"
tags:
  - "espn"
  - "docs"
  - "tests"
blockedBy:
  - "f605d547-424a-42f5-919d-29bfe32c2188"
startedAt: "2026-10-13T17:38:46.906Z"
completedAt: "2026-10-13T17:51:13.830Z"
endedAt: "2026-10-13T17:51:13.830Z"
resolutionType: "code-change"
resolutionDetail: "Commit 10ee9b3: coverage matrix in docs/espn-data.md (editions/commands, context facts, unavailable entries, each verified or assumed) and tests/espn-coverage-matrix.test.mjs keeping it matched to the code."
acceptanceCriteria:
  - "Every edition, command and ESPN unavailable key has a row in the matrix, and every row exists in the code"
  - "The drift test fails when an edition or unavailable key is added without a row"
  - "Each row is labelled verified or assumed"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Write the final coverage matrix and keep it honest with a test. Part of PR 2 on feat/espn-football.\n\nStart from the draft in docs/plans/espn-football.md §8 and correct it against the code. In docs/espn-data.md, mark every edition (and command) and every context fact as one of:\n- supported;\n- refused, with why;\n- unavailable, with the instruction the model is given.\n\nLabel each row verified or assumed, matching the rest of the doc.\n\nAdd a test that collects every edition and command name, and every unavailable key the code can emit for an ESPN league. It fails when one has no row in the matrix, or when the matrix names one the code doesn't have.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-13T17:51:13.858Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
