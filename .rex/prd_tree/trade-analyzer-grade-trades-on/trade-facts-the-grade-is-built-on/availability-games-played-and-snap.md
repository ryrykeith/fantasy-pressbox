---
id: "9b39f40f-02b3-48c6-b2bc-d4b97c1d00e3"
level: "task"
title: "Availability: games played and snap share over two seasons"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A player who missed two of six games shows 4 of 6 played, the missed weeks, and points per game played"
  - "A played game with 0 points counts as played; a bye is not counted as missed"
  - "Snap share is averaged over games played only"
  - "Last season and this season are reported separately"
  - "An ESPN league gets an unavailable entry, not zeros"
description: "Builds on 'Sleeper player stats and projections, cached per league'. Points per rostered game (pointsPerGame, src/analysis/transactions.mjs) counts a missed game as a 0-point game: a TE who scored about 9.6 in each of the four games he played was valued at 6.4 because two missed games averaged in. It also cannot tell a player who missed a game from one who played and scored 0. WHAT TO ADD, per moved player: for last season and this season to date, games played out of games his team played (byes excluded), the weeks he missed, his average offensive snap share in the games he played (off_snp / tm_off_snp), and points per game played. A game counts as played when Sleeper records gp, including a game with 0 points. Shown in the trade context as facts with their seasons; 'injury-prone' or any injury diagnosis stays the model's read, never a fact, and the prompt says so. Unavailable (with reason) when the provider has no player stats. Points per rostered game stays where it is used outside trade reports unless a later task changes it."
lastModified: "2026-10-22T20:34:42.591Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
