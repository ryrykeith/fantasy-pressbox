---
id: "ace1180a-bb08-4788-98bc-ad780b5d9ffb"
level: "task"
title: "Make the settings layer pure"
status: "completed"
priority: "high"
startedAt: "2026-10-14T00:38:09.740Z"
completedAt: "2026-10-14T00:43:16.300Z"
endedAt: "2026-10-14T00:43:16.300Z"
resolutionType: "code-change"
resolutionDetail: "Pure settings.mjs + resolveSettings with tests; loadConfig output unchanged (1050 tests pass). Criterion 1 only partly met: remaining node reach in promptContext (prompt files, PACKAGE_ROOT) and pipeline (loadByeWeekTable) deferred to the assets task."
acceptanceCriteria:
  - "promptContext.mjs and pipeline.mjs import no module that uses node:, process or import.meta.url"
  - "loadConfig returns the same object as before for every existing test workspace"
  - "resolveSettings has tests for the replaceKeys tables (ranking_emoji, awards, banned_phrases) and for the table-replaced-by-a-value error"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- config.mjs gained ESPN settings since this task was written. Also move the pure ones: LEAGUE_PROVIDER_KEY, ESPN_ROUTE_KEY, ESPN_ROUTES, DEFAULT_ESPN_ROUTE and parseEspnRoute (LEAGUE_ID_KEYS and parseLeagueProvider are already listed).\n- loadConfig now returns config.league = { provider, id, season, route, secrets }. The cookies (ESPN_S2, ESPN_SWID) are read only when route is fetch and live only in config.league.secrets. resolveSettings must never carry secrets: they stay in the CLI's loadConfig.\n- The generic keys LEAGUE_SEASON and POST_MAX_LENGTH win over SLEEPER_SEASON and SLEEPER_POST_MAX_LENGTH; keep that.\n\nconfig.mjs mixes pure helpers with .env, disk and process reads, and promptContext.mjs and pipeline.mjs import it.\n\n- Move the pure parts into a module with no node: imports: DEFAULT_EDITORIAL, deepMerge, validateRankingWeights, resolveRankingWeights, resolveFutureStockWeights, rankEmoji, parseLeagueProvider, LEAGUE_ID_KEYS, and the parse* checks config.mjs imports.\n- Add resolveSettings({ defaults, league, overrides }), which merges plain objects the way loadConfig does today, replaceKeys tables included.\n- loadConfig stays in config.mjs for the CLI. It reads .env and the YAML files, then calls resolveSettings. PACKAGE_ROOT stays CLI-only."
lastModified: "2026-10-14T00:43:16.324Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
