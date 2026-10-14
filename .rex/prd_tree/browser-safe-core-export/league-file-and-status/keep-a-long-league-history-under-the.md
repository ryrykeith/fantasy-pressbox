---
id: "584e0ea6-9630-4cad-83fe-078595de6563"
level: "task"
title: "Keep a long league history under the league file cap"
status: "pending"
priority: "medium"
acceptanceCriteria:
  - "A twelve-team league with ten invented seasons of history exports to league files that each stay under 10 MB (scripts/measure-league-file.mjs reports it)"
  - "Nothing the current season's editions read is dropped, and the dropped or split history is listed in the league file docs"
  - "import-league, parseLeagueFile and the website's reading round-trip the result; a file written by 0.2.0 still imports"
  - "A test fails if a full invented season grows past the per-season budget the change sets"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "Owner decision 2026-10-14: ship 0.2.0 with LEAGUE_JSON_LIMITS.maxBytes at 20 MB, then shrink the file before any league gets near it. Not part of 0.2.0; does not block the release.\n\nWhy: an invented 12-team season is about 2.6 MB as written (scripts/measure-league-file.mjs): snapshots about 1.26 MB and market values about 0.83 MB, roughly 80% of it. At 20 MB a dynasty league has about seven seasons before export-league refuses (e0608ec), and the website plan's 10 MB would be about three and a half. Saved ESPN pages are unmeasured and probably larger per week.\n\nOptions, in order of preference (pick after measuring, and say why):\n1. Leave market values out of past seasons, and keep only what later editions read from old snapshots (check every reader in src/pipeline.mjs and src/edition.mjs first).\n2. Write one league file per season (export-league writes a set; import-league and the website accept several).\n3. Both.\n\nMeasure an ESPN league too: add saved-page fixtures at realistic size to the measurement script. Invented data only. Bump the league file schemaVersion only if the shape changes, and keep reading v1."
lastModified: "2026-10-14T20:38:09.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
