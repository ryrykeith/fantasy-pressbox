---
id: "1879971e-66cb-44cb-9676-2279c5f78bf0"
level: "task"
title: "Derive a structured scoring profile from scoring_settings"
status: "completed"
priority: "high"
startedAt: "2026-09-23T06:32:45.828Z"
completedAt: "2026-09-23T06:40:15.239Z"
endedAt: "2026-09-23T06:40:15.239Z"
acceptanceCriteria: []
description: "Build a scoring profile object in src/sleeper/normalize.mjs from the raw league.scoring_settings blob.\n\nWHAT TO CAPTURE\n- Reception scoring: rec (0 / 0.5 / 1 / other) plus a human tier label ('standard', 'half-PPR', 'full PPR').\n- Positional reception bonuses: bonus_rec_te (TE premium), and the equivalent RB/WR bonuses if present, expressed as the DELTA over the base rec value — a TE premium of +0.5 on top of 1.0 PPR means a TE catch is worth 1.5, and the delta is what changes positional value.\n- Passing: pass_td, pass_yd, and interception cost — a 6-point passing TD league values QBs very differently from a 4-point one.\n- Superflex / 2QB, already derived from starting slots.\n- Anything non-default worth flagging generically: compare against Sleeper's defaults and surface the diff so unusual settings (return yards, first downs, tackle-based IDP) are at least visible rather than silently dropped.\n\nACCEPTANCE\n- A TE-premium league produces a profile showing the TE delta and the effective per-catch value by position.\n- A league with entirely default scoring produces a profile that says so, with an empty non-default list."
lastModified: "2026-09-23T06:40:15.252Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
