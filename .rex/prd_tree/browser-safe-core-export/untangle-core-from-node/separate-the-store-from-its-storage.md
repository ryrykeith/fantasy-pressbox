---
id: "c7c4e557-d1ee-4fae-9e4a-d76ce0fbfb3c"
level: "task"
title: "Separate the store from its storage"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "One contract test for the store methods runs against both the file and the memory back ends"
  - "pipeline.mjs imports nothing from node: and never calls createStore"
  - "Every existing test passes, and the CLI writes the same files as before for a league folder"
  - "The memory store's data serializes to plain JSON (no Maps, Dates or class instances)"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "src/store.mjs reads and writes data/<kind>/<season>/*.json directly, and pipeline.mjs calls createStore itself.\n\n- Keep the store's method set exactly as it is: raw, snapshots, rankings, predictions, market values, tank watch, loadTeamNameHistory and the rest.\n- Give it two back ends: the file back end the CLI uses today, and createMemoryStore(initial) for core, holding the same data as plain objects keyed by kind, season and file.\n- Move the pure helpers (withMovement, movementLabel, gradePredictions) to a module with no node: imports.\n- pipeline.mjs (openLeague and captureWeek) takes a store instead of creating one. The CLI passes the file store."
lastModified: "2026-10-13T02:35:35.346Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
