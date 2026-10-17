---
id: "df872acf-3511-47a2-84d6-033d23786fbe"
level: "task"
title: "The five-year-plan edition and --team"
status: "completed"
priority: "high"
blockedBy:
  - "cd725331-03af-45dc-8b0b-c8dd7cfa0b1b"
startedAt: "2026-10-16T19:43:11.096Z"
completedAt: "2026-10-16T19:54:03.390Z"
endedAt: "2026-10-16T19:54:03.390Z"
resolutionType: "code-change"
resolutionDetail: "five-year-plan edition with --team, refusals, prompt and tests; committed bd23520 on feat/football-config. 1299 tests and pack check pass."
acceptanceCriteria:
  - "five-year-plan --team <name or roster id> builds a prompt for one team; EDITIONS lists it (dynasty only, not recordable, not forward-looking, not in the weekly routine) and OPTIONS adds --team (applies to five-year-plan only)"
  - "It is refused, naming the reason, for redraft and guillotine leagues, on ESPN (traded picks are not read, as for future-stock), and for an unknown or ambiguous --team; refusals run before the provider is contacted where the declared settings allow"
  - "prompts/five-year-plan.md frames a contention window and the team's options season by season, ties every claim to a fact, and never projects points, records or titles"
  - "Tests: prepareEdition in memory builds the prompt for an invented team; the refusals; parseArgs and --help include --team (tests/options.test.mjs and the help fixture)"
  - "The core entry exposes it through EDITIONS and OPTIONS with no new export needed; tests/core-purity.test.mjs passes"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 6. Read docs/prompt-design.md and prompts/future-stock.md first; this edition is about one team, so it may name players, picks and choices more concretely than future stock does."
lastModified: "2026-10-16T19:54:03.463Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
