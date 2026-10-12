---
id: "26c7029a-5ab3-4670-a8b9-4df17cf8ad2b"
level: "task"
title: "Setup, doctor and the CLI through the provider"
status: "pending"
priority: "high"
tags:
  - "providers"
  - "refactor"
  - "setup"
blockedBy:
  - "420d5654-2c0c-475c-8398-d463b9f02ff2"
acceptanceCriteria:
  - "setup.mjs and src/cli.mjs import no src/sleeper/ module"
  - "Sleeper users see the same wording, now coming from provider.displayName"
  - "tests/init.test.mjs and the setup piping tests pass"
  - "The 671 existing tests pass, with only import-path changes"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Remove the last direct Sleeper imports from the CLI and setup.\n\nTODAY\n- setup.mjs:45-46 imports createClient and normalizeLeague, used at :253 and :259.\n- src/cli.mjs:44 imports normalizeTransactions and normalizeFutureDraftCapital, used at :600 and :653.\n- Hard-coded Sleeper wording:\n  - requireLeague names SLEEPER_LEAGUE_ID (src/cli.mjs:217);\n  - doctor prints 'League ID' and 'Contacting Sleeper...' (src/cli.mjs:388, :419);\n  - setup's 'Your Sleeper league' heading and prompts (setup.mjs:380-402);\n  - formatChoices' 'what Sleeper reports' (src/init.mjs:78).\n\nCHANGE\n- Route all of these through the provider: lookupLeague for setup's check of the league, displayName for the wording.\n- The CLI reads WeekData and draftCapital instead of calling normalizer functions.\n- Setup still offers Sleeper only; ESPN comes in a later task.\n- Setup writes POST_MAX_LENGTH for a new folder, and leaves an existing SLEEPER_POST_MAX_LENGTH in place.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- No behaviour change for Sleeper."
lastModified: "2026-10-12T03:14:55.576Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
