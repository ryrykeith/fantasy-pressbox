---
id: "d9f12e75-aeee-4f21-91be-c16a905f1cb7"
level: "task"
title: "Pass the player cache in"
status: "completed"
priority: "high"
startedAt: "2026-10-14T00:48:42.416Z"
completedAt: "2026-10-14T00:52:11.756Z"
endedAt: "2026-10-14T00:52:11.756Z"
resolutionType: "code-change"
resolutionDetail: "playerCache option on both clients; disk cache moved to src/diskPlayerCache.mjs; clients import nothing from node:"
acceptanceCriteria:
  - "sleeper/client.mjs imports nothing from node:"
  - "With the disk cache, refresh behaviour and --refresh-players are unchanged"
  - "Tests cover a cache hit, a stale entry and refresh: true, with a fake fetch"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- ESPN has merged. src/espn/client.mjs imports node:fs and node:path for its own daily player cache (data/cache/players-espn-<season>.json, PLAYER_CACHE_MAX_AGE_MS). Give createClient the same playerCache option in this task; acceptance now also requires src/espn/client.mjs to import nothing from node:.\n- src/espn/provider.mjs statically imports client.mjs and store.mjs, and src/providers.mjs imports both providers, so both clients sit on core's import graph. The ESPN client may stay in that graph once it is node-free, but core never runs the fetch route (task cb2fe5d0).\n\nsleeper/client.mjs caches the player list (about 5 MB, per Sleeper's docs) at data/cache/players-nfl.json for PLAYER_CACHE_MAX_AGE_MS.\n\n- Give createClient a playerCache option: async get(key) returning { value, savedAt } or null, and async set(key, value).\n- The CLI passes a disk cache with today's path and age rule. The website passes memory or IndexedDB.\n- Sleeper asks for the player list once a day at most, so the 24-hour rule lives in the client, not in the cache.\n- When feat/espn-football merges, its src/espn/client.mjs disk cache (it imports node:fs) moves to the same option."
lastModified: "2026-10-14T00:52:11.783Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
