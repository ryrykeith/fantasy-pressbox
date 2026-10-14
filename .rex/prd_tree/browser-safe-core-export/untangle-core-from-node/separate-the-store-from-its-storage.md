---
id: "c7c4e557-d1ee-4fae-9e4a-d76ce0fbfb3c"
level: "task"
title: "Separate the store from its storage"
status: "completed"
priority: "high"
startedAt: "2026-10-14T00:34:08.547Z"
completedAt: "2026-10-14T00:38:09.037Z"
endedAt: "2026-10-14T00:38:09.037Z"
resolutionType: "code-change"
resolutionDetail: "Store split into storeCore.mjs (methods + createMemoryStore, no node:), store.mjs (file back end), rankingGrades.mjs (pure helpers). openLeague/importSavedFiles/openProvider/espn fromConfig take a passed-in store; CLI passes the file store. Contract test runs on both back ends."
acceptanceCriteria:
  - "One contract test for the store methods runs against both the file and the memory back ends"
  - "pipeline.mjs imports nothing from node: and never calls createStore"
  - "Every existing test passes, and the CLI writes the same files as before for a league folder"
  - "The memory store's data serializes to plain JSON (no Maps, Dates or class instances)"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- Two modules create a store now, not one: src/pipeline.mjs:49 and src/espn/provider.mjs:128 (createImportSource: the ESPN import route reads saved pages through the store). Both must take a store passed in.\n- The store has a new kind, `import`: importedLeaguePath / saveImportedLeague / loadImportedLeague, at data/import/<season>/league.json. Both back ends and the contract test cover it.\n- Saved market snapshots now carry `idSpace` ('sleeper' or 'espn'). Keep it as is.\n\nsrc/store.mjs reads and writes data/<kind>/<season>/*.json directly, and pipeline.mjs calls createStore itself.\n\n- Keep the store's method set exactly as it is: raw, snapshots, rankings, predictions, market values, tank watch, loadTeamNameHistory and the rest.\n- Give it two back ends: the file back end the CLI uses today, and createMemoryStore(initial) for core, holding the same data as plain objects keyed by kind, season and file.\n- Move the pure helpers (withMovement, movementLabel, gradePredictions) to a module with no node: imports.\n- pipeline.mjs (openLeague and captureWeek) takes a store instead of creating one. The CLI passes the file store."
lastModified: "2026-10-14T00:38:09.058Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
