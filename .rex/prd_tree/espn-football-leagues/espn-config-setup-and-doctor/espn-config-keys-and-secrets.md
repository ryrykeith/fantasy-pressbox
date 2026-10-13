---
id: "37d2325f-fa67-4001-b9f1-2c9b8abbcf14"
level: "task"
title: "ESPN config keys and secrets"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "config"
  - "secrets"
blockedBy:
  - "e5169f1d-6c76-408d-95e9-a65b1cdb3fc9"
  - "b19b5d2b-6756-4289-a080-47e22661ef23"
acceptanceCriteria:
  - "ESPN_ROUTE parses import|fetch, defaults to import, and a misspelling is refused listing the valid values"
  - "Under the import route the cookies are never read, even when set (test)"
  - "Tests cover the missing-cookie refusal on the fetch route and that a public ESPN league needs no cookies"
  - "process.env never receives ESPN_S2 or ESPN_SWID from .env"
  - "The leak test finds neither fixture cookie value in data/, output/, stdout or stderr"
  - ".env.example documents ESPN_LEAGUE_ID, ESPN_ROUTE, ESPN_S2 and ESPN_SWID"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13): owner decision on the ESPN route\nManual import is the default route for ESPN, and the cookie fetch is an opt-in (the terms review: Disney Terms of Use §2.B(x) bars automated access). Add one non-secret key:\n- ESPN_ROUTE = import | fetch. Absent means import. A misspelling is refused at load, listing the valid values, like LEAGUE_PROVIDER.\n- config.league.route carries it.\n- ESPN_S2 and ESPN_SWID are read only when the route is fetch. Under import they are never read or used, even if set. The missing-cookie refusal applies only to a private league on the fetch route.\n- Add ESPN_ROUTE to .env.example. The comment says import is the default and fetch is automated access the user opts into under ESPN's terms.\n- The core epic's league-file allowlist (task 345d826c, on feat/browser-core) must hear about ESPN_ROUTE. It is non-secret; mention it in the PR description.\n\nRead the ESPN league keys into config, and treat the cookies as passwords. Part of PR 2 on feat/espn-football. Runs after the ESPN provider exists, so the leak test can run a real capture on fixtures.\n\nCHANGE\n- When LEAGUE_PROVIDER=espn, loadConfig (src/config.mjs) reads ESPN_LEAGUE_ID, ESPN_ROUTE, ESPN_S2 and ESPN_SWID into `config.league` (`{ provider, id, season, route, secrets }`).\n- Secrets are read from the league folder's .env into config, never into process.env (environmentWithFile already works this way).\n- On the fetch route, an ESPN league with only one of the two cookies is refused, naming the missing key.\n- A public league needs neither.\n- Add the keys to .env.example, with comments saying the cookies are passwords and never go anywhere but this file.\n\nTHE COOKIES ARE PASSWORDS. They are never:\n- printed or logged;\n- put into an error message;\n- saved in a raw bundle, a snapshot, the player cache or anything else under data/.\n\nAdd the leak test from docs/plans/espn-football.md §7. It runs a full ESPN capture and an edition through tests/fixtures/fake-espn-fetch.mjs, on the fetch route with known fixture cookie values, then searches data/, output/, stdout and stderr for those values.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data or real cookies anywhere."
lastModified: "2026-10-13T03:12:57.550Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
