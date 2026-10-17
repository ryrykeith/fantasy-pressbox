---
id: "ed8fe94d-5014-49a8-83ba-f37c8a583758"
level: "task"
title: "Check the contents of every league file history entry"
status: "pending"
priority: "high"
tags:
  - "league-file"
  - "safe-input"
source: "website session brief 2026-10-17"
acceptanceCriteria:
  - "Each history kind has a check for the fields its readers use, with types and ranges, and the readers each check covers are named in a comment or the league file docs"
  - "The brief's repro (teams: \"not a list\") is refused with a LeagueFileError naming seasons.2026.snapshots.week-3.teams"
  - "A roster ID in rankings, predictions or editions that is not in that season's snapshots is refused, naming the field"
  - "Files written by 0.2.0, folders saved by 0.1.0 and imported, and unflagged pre-0.1.0 snapshots all still parse (a test for each, invented data only)"
  - "For each kind, a test corrupts one relied-on field and gets a refusal, not a TypeError"
  - "npm test passes"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "Owner decision 2026-10-17: for 0.2.1, after 0.2.0 ships. Found by the website session's review of main at e6458a2; the website plan (fantasy-pressbox-dev/docs/plans/package-core.md, \"Strict checks on everything uploaded\", item 7) asks for it.\n\nToday checkHistoryEntry (src/leagueFile.mjs:341) checks each entry's name and top-level shape. Only rankings, predictions and editions check a field or two, and snapshots checks only `week`. So `seasons.2026.snapshots[\"week-3\"] = { week: 3, teams: \"not a list\" }` is accepted (reproduced), and the steps that read it later fail with a TypeError instead of a refusal naming the field.\n\nAsk: give each history kind (snapshots, rankings, predictions, tankWatch, import, editions, and any other kind in the history table) a schema check for the fields its readers rely on, with types and ranges. Find those fields by reading every reader in src/pipeline.mjs, src/edition.mjs and src/analysis/, not from one example file. Also check that roster IDs referenced by rankings, predictions and editions exist in that season's snapshots. Refuse with a LeagueFileError naming the field.\n\nDo not refuse real history. A check must accept every shape a real writer has saved: files written by 0.2.0, folders saved by 0.1.0 and imported, and unflagged pre-0.1.0 snapshots (see efd4b19). Build fixtures for each from the writers and the invented cast, never from a real league. No schemaVersion bump unless the shape changes; this only refuses what no writer produces. Messages follow the no-echo rule from the sibling task \"Refusals never quote text from the league file\"."
lastModified: "2026-10-17T06:25:43.604Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
