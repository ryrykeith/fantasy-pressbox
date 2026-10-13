---
id: "d9f12e75-aeee-4f21-91be-c16a905f1cb7"
level: "task"
title: "Pass the player cache in"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "sleeper/client.mjs imports nothing from node:"
  - "With the disk cache, refresh behaviour and --refresh-players are unchanged"
  - "Tests cover a cache hit, a stale entry and refresh: true, with a fake fetch"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "sleeper/client.mjs caches the player list (about 5 MB, per Sleeper's docs) at data/cache/players-nfl.json for PLAYER_CACHE_MAX_AGE_MS.\n\n- Give createClient a playerCache option: async get(key) returning { value, savedAt } or null, and async set(key, value).\n- The CLI passes a disk cache with today's path and age rule. The website passes memory or IndexedDB.\n- Sleeper asks for the player list once a day at most, so the 24-hour rule lives in the client, not in the cache.\n- When feat/espn-football merges, its src/espn/client.mjs disk cache (it imports node:fs) moves to the same option."
lastModified: "2026-10-13T02:35:37.204Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
