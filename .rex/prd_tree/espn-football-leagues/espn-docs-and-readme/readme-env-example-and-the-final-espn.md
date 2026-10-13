---
id: "6d7b5372-88a4-4cb6-9dda-746313d390f8"
level: "task"
title: "README, .env.example and the final ESPN docs"
status: "pending"
priority: "medium"
tags:
  - "espn"
  - "docs"
blockedBy:
  - "5c20b018-656e-4021-b55e-99712e757d53"
  - "9635fa99-8c5c-4ed1-941f-1c46b4702235"
  - "00670e64-4f37-4e38-ad77-a8b68fcf00f8"
  - "f21d7c2e-5de7-4729-a6aa-7034b8038d02"
  - "3ab1ae1e-add6-445c-9089-d8042688ff87"
  - "fe0d9b58-a0f3-4ab1-a85e-46086c9d5bd9"
  - "7c03bf42-203d-4f75-b994-29c5b43f9d44"
acceptanceCriteria:
  - "A reader can set up an ESPN league on the import route, or opt into the fetch route, from the README alone"
  - "The README presents import as the default and discloses the fetch route as automated access against ESPN's terms, at the user's own risk"
  - "README states the cookies are passwords and ESPN support is experimental"
  - "No real league data in any doc; CHANGELOG.md is untouched"
  - "The PR description lists the user-facing changes, including ESPN_ROUTE"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13): owner decisions from the terms review\n- ESPN ROUTES: the README presents the manual import (ESPN_ROUTE=import) as the default: save ESPN's JSON pages in your league folder, then import them. Describe it as the user's own manual personal use, never as something ESPN permits; saving a page is still copying under Disney Terms of Use §2.B(ii). Say whether a private league's page shows on a plain signed-in visit is unverified.\n- THE COOKIE FETCH (ESPN_ROUTE=fetch) is an opt-in, in its own section with a plain disclosure:\n  - it's automated access to ESPN, which Disney's Terms of Use bar (§2.B(x); disneytermsofuse.com/english/, May 24, 2024);\n  - the user chooses it for their own league, at their own risk;\n  - the cookies are passwords.\n  Don't suggest it's sanctioned, and don't call it illegal either: it's against ESPN's terms.\n- DATA SOURCES: mention that bye weeks come from nflverse (CC BY 4.0) and market values from FantasyCalc (non-commercial, credited in posts). Those two tasks write their own README lines; keep them consistent.\n- .env.example: also document ESPN_ROUTE.\n\nBring the operator-facing docs up to date for ESPN. This is the last task of PR 2 on feat/espn-football.\n\nREADME\n- choosing a provider;\n- ESPN setup, by route as above; for the fetch route, how to copy the espn_s2 and SWID cookies, and that they are passwords that live only in the league folder's .env;\n- the experimental notice;\n- what an ESPN league gets and doesn't get, linking the coverage matrix in docs/espn-data.md.\n\nALSO\n- .env.example: confirm the ESPN keys (ESPN_LEAGUE_ID, ESPN_ROUTE, ESPN_S2, ESPN_SWID), LEAGUE_PROVIDER, LEAGUE_SEASON and POST_MAX_LENGTH are documented.\n- docs/espn-data.md: a final consistency pass.\n- docs/architecture.md: ESPN in the module map.\n- The PR description lists the user-facing changes, so the release notes can be written from it. It names ESPN_ROUTE for the core epic's allowlist (task 345d826c).\n\nDo not add an Unreleased heading to CHANGELOG.md. It is written at release time (RELEASING.md).\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: example IDs and team names are invented."
lastModified: "2026-10-13T03:13:44.298Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
