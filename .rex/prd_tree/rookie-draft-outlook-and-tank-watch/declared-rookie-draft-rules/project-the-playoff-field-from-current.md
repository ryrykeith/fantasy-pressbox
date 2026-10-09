---
id: "242bf555-772f-4e5c-8a27-18b440e58947"
level: "task"
title: "Project the playoff field from current standings"
status: "completed"
priority: "high"
startedAt: "2026-10-09T19:18:37.933Z"
completedAt: "2026-10-09T19:19:51.689Z"
endedAt: "2026-10-09T19:19:51.689Z"
resolutionType: "code-change"
resolutionDetail: "Added src/analysis/playoffField.mjs (projectPlayoffField, isRegularSeasonOver) built on a shared seededTeams in standings.mjs; 11 new tests."
acceptanceCriteria: []
description: "Draft order in this league depends on who makes the playoffs, which is not known until the regular season ends (the week before league.playoffWeekStart). Project it from current standings and label it as a projection.\n\n- Seeding: Sleeper's default (playoff_seed_type 0) is wins, then points-for. Use the league's playoff_teams for the cut.\n- Report the bubble explicitly: the last team in and the first team out, and what separates them (games, points-for).\n- After the regular season the projection becomes the actual field; say which one is being shown.\n\nACCEPTANCE\n- With 2026-10-09-shaped fixtures (four 3-1 teams, four 2-2, four 1-3), the field is the four 3-1 teams plus the two 2-2 teams with the most points-for, and the bubble is reported as the 6th seed against the 7th."
lastModified: "2026-10-09T19:19:51.702Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
