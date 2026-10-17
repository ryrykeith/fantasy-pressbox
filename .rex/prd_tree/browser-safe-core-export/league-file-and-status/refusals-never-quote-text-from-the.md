---
id: "958e717d-a00f-4db8-b0d8-04fcaedbe0f7"
level: "task"
title: "Refusals never quote text from the league file"
status: "pending"
priority: "high"
tags:
  - "league-file"
  - "safe-input"
  - "release-0.2.0"
source: "website session brief 2026-10-17"
acceptanceCriteria:
  - "No LeagueFileError or safe-input refusal message contains more than 40 consecutive characters taken from the file, for keys, entry names, season keys, kind, edition names and .env values"
  - "Control characters from the file never appear in a message"
  - "A file that is not JSON is refused with a plain message that quotes none of it"
  - "A refusal still names the field, so a person can find it (a cut segment is marked as cut)"
  - "A test feeds each echo path in the brief (kind, a 100,000-character unknown key, a long entry name, a long season key, '<script>' as the whole file, a bad .env value) and asserts the message length and that the input text is absent"
  - "npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Owner decision 2026-10-17: this blocks the 0.2.0 release (PR #11 waits for it), so 0.2.0 keeps src/lib/safeInput.mjs's promise that a refusal \"never echoes a value from the file\". Found by the website session's review of main at e6458a2.\n\nEcho paths, all reproduced on release/0.2.0:\n- validateLeagueFile puts JSON.stringify(value.kind) in its message: `kind is \"<img src=x onerror=alert(1)>\"`.\n- onlyKeys (src/leagueFile.mjs:159) names an unknown key verbatim; a 300-character key gives a 446-character message, and keys can be up to 100,000 characters.\n- Every field path built from file keys echoes them: a season key or a history entry name (seasons.<key>.snapshots.<name>) appears in full before the name is checked.\n- parseLeagueFile (src/leagueFile.mjs:481) passes on JSON.parse's message, which quotes the input: `Unexpected token '<', \"<script>al\"... is not valid JSON`.\n- src/leagueFile.mjs:697 quotes a .env value: `${key} in .env is \"${value}\"`.\n- Also check src/leagueFile.mjs:375 (`names \"${task}\"`) and any other message built from file text, in leagueFile.mjs and safeInput.mjs.\n\nFix in one place where possible: LeagueFileError (or the helper that joins a field path) cuts each path segment to its first 40 characters, removes control characters, and marks a cut with an ellipsis, so every caller is covered. Drop `kind` from its message (say what was expected). Replace JSON.parse's text with a plain message, for example \"is not JSON (check it was saved as a league file)\". The website renders messages as plain text, so this is not a hole there; it is the module's own promise and message length. Invented cast and the fake league ID 000000000000000000 only in tests."
lastModified: "2026-10-17T06:25:42.763Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
