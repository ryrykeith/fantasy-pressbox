---
id: "3f07f436-aa29-49ab-8caa-dce3307cc8b2"
level: "task"
title: "The core entry, exports and a purity guard"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "import('fantasy-pressbox/core') works from a package installed from the packed tarball"
  - "The guard test fails when a node: import is added anywhere core reaches"
  - "The bin still works after npm pack and install"
  - "CHANGELOG.md notes the exports field and that importing internal files is no longer supported"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Add src/core/index.mjs, re-exporting the browser-safe API:\n- league file: LEAGUE_FILE_SCHEMA_VERSION, newLeagueFile, parseLeagueFile, serializeLeagueFile, leagueFileFromWorkspace, createMemoryStore;\n- settings: OPTIONS, EDITIONS, resolveSettings, rankEmoji;\n- editions: openLeague, resolveWeek, prepareEdition, buildPrompt;\n- replies: splitPosts, checkPosts, extractJsonBlock, stripJsonBlock, formatPost, looksCollapsed, recordEdition, gradePredictions;\n- status: inspectLeague;\n- loadAssets.\n\nIn package.json, add exports: { \"./core\": \"./src/core/index.mjs\", \"./package.json\": \"./package.json\" }. This blocks imports of the package's internal files, which goes in the changelog.\n\nAdd a guard test modelled on tests/provider-boundary.test.mjs. It walks the static import graph from src/core/index.mjs and fails on any node: import, process or import.meta.url use, or any path reaching generate.mjs. scripts/check-pack.mjs confirms that src/core/ is in the tarball."
lastModified: "2026-10-13T02:35:41.899Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
