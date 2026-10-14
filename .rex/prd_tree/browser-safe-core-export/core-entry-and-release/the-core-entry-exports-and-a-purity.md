---
id: "3f07f436-aa29-49ab-8caa-dce3307cc8b2"
level: "task"
title: "The core entry, exports and a purity guard"
status: "completed"
priority: "high"
startedAt: "2026-10-14T20:15:19.813Z"
completedAt: "2026-10-14T20:17:20.409Z"
endedAt: "2026-10-14T20:17:20.409Z"
resolutionType: "code-change"
resolutionDetail: "src/core/index.mjs, exports field, purity guard, packed-install test, check-pack required path, changelog. Commit fe01f9b."
acceptanceCriteria:
  - "import('fantasy-pressbox/core') works from a package installed from the packed tarball"
  - "The guard test fails when a node: import is added anywhere core reaches"
  - "The bin still works after npm pack and install"
  - "CHANGELOG.md notes the exports field and that importing internal files is no longer supported"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- Add the ESPN import API to the core entry: readSavedFiles, classifySaved, parseSavedFile, importedWeekBundle, leaguePageFreshness, staleLeagueNotice, espnImportLinks (src/espn/urls.mjs) and the error classes (EspnImportError, EspnStaleLeagueError, EspnShapeError). Do not export the ESPN client or anything that fetches from ESPN.\n- The purity guard also covers src/espn/: it fails on node: in any ESPN module core reaches.\n\nAdd src/core/index.mjs, re-exporting the browser-safe API:\n- league file: LEAGUE_FILE_SCHEMA_VERSION, newLeagueFile, parseLeagueFile, serializeLeagueFile, leagueFileFromWorkspace, createMemoryStore;\n- settings: OPTIONS, EDITIONS, resolveSettings, rankEmoji;\n- editions: openLeague, resolveWeek, prepareEdition, buildPrompt;\n- replies: splitPosts, checkPosts, extractJsonBlock, stripJsonBlock, formatPost, looksCollapsed, recordEdition, gradePredictions;\n- status: inspectLeague;\n- loadAssets.\n\nIn package.json, add exports: { \"./core\": \"./src/core/index.mjs\", \"./package.json\": \"./package.json\" }. This blocks imports of the package's internal files, which goes in the changelog.\n\nAdd a guard test modelled on tests/provider-boundary.test.mjs. It walks the static import graph from src/core/index.mjs and fails on any node: import, process or import.meta.url use, or any path reaching generate.mjs. scripts/check-pack.mjs confirms that src/core/ is in the tarball."
lastModified: "2026-10-14T20:17:20.436Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
