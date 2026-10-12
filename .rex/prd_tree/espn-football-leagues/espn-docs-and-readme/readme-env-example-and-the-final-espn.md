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
acceptanceCriteria:
  - "A reader can set up a public or a private ESPN league from the README alone"
  - "README states the cookies are passwords and ESPN support is experimental"
  - "No real league data in any doc; CHANGELOG.md is untouched"
  - "The PR description lists the user-facing changes"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Bring the operator-facing docs up to date for ESPN. This is the last task of PR 2 on feat/espn-football.\n\nREADME\n- choosing a provider;\n- ESPN setup for public and private leagues, including how to copy the espn_s2 and SWID cookies, and that they are passwords that live only in the league folder's .env;\n- the experimental notice;\n- what an ESPN league gets and doesn't get, linking the coverage matrix in docs/espn-data.md.\n\nALSO\n- .env.example: confirm the ESPN keys, LEAGUE_PROVIDER, LEAGUE_SEASON and POST_MAX_LENGTH are documented.\n- docs/espn-data.md: a final consistency pass.\n- docs/architecture.md: ESPN in the module map.\n- The PR description lists the user-facing changes, so the release notes can be written from it.\n\nDo not add an Unreleased heading to CHANGELOG.md. It is written at release time (RELEASING.md).\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere: example IDs and team names are invented."
lastModified: "2026-10-12T03:17:38.236Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
