---
id: "420d5654-2c0c-475c-8398-d463b9f02ff2"
level: "task"
title: "Provider interface, registry and LEAGUE_PROVIDER"
status: "completed"
priority: "high"
tags:
  - "providers"
  - "refactor"
  - "config"
blockedBy:
  - "8679cf98-a4c2-4529-84f4-c327eff08149"
  - "f49ef93c-9c9b-4217-923d-139c0f0ae55c"
  - "5c5b2132-9d39-434b-8b12-88f72d437fa6"
startedAt: "2026-10-12T04:31:09.716Z"
completedAt: "2026-10-12T04:38:11.350Z"
endedAt: "2026-10-12T04:38:11.350Z"
acceptanceCriteria:
  - "src/pipeline.mjs imports no src/sleeper/ module"
  - "An existing league folder with only SLEEPER_LEAGUE_ID works unchanged"
  - "New tests cover a misspelled LEAGUE_PROVIDER, both league IDs without LEAGUE_PROVIDER, and a saved bundle tagged with another provider; each asserts the message names the fix"
  - "LEAGUE_SEASON and POST_MAX_LENGTH take precedence over their SLEEPER_ fallbacks (tested)"
  - "The 671 existing tests pass, with only import-path changes"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "Put Sleeper behind a provider interface that the pipeline calls.\n\nADD\n- src/sleeper/provider.mjs, implementing the interface in docs/plans/espn-football.md §6:\n  - name, displayName, experimental (false)\n  - capabilities: futurePicks, taxi, guillotine and lastScoredWeek, all true for Sleeper\n  - playerIdSpace 'sleeper'\n  - fromConfig, lookupLeague, openLeague, fetchWeek, currentWeek, normalizeWeek\n- src/providers.mjs, a registry keyed by name and the only module allowed to import a provider directory.\n\nCONFIG (src/config.mjs)\n- Read LEAGUE_PROVIDER. Absent means 'sleeper'. A misspelling is refused at load, listing the valid values.\n- Return `config.league = { provider, id, season, secrets }`. Keep `config.leagueId` as an alias.\n- LEAGUE_SEASON wins over SLEEPER_SEASON, which is still read.\n- POST_MAX_LENGTH wins over SLEEPER_POST_MAX_LENGTH, which is still read.\n- If both SLEEPER_LEAGUE_ID and ESPN_LEAGUE_ID are set without LEAGUE_PROVIDER, refuse and name the key to add.\n\nPIPELINE (src/pipeline.mjs)\n- openLeague, captureWeek, resolveWeek and readSettledWeek go through the provider.\n- resolveWeek's source labels use provider.displayName.\n- captureWeek saves the fetchWeek output with `provider` added.\n- An untagged saved bundle reads as Sleeper, so existing league folders need no migration.\n- A bundle tagged with a different provider than the league's is refused, naming both.\n\nFORMAT (src/format.mjs)\nhasFutureDraftCapital, hasEliminations and their siblings also take the provider's capabilities. All are true for Sleeper, so nothing changes.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere.\n- .env is read into config, never into process.env.\n- No behaviour change for Sleeper."
lastModified: "2026-10-12T04:38:11.371Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
