---
id: "db331b55-226b-4f61-8d10-60fa21162ebb"
level: "task"
title: "Rewrite the docs for the package workflow"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "README.md documents a clone-and-run workflow throughout: npm run setup, node src/cli.mjs <command>, files landing in the repo's own data/ and output/. All of that changes.\n\nWHAT\n- Install and init as the entry path, with the per-league workspace explained.\n- Document the format categorisation step and what each format changes, including that guillotine must be declared because Sleeper cannot report it.\n- Update the command reference for the new commands added across this PRD (transactions, the guillotine editions, the forward-looking dynasty report).\n- Keep the existing explanation of why the data is the source of truth — it is the clearest statement of the project's design rule and should survive the rewrite.\n- setup.mjs overlaps with the new init; decide whether it is replaced or kept for the repo-clone path, and say so in the docs.\n\nACCEPTANCE\n- A reader who has never cloned the repo can install, init and publish a first edition from the README alone."
lastModified: "2026-09-23T05:44:17.980Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
