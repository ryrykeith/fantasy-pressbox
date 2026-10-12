---
id: "00670e64-4f37-4e38-ad77-a8b68fcf00f8"
level: "task"
title: "Setup for ESPN leagues"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "setup"
  - "secrets"
blockedBy:
  - "37d2325f-fa67-4001-b9f1-2c9b8abbcf14"
  - "26c7029a-5ab3-4670-a8b9-4df17cf8ad2b"
acceptanceCriteria:
  - "src/init.mjs tests cover ESPN URL and bare-ID parsing, including a URL with several numbers"
  - "The setup piping test runs the public and private ESPN paths against tests/fixtures/fake-espn-fetch.mjs"
  - "Guillotine is not offered for ESPN"
  - "The finished ESPN folder loads with loadConfig, and no cookie value is printed"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Let init set up an ESPN league. Part of PR 2 on feat/espn-football.\n\nSetup (setup.mjs, with the testable decisions in src/init.mjs) asks Sleeper or ESPN first. For ESPN:\n- Accept a pasted league URL or a bare ID, through a tested extractEspnLeague in src/init.mjs. It reads leagueId=, and seasonId= if present. Sleeper's extractLeagueId regex (\\d{6,}) is not reused: an ESPN URL carries other numbers too.\n- Ask whether the league is public or private.\n- For a private league, explain in plain words how to copy the espn_s2 and SWID cookies from the browser while signed in to ESPN. Accept them through askSecret, shown masked with maskSecret.\n- Confirm the league against ESPN with the provider's lookupLeague before saving. On a 401, explain that the league is private or the cookies are wrong.\n- Show the league back (name, size, season) with the experimental notice: ESPN support is built from public descriptions of an unofficial API and has not been checked against a live league.\n- Offer redraft or dynasty, explaining that a keeper league counts as redraft. Do not offer guillotine.\n- Show the scoring summary back, as for Sleeper.\n- Write LEAGUE_PROVIDER=espn, ESPN_LEAGUE_ID, ESPN_S2 and ESPN_SWID through renderEnv.\n\nRe-running setup on an ESPN folder keeps the existing answers as defaults, backs up .env first, and refuses to replace a different league without asking, exactly as the Sleeper path does.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data or cookies anywhere, tests included.\n- Cookies never go anywhere except .env."
lastModified: "2026-10-12T03:17:12.840Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
