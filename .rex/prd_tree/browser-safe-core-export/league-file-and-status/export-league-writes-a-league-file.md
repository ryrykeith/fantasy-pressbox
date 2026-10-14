---
id: "f1ab8dbb-f9f5-4c7e-8b29-fd9964cf38fc"
level: "task"
title: "export-league writes a league file over 20 MB that import-league and parseLeagueFile then refuse"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "serializeLeagueFile refuses a league file whose serialized text is larger than LEAGUE_JSON_LIMITS.maxBytes, with an error that names the size and the limit"
  - "export-league exits non-zero and writes no file when the league's file would exceed the limit"
  - "A test builds a league file just over the limit and asserts the refusal, and one just under it that parseLeagueFile reads back"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Decision (planner, 2026-10-14): take option 1 now, the check in serializeLeagueFile against LEAGUE_JSON_LIMITS.maxBytes. The final cap is settled in the release task (8574bb39). Do not change LEAGUE_JSON_LIMITS here.\n\nVerdict: should-fix (found in the adversarial review of task 345d826c, commit 224b14a).\n\nFailure scenario: serializeLeagueFile (src/leagueFile.mjs) never checks the size of the text it returns, and commandExportLeague (src/cli.mjs) writes it whatever its size. But parseLeagueFile reads through parseJsonSafely at LEAGUE_JSON_LIMITS (20 MB), and import-league refuses a file over LEAGUE_JSON_LIMITS.maxBytes before reading it. A full invented season is about 2.6 MB (scripts/measure-league-file.mjs), so a dynasty league with roughly 8 seasons of history exports \"successfully\" to a file that neither the CLI nor the website can ever read back. The user believes they have a backup and do not.\n\nReachable: `fantasy-pressbox export-league` on any league folder whose history serializes to more than 20 MB. Not reachable in tests today; no existing check covers it.\n\nOptions:\n1. (Recommended) serializeLeagueFile throws a LeagueFileError when the text exceeds LEAGUE_JSON_LIMITS.maxBytes, in plain words naming the size and the limit, so neither surface ever writes an unreadable file. Cheap: one check and one test. Risk: a large league cannot export at all until (2) or (3).\n2. Raise LEAGUE_JSON_LIMITS.maxBytes, once the release task sets the final caps from measurements (the website plan names 10 MB per file, which is lower still: that conflict needs the owner's decision).\n3. Let export-league write one file per season, or leave out raw for old seasons. Larger design change."
lastModified: "2026-10-14T20:21:50.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
