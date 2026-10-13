---
id: "fe0d9b58-a0f3-4ab1-a85e-46086c9d5bd9"
level: "task"
title: "Build the bye-week table from nflverse's CC-BY-4.0 schedule instead of ESPN"
status: "pending"
priority: "medium"
tags:
  - "bye-weeks"
  - "terms"
  - "data-sources"
acceptanceCriteria:
  - "scripts/fetch-bye-weeks.mjs builds the table from nflverse games.csv (download or a local file argument) and no longer contacts ESPN"
  - "The YAML header credits nflverse with the CC BY 4.0 licence link and a note of changes"
  - "LA maps to LAR through src/nflTeams.mjs; an unknown code is still refused"
  - "Tests use a local CSV fixture and never touch the network; the 32-teams, one-bye-each validation still refuses a bad table"
  - "docs/architecture.md no longer says the table comes from ESPN"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Switch scripts/fetch-bye-weeks.mjs from ESPN's NFL scoreboard to nflverse's schedule.\n\nWHY\n- The script reads ESPN's scoreboard with a script, which Disney's Terms of Use §2.B(x) bar.\n- nflverse publishes the NFL schedule under CC-BY-4.0. That allows reuse, including commercial use, with credit, a licence link and a note of changes.\n- Owner decision, 2026-10-13.\n\nSOURCE (checked 2026-10-13)\n- Release: https://github.com/nflverse/nflverse-data/releases/tag/schedules. Asset: games.csv at https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.\n- Licence: the nflverse/nflverse-data repository declares CC-BY-4.0. Use the release asset, not raw nflverse/nfldata, which has no licence file.\n- Columns used: season, game_type, week, away_team, home_team. The full header begins game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,...\n- Regular season is game_type REG, weeks 1-18. For 2026: 272 REG games and 32 teams, each with exactly one week without a game.\n- Team codes: nflverse spells the Rams LA; the committed table and Sleeper use LAR. All other 31 codes match the committed table, including WAS. With LA mapped to LAR, nflverse's 2026 byes match config/bye-weeks.2026.yml exactly (checked 2026-10-13).\n\nCHANGE\n- The script downloads games.csv (or reads a local copy given as an argument, which the tests use) and builds the same table for a season, with the same validation: 32 teams, exactly one bye each, or it refuses.\n- Team codes go through src/nflTeams.mjs. Add an nflverse-to-canonical alias for LA to LAR. Drop the ESPN scoreboard aliases from the script, but keep any alias src/espn/ needs, because ESPN's fantasy API still spells Washington WSH.\n- The YAML header credits the source:\n  - Source: nflverse schedule data (games.csv, nflverse-data 'schedules' release), CC BY 4.0, https://creativecommons.org/licenses/by/4.0/;\n  - Changes: reduced to each team's bye week, team codes mapped to this project's (LA to LAR).\n- Update docs/architecture.md ('Bye-week exposure') and the script's comments, which say ESPN.\n- Don't regenerate config/bye-weeks.2026.yml in this task, and don't fetch from the network in tests. The operator regenerates by hand and diffs; the byes must be identical, and only the header may change.\n\nTests: a fixture games.csv slice with invented rows (real team codes are fine; no scores needed) covering the LA alias, a team with two missing weeks (refused), and a non-REG game ignored.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere (NFL schedules are public, not league data)."
lastModified: "2026-10-13T03:13:28.653Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
