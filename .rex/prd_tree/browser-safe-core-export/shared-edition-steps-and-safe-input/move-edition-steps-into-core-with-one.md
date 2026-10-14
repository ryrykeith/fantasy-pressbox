---
id: "cb2fe5d0-02ef-41aa-846e-b25b2357a900"
level: "task"
title: "Move edition steps into core, with one option list"
status: "completed"
priority: "high"
blockedBy:
  - "1ffddde2-86cf-443f-aa89-6639f367c106"
startedAt: "2026-10-14T15:06:57.382Z"
completedAt: "2026-10-14T15:20:16.304Z"
endedAt: "2026-10-14T15:20:16.304Z"
resolutionType: "code-change"
resolutionDetail: "Commit 9d8699e: src/edition.mjs (prepareEdition, recordEdition, all refusals, recordBlock) and src/options.mjs (EDITIONS, OPTIONS, parseArgs). The CLI's commands call them, and --help is built from the descriptors and reads exactly as before. tests/options.test.mjs covers the acceptance criteria; npm test: 1088 pass."
acceptanceCriteria:
  - "Every CLI command produces the same output and files as before"
  - "A test fails if parseArgs accepts a flag that OPTIONS does not describe"
  - "--help lists exactly the options and editions in the descriptors"
  - "prepareEdition and recordEdition import nothing from node:"
  - "The guillotine-only refusals and their wording are unchanged"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- cli.mjs has grown ESPN steps that belong inside prepareEdition: the capability gates (refuseEditionWithoutCapability, run before the provider is contacted and again with the opened league), refuseMultiWeekMatchup, the import route's stale-league-page refusal (EspnStaleLeagueError), and the quiet-week logic (summarizeTransactionWeek / describeQuietTransactionWeek, including trades without contents).\n- Add to acceptance: every ESPN refusal and its wording is unchanged, as for the guillotine ones; tests/espn-*.test.mjs pass unchanged.\n- Core supports ESPN on the import route only. prepareEdition refuses an ESPN league whose route is fetch unless the caller is the CLI, naming the reason. Mark ESPN_ROUTE=fetch in OPTIONS as CLI-only, like --generate. import-espn stays a CLI command, but its reading (readSavedFiles and the rest of src/espn/import.mjs, already node-free) is what the website will call.\n\nThe steps of an edition (open the league, resolve the week, capture it, build the context and the prompt) and recordBlock live inside cli.mjs's command handlers. A second surface would have to copy them.\n\n- Move them into core as prepareEdition({ task, week, options, provider, store, assets, settings }) and recordEdition({ task, week, text, store, ... }). The CLI's commands call them.\n- Add OPTIONS and EDITIONS descriptors as data:\n  - for each option: its flag, values, default, help text and the editions it applies to;\n  - for each edition: its name, the formats that allow it, and whether it is recordable or forward-looking.\n- Build helpText and parseArgs from the descriptors.\n- The website renders its controls from the same descriptors, so CLI-to-UI parity is enforced by data. --generate is the one CLI-only option, because the website never calls an AI."
lastModified: "2026-10-14T15:20:16.329Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
