---
id: "1ffddde2-86cf-443f-aa89-6639f367c106"
level: "task"
title: "Fix grade in guillotine leagues: open every CLI league with the bye table"
status: "completed"
priority: "critical"
startedAt: "2026-10-14T15:05:17.786Z"
completedAt: "2026-10-14T15:06:56.428Z"
endedAt: "2026-10-14T15:06:56.428Z"
resolutionType: "code-change"
resolutionDetail: "All six openLeague calls in cli.mjs go through openFolderLeague (store + disk assets); new fake Sleeper API fixture and CLI guillotine grade test; commit bb40e9c."
acceptanceCriteria:
  - "grade --week <n> in a guillotine league folder exits 0 through the CLI, where today it throws 'This step needs the shipped bye-week table'"
  - "Every openLeague call in src/cli.mjs passes assets, through one helper"
  - "A new end-to-end CLI test drives a Sleeper guillotine league through a preloaded fake Sleeper API, fails before the fix and passes after"
  - "The two spacing slips in cli.mjs are fixed; npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Regression from the store and assets refactors (c7c4e557, b36d9dee), found in review 2026-10-14.\n\ncommandGrade (src/cli.mjs, around line 1462) opens the league with openLeague(config, { store: fileStore(config) }) and no assets, then calls captureWeek. captureWeek needs the bye-week table in two cases: bye exposure in a guillotine league (pipeline.mjs, upcomingByeExposure), and an ESPN week's lazy byeWeeks for a player with no points. byeTable(assets, season) now throws 'This step needs the shipped bye-week table: pass assets, loadAssets(readText) (src/assets.mjs).' So grade fails in a guillotine league whenever it captures the week. commandRecord (around line 1423) also opens without assets; it does not capture today, but it should match.\n\nFix:\n- Add one CLI helper next to fileStore and diskAssets, e.g. openFolderLeague(config, options = {}) = openLeague(config, { store: fileStore(config), assets: diskAssets(config), ...options }), and route all six openLeague calls in cli.mjs through it, so a command can no longer open a league without the bye table.\n- Fix two spacing slips in cli.mjs: 'const { week } =await resolveWeek' in commandFetch and 'const offset =FORWARD_LOOKING_TASKS' in commandRecord.\n\nTest: no Sleeper command is tested end to end through the CLI today (only ESPN, via tests/fixtures/fake-espn-fetch.mjs). Add a preloaded fake Sleeper API fixture that answers every endpoint src/sleeper/client.mjs calls (state, league, users, rosters, players/nfl, matchups/<week>, transactions/<week>, traded_picks, drafts) from the invented league in tests/fixtures/week-data-league.mjs (RAW_PLAYERS, RAW_USERS, RAW_ROSTERS, RAW_WEEKS), and refuses anything else. Then run 'grade --week 1' on a league folder with LEAGUE_FORMAT=guillotine, the way tests/espn-editions.test.mjs's runCli does (clear the league env keys, --workspace). It must exit 0 and must not say 'bye-week table'. Confirm the test fails before the fix. Invented data only; nothing touches the network."
lastModified: "2026-10-14T15:06:56.458Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
