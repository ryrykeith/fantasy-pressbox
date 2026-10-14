---
id: "8a0ef397-7fd0-4300-adc9-34bf89f88632"
level: "task"
title: "recordEdition files team names unpinned when a caller omits teams"
status: "completed"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
source: "ndx-adversarial-review"
startedAt: "2026-10-14T20:03:33.120Z"
completedAt: "2026-10-14T20:04:31.348Z"
endedAt: "2026-10-14T20:04:31.348Z"
resolutionType: "code-change"
resolutionDetail: "recordEdition now throws when teams is missing or not an array, before parsing or saving. Commit 30dc898."
acceptanceCriteria:
  - "recordEdition called without teams throws an error naming the missing teams argument, and nothing is saved to the store"
  - "A test in tests/options.test.mjs (or a new edition test) covers recordEdition without teams and fails today"
  - "The CLI's record and --generate paths still file rankings and predictions as before (espn-editions and team-identity tests pass)"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Found by adversarial review of cb2fe5d0 (Move edition steps into core). Verdict: should-fix.\n\nFailure scenario: a core caller (the website's paste-back box) calls recordEdition({ task: 'rankings', week, text, store, league }) and leaves out `teams`. src/edition.mjs#recordEdition defaults `teams = null`, and recordBlock then skips the roster pinning. A typo'd or renamed team name is filed as written, and the bad name silently becomes a \"new\" team with no history. With teams passed, the same reply would be refused by describeUnresolved.\n\nEvidence: src/edition.mjs, recordEdition's parameter list (`teams = null`) and recordBlock's `const identity = teams ? ... : null`.\n\nReachability: no current caller omits teams; the CLI's record and --generate paths both pass ctx.teams. It becomes reachable when the website starts calling recordEdition (core entry task). The teams-optional path exists only for recordBlock's unit tests.\n\nOptions:\n1. (Recommended) Make `teams` required in recordEdition: throw a named error when it is missing or not an array. recordBlock keeps its optional teams for the existing tests. Cost: a few lines and one test; no CLI change.\n2. Document it only. Cheaper, but leaves a silent-corruption trap in a public core API."
lastModified: "2026-10-14T20:04:31.374Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
