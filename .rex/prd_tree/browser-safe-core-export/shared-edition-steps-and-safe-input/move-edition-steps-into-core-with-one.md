---
id: "cb2fe5d0-02ef-41aa-846e-b25b2357a900"
level: "task"
title: "Move edition steps into core, with one option list"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "Every CLI command produces the same output and files as before"
  - "A test fails if parseArgs accepts a flag that OPTIONS does not describe"
  - "--help lists exactly the options and editions in the descriptors"
  - "prepareEdition and recordEdition import nothing from node:"
  - "The guillotine-only refusals and their wording are unchanged"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "The steps of an edition (open the league, resolve the week, capture it, build the context and the prompt) and recordBlock live inside cli.mjs's command handlers. A second surface would have to copy them.\n\n- Move them into core as prepareEdition({ task, week, options, provider, store, assets, settings }) and recordEdition({ task, week, text, store, ... }). The CLI's commands call them.\n- Add OPTIONS and EDITIONS descriptors as data:\n  - for each option: its flag, values, default, help text and the editions it applies to;\n  - for each edition: its name, the formats that allow it, and whether it is recordable or forward-looking.\n- Build helpText and parseArgs from the descriptors.\n- The website renders its controls from the same descriptors, so CLI-to-UI parity is enforced by data. --generate is the one CLI-only option, because the website never calls an AI."
lastModified: "2026-10-13T02:35:37.739Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
