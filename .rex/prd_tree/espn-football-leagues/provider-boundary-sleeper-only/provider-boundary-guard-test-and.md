---
id: "e5169f1d-6c76-408d-95e9-a65b1cdb3fc9"
level: "task"
title: "Provider boundary guard test and architecture docs"
status: "completed"
priority: "high"
tags:
  - "providers"
  - "docs"
  - "tests"
blockedBy:
  - "26c7029a-5ab3-4670-a8b9-4df17cf8ad2b"
startedAt: "2026-10-12T05:05:32.810Z"
completedAt: "2026-10-12T05:07:03.738Z"
endedAt: "2026-10-12T05:07:03.738Z"
acceptanceCriteria:
  - "tests/provider-boundary.test.mjs passes; its catching of a planted leak was already shown by run 051e1cf1 (do not plant one again)"
  - "docs/architecture.md describes the provider boundary and no longer claims anything about Sleeper the code does not do"
  - "The full suite passes (715 tests at the time of this note)"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-12)\nA first run (051e1cf1) wrote tests/provider-boundary.test.mjs: 9 tests, all passing. It is on disk, untracked. That run already proved the guard by hand: a planted src/zz-leak.mjs made both guard tests fail and name the file. The plant has since been removed, and the full suite passes (715/715).\n\nDo NOT plant a leak file again; that check is done. Review and keep the test file. The remaining work is the DOCS section below, which the first run never started.\n\nLock the boundary in with a test, and make docs/architecture.md describe it. This is the last task of PR 1, feat/provider-boundary.\n\nTEST (tests/provider-boundary.test.mjs)\nIt fails when:\n- a file outside src/sleeper/, src/espn/ and src/providers.mjs imports from either provider directory;\n- a listed raw Sleeper field name appears in src/ outside src/sleeper/. The list includes roster_id, owner_id, matchup_id, players_points, starters_points, fpts_decimal, waiver_bid and last_scored_leg. Comments explaining Sleeper are allowed.\n\nModel it on tests/workspace-root.test.mjs, which already enforces a similar line.\n\nDOCS (docs/architecture.md)\nUpdate:\n- the pipeline diagram (a provider, not Sleeper);\n- the module map (src/providers.mjs, src/league/, provider.mjs);\n- 'Domain concepts': the shared League, Team, Player, WeekData and DraftCapital shapes;\n- 'Adding another platform': the provider interface and the guard;\n- 'Historical integrity': raw bundles are tagged with their provider, untagged means Sleeper.\n\nRemove every claim about Sleeper that the code no longer makes. docs/sleeper-data.md stays the Sleeper data reference.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-12T05:07:03.758Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
