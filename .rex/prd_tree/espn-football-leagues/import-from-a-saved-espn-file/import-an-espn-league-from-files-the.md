---
id: "3ab1ae1e-add6-445c-9089-d8042688ff87"
level: "task"
title: "Import an ESPN league from files the user saves"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "espnImportLinks builds exactly the addresses the client requests for the same league, season and week (shared code)"
  - "Importing saved league and week files built from the fixtures gives the same snapshot as the fake-fetch path"
  - "A file for another league ID, a non-object, a prototype key or a wrong shape is refused with an error naming the file"
  - "The import path never calls fetch (tested with a fetch that throws)"
  - "The parse and normalize modules the import path uses import nothing from node:"
  - "The README and doctor describe the manual route as the user's personal use under ESPN's terms, and name the private-league check as unverified"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "WHY\nOwner request, 2026-10-12, from a terms review done by the website session:\n- The Disney Terms of Use cover ESPN (disneytermsofuse.com/english/, last updated May 24, 2024).\n- §2.B(x) bars accessing or extracting the products \"using a robot, spider, script, or other automated means\".\n- §2.A limits use to personal, noncommercial use.\n- The client's cookie-based fetch (ESPN_S2, ESPN_SWID) is automated access.\n\nTHE MANUAL ROUTE\nThe user opens ESPN's own JSON address in their signed-in browser and saves the page. The package reads the saved file and never contacts ESPN. The website (fantasy-pressbox-dev) will offer the same route through the browser core, and it never contacts ESPN either.\n\nCopying is still a grey area: §2.B(ii) bars copying unless expressly permitted. Docs must describe this as the user's manual personal use, never as something ESPN permits.\n\nWHAT\n- espnImportLinks({ leagueId, season, weeks }) returns the addresses to open. Share the code with src/espn/client.mjs so the two can't drift:\n  - one league address with LEAGUE_VIEWS (mSettings, mTeam, mRoster, mDraftDetail), as provider.openLeague reads;\n  - one address per week with WEEK_VIEWS (mMatchupScore, mScoreboard, mSettings) and scoringPeriodId, as fetchWeek reads.\n- An import path that takes the saved text and records the week exactly as fetchWeek does: through the existing shape guards (src/espn/shape.mjs, refusing with EspnShapeError) and the normalizers, saving the raw bundle tagged provider espn.\n- A CLI command to import saved files; name it in this task (e.g. import-espn <file...>). doctor explains the manual route and prints the addresses to open.\n- Player names: rostered players come from mRoster. If the full player list is needed, it is one more saved file (players?view=players_wl).\n\nRULES\n- Treat saved files as untrusted. Enforce a size limit; the file must be a JSON object; refuse __proto__, constructor and prototype keys (see the core epic dfc42402, task \"Refuse hostile input in the parsers\"); and the league ID in the file must match ESPN_LEAGUE_ID.\n- Keep the parse and normalize code this path uses free of node: imports, so the browser core can reuse it.\n- Which route is the default (manual import or cookie fetch) is the owner's decision. Ask before changing setup's default.\n- No test league exists. Build against tests/fixtures/mock-espn-league.mjs with the invented cast.\n- Whether a signed-in browser shows a private league's JSON on a plain visit is UNVERIFIED until a test league exists. Label it so in docs/espn-data.md."
lastModified: "2026-10-13T03:03:21.453Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
