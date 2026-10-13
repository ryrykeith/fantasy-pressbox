---
id: "f21d7c2e-5de7-4729-a6aa-7034b8038d02"
level: "task"
title: "Doctor for ESPN leagues"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "doctor"
  - "secrets"
blockedBy:
  - "37d2325f-fa67-4001-b9f1-2c9b8abbcf14"
  - "1206f11b-e5c1-4465-8ac5-126d5c1e7f59"
  - "6ea1284e-c25c-42e6-9e41-5a57f1737ae0"
acceptanceCriteria:
  - "Tests cover a public ESPN league, a private one with cookies, a private one without cookies (401 explanation), and a shape error"
  - "No cookie value is printed in any case"
  - "Sleeper doctor output is unchanged"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Make doctor (src/cli.mjs commandDoctor) explain an ESPN league. Part of PR 2 on feat/espn-football.\n\nDoctor shows:\n- the provider, with the experimental notice;\n- the league, season and team count;\n- the format, and whether it was declared or detected;\n- the scoring summary and settings that are not modelled;\n- the cookie status, masked: present or missing for each, never the value.\n\nERRORS\n- A 401 prints: 'private league: add ESPN_S2 and ESPN_SWID to .env (or refresh them if they worked before)', with where to find them.\n- An EspnShapeError prints the view and field, says ESPN may have changed its API, and points at docs/espn-data.md.\n\nEverything doctor printed before for Sleeper is unchanged.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- Never print a cookie value."
lastModified: "2026-10-13T00:06:08.856Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
