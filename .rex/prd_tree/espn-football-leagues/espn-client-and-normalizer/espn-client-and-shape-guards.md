---
id: "09aca277-0e30-4d6d-8e52-0f758311de1d"
level: "task"
title: "ESPN client and shape guards"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "secrets"
blockedBy:
  - "4de14992-c01a-4cd3-b090-9ccaa52e8451"
  - "420d5654-2c0c-475c-8398-d463b9f02ff2"
acceptanceCriteria:
  - "Tests with tests/fixtures/fake-espn-fetch.mjs cover 401, 404, 429 and a malformed response"
  - "No cookie value appears in any error message, log line or cached file (test searches for the fixture values)"
  - "A shape error names the view and field path and never defaults the value"
  - "No test touches the network"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Write the ESPN HTTP client and the guards that make a wrong shape guess fail loudly. Part of PR 2 on feat/espn-football.\n\nCLIENT (src/espn/client.mjs)\nHTTP only, modelled on src/sleeper/client.mjs:\n- the host and views from docs/espn-data.md, with several view= parameters combined per request;\n- scoringPeriodId for a week, and the x-fantasy-filter header for players;\n- retries, and backoff on 429;\n- a daily player cache at data/cache/players-espn-<season>.json.\n\nCookies come only from config.league.secrets and are sent only as a Cookie header to the ESPN host.\n\nRefusals name the fix:\n- 401: private league; add ESPN_S2 and ESPN_SWID, or refresh them if they worked before;\n- 404: no such league or season.\n\nSHAPE GUARDS (src/espn/shape.mjs)\nCheck every field the normalizers will read. A missing field or a wrong type throws EspnShapeError, naming the view, the field path and docs/espn-data.md. A missing number never defaults to 0. A missing list never defaults to empty, unless docs/espn-data.md says ESPN omits it when empty.\n\nWHY\nNo test league exists, so every league-view shape is a best guess. A wrong guess must become a loud error, not a wrong fact.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- ESPN cookies are passwords: never printed, logged, put in an error or written under data/."
lastModified: "2026-10-12T03:16:05.622Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
