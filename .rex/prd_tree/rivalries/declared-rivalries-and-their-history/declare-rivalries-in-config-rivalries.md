---
id: "9f0cb7e7-2e7a-4c3b-811d-e821c239a06d"
level: "task"
title: "Declare rivalries in config/rivalries.yml"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "A league folder's optional config/rivalries.yml lists rivalries: teams (two, each a team name or roster id), optional name, optional note; the package ships a commented example only, with no rivalries"
  - "Teams resolve to roster ids through src/teamIdentity.mjs as config/guillotine.yml's teams do, so a renamed team keeps its rivalry; an unknown or ambiguous name, a pair of the same team and a duplicate pair are each refused, naming the entry"
  - "name and note are length-limited and read through the safe-input rules (src/lib/safeInput.mjs); refusals never echo the note"
  - "The league file carries config/rivalries.yml (CONFIG_FILES in src/leagueFile.mjs) and round-trips it; inspectLeague reports a rivalry that no longer resolves"
  - "Settings stay pure: the file is read as text by the CLI and resolved against the league's teams where the teams are known (prepareEdition), not in src/settings.mjs"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 5. Operator-written rivalry names and notes are about real people: they live only in the operator's league folder and the league file they export, never in the repository. Tests use the invented cast (tests/fixtures/mock-dynasty-league.mjs). Document the file in README and in the shipped example's comments."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
