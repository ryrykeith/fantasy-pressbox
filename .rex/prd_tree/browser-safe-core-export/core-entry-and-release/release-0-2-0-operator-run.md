---
id: "8574bb39-9802-4859-abd4-ee56b7d1821c"
level: "task"
title: "Release 0.2.0 (operator-run)"
status: "blocked"
priority: "high"
blockedBy:
  - "e32c99dd-0ae6-4a11-a530-fdc6e2d0ccc6"
  - "d377c5cf-7300-4868-a344-db6938170ce7"
  - "f1ab8dbb-f9f5-4c7e-8b29-fd9964cf38fc"
  - "de9b5079-6bef-4f37-9dc6-3b6176a2e8a1"
  - "1db97321-028c-4ba3-960d-4c33cb30f144"
acceptanceCriteria:
  - "fantasy-pressbox 0.2.0 is on npm"
  - "The jsDelivr URL serves the core entry as application/javascript"
description: "READ FIRST (2026-10-15): the owner added four epics to 0.2.0: 'Ranking presets and a team strength rating', 'Rivalries', 'Five-year plan' and 'Sleeper basketball, first flight' (plans in docs/plans/football-settings-rivalries-five-year-plan.md and docs/plans/sleeper-basketball.md). Release after all four merge; their features belong in the release notes, with basketball labelled experimental.\n\nFor the owner. Once every other task in this epic is complete, publish 0.2.0 following RELEASING.md, then check that jsDelivr serves https://cdn.jsdelivr.net/npm/fantasy-pressbox@0.2.0/src/core/index.mjs as application/javascript.\n\nAn autonomous run must never publish to npm.\n\nRelease notes to include (from fe01f9b's CHANGELOG entry, removed because CHANGELOG is written at release): (1) Browser-safe core entry: fantasy-pressbox/core exports the league file, settings, edition preparation, prompt building, reply checks, status report and ESPN saved-page import, with no node: imports and no AI call; a guard test keeps it that way; the ESPN cookie fetch stays CLI-only. (2) exports field: package.json now declares exports, with only fantasy-pressbox/core and fantasy-pressbox/package.json. Importing fantasy-pressbox/src/... is no longer supported and fails with ERR_PACKAGE_PATH_NOT_EXPORTED; the fantasy-pressbox command is unaffected.\n\nLeague-file size cap: DECIDED 2026-10-14, ship 0.2.0 at 20 MB (LEAGUE_JSON_LIMITS.maxBytes as it is). Shrinking the file is follow-up task 584e0ea6-9630-4cad-83fe-078595de6563, which does not block this release. Note from review 2026-10-14: ESPN_IMPORT_LIMITS.maxStringLength (20,000) is unchecked against real pages; the live check b68a41d0 should confirm it."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
