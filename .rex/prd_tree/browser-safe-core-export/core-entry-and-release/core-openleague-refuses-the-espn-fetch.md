---
id: "e32c99dd-0ae6-4a11-a530-fdc6e2d0ccc6"
level: "task"
title: "Core openLeague refuses the ESPN fetch route off the command line"
status: "completed"
priority: "high"
startedAt: "2026-10-14T20:22:36.281Z"
completedAt: "2026-10-14T20:29:10.749Z"
endedAt: "2026-10-14T20:29:10.749Z"
resolutionType: "code-change"
resolutionDetail: "src/edition.mjs openLeagueOnSurface(config, {surface='core', ...}) runs refuseCliOnly then pipeline openLeague; core exports it as openLeague; prepareEdition and the CLI's openFolderLeague (surface 'cli') open through it. New tests/core-espn-fetch-refusal.test.mjs; core-purity.test.mjs pins every provider-opening call in core's graph."
acceptanceCriteria:
  - "openLeague called from core (any surface but 'cli') on an ESPN league with ESPN_ROUTE=fetch throws before any client is created or any request made, naming the reason in the same words as refuseCliOnly"
  - "The CLI's fetch route (fetch, editions, doctor, grade, record) works as before; tests/espn-*.test.mjs pass unchanged"
  - "A test imports openLeague from src/core/index.mjs with an ESPN fetch-route league file's settings and a fetch that throws, and asserts the refusal and that the fetch was never called"
  - "No other core export can reach createClient in src/espn/client.mjs for the fetch route; the guard test says so"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "Found in review of 3f07f436 (core entry, fe01f9b), 2026-10-14.\n\nOwner decision 2026-10-13: core supports ESPN on the IMPORT route only; the cookie fetch stays CLI-only. prepareEdition enforces this (refuseCliOnly in src/edition.mjs, surface defaults to 'core'), but src/core/index.mjs also exports openLeague and resolveWeek from src/pipeline.mjs directly. openLeague takes no surface: with settings whose league.provider is 'espn' and route 'fetch' (a league file can carry espnRoute: 'fetch', see src/leagueFile.mjs settingsFromFolder), the ESPN provider's fromConfig (src/espn/provider.mjs around line 362) builds the fetch client and the website would contact ESPN.\n\nFix, in whichever shape is smallest and keeps one rule:\n- Give openLeague (and anything else on core's path that opens a provider, e.g. inspectLeague, resolveWeek's provider lookup) a surface option that defaults to 'core', and refuse the fetch route unless surface is 'cli', reusing refuseCliOnly's rule and wording; the CLI's openFolderLeague passes surface 'cli'. Or stop exporting openLeague/resolveWeek from core if prepareEdition and inspectLeague cover what the website needs, and guard those.\n- Check inspectLeague (src/inspect.mjs) for the same path.\n\nDo not change the CLI's behaviour. Invented data only (tests/fixtures/mock-espn-league.mjs); nothing touches the network."
lastModified: "2026-10-14T20:29:10.771Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
