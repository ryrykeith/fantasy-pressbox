---
id: "00670e64-4f37-4e38-ad77-a8b68fcf00f8"
level: "task"
title: "Setup for ESPN leagues"
status: "completed"
priority: "high"
tags:
  - "espn"
  - "setup"
  - "secrets"
blockedBy:
  - "37d2325f-fa67-4001-b9f1-2c9b8abbcf14"
  - "26c7029a-5ab3-4670-a8b9-4df17cf8ad2b"
  - "3ab1ae1e-add6-445c-9089-d8042688ff87"
startedAt: "2026-10-13T03:38:30.350Z"
completedAt: "2026-10-13T03:45:10.473Z"
endedAt: "2026-10-13T03:45:10.473Z"
acceptanceCriteria:
  - "Setup offers import (default) and fetch for ESPN; the fetch route shows the terms notice and needs an explicit yes"
  - "On the import route setup makes no network request (tested with a fetch that throws) and asks for no cookies"
  - "src/init.mjs tests cover ESPN URL and bare-ID parsing, including a URL with several numbers"
  - "The setup piping test runs the import path and the public and private fetch paths against fixtures"
  - "Guillotine is not offered for ESPN"
  - "The finished ESPN folder loads with loadConfig, and no cookie value is printed"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13): owner decision on the ESPN route\nManual import is the DEFAULT; the cookie fetch is an opt-in (ESPN_ROUTE, from the config task). For ESPN, setup asks which route, defaulting to import:\n- IMPORT (default):\n  - Setup never contacts ESPN.\n  - It prints the league address to open (espnImportLinks, from the import task) and tells the user to save the page into their league folder.\n  - It asks for the saved file's path and reads it through the import path to show the league back: name, size, season.\n  - No cookies are asked for. It writes ESPN_ROUTE=import.\n- FETCH (opt-in): before anything else, show a plain notice and require an explicit yes:\n  - this is automated access to ESPN, which Disney's Terms of Use (§2.B(x)) bar;\n  - it's the user's choice, for their own league, at their own risk;\n  - the cookies are passwords.\n  Then proceed as below and write ESPN_ROUTE=fetch.\nThe paragraphs below describe the FETCH route; on the import route, skip the cookie and lookupLeague steps.\n\nLet init set up an ESPN league. Part of PR 2 on feat/espn-football.\n\nSetup (setup.mjs, with the testable decisions in src/init.mjs) asks Sleeper or ESPN first. For ESPN:\n- Accept a pasted league URL or a bare ID, through a tested extractEspnLeague in src/init.mjs. It reads leagueId=, and seasonId= if present. Sleeper's extractLeagueId regex (\\d{6,}) is not reused: an ESPN URL carries other numbers too.\n- Ask whether the league is public or private.\n- For a private league, explain in plain words how to copy the espn_s2 and SWID cookies from the browser while signed in to ESPN. Accept them through askSecret, shown masked with maskSecret.\n- Confirm the league against ESPN with the provider's lookupLeague before saving. On a 401, explain that the league is private or the cookies are wrong.\n- Show the league back (name, size, season) with the experimental notice: ESPN support is built from public descriptions of an unofficial API and has not been checked against a live league.\n- Offer redraft or dynasty, explaining that a keeper league counts as redraft. Do not offer guillotine.\n- Show the scoring summary back, as for Sleeper.\n- Write LEAGUE_PROVIDER=espn, ESPN_LEAGUE_ID, ESPN_ROUTE, and (fetch route only) ESPN_S2 and ESPN_SWID through renderEnv.\n\nRe-running setup on an ESPN folder keeps the existing answers as defaults, backs up .env first, and refuses to replace a different league without asking, exactly as the Sleeper path does.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data or cookies anywhere, tests included.\n- Cookies never go anywhere except .env."
lastModified: "2026-10-13T03:45:10.539Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
