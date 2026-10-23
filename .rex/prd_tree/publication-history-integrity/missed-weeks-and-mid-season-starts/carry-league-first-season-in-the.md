---
id: "e9d3402d-36bb-4a75-ba1b-351149c2ddff"
level: "task"
title: "Carry LEAGUE_FIRST_SEASON in the league file"
status: "pending"
priority: "medium"
source: "follow-up from b9d2b37a (league age), 2026-10-23"
acceptanceCriteria:
  - "A folder with LEAGUE_FIRST_SEASON=2021 exported and imported again has LEAGUE_FIRST_SEASON=2021 in its .env, and export no longer lists it as left out"
  - "A league file written before the field existed still validates, with firstSeason read as null"
  - "A firstSeason that is not a year is refused, naming settings.firstSeason"
description: "LEAGUE_FIRST_SEASON (src/settings.mjs parseLeagueFirstSeason, config.leagueFirstSeason) is an operator declaration. It is not in LEAGUE_FILE_ENV_KEYS (src/leagueFile.mjs), so export-league drops it and lists it under 'Left out of the file from .env', and import-league writes a folder without it. A recreated or ESPN league then loses its declared age on a round trip. Add an optional settings.firstSeason (null when absent). Don't add it to the required SETTINGS_KEYS, which would make every existing schemaVersion 1 file invalid. Read it in settingsFromFolder and write it back in workspaceFromLeagueFile. The website builds its config from the file, so carry it through settingsLayers/config the same way. The cached chain (data/league-history/) deliberately stays out of the file: it is a cache."
lastModified: "2026-10-23T01:40:16.663Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
