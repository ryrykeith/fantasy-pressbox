---
id: "031bea89-d99b-4113-9208-efe8a32c640b"
level: "task"
title: "Three-year pick capital horizon"
status: "completed"
priority: "medium"
startedAt: "2026-10-09T21:18:35.114Z"
completedAt: "2026-10-09T21:21:53.976Z"
endedAt: "2026-10-09T21:21:53.976Z"
resolutionType: "code-change"
resolutionDetail: "Commit 665c944: src/analysis/pickCapital.mjs + src/pipeline.mjs#readPickCapital price every held future pick across the tradeable/priced drafts, per season and summed, with netValue against each team's own picks. 15 new tests; 537 pass."
acceptanceCriteria: []
description: "READ FIRST (2026-10-09) — this task predates the trade report and rookie draft epics, which have since landed on main. Reuse what they built; do not rebuild it.\n\n1. VALUE PICKS, DO NOT COUNT THEM. A pick count treats a 1st the same as a 5th. Price each pick from the market snapshot the trade report already uses (pipeline.mjs#readMarketValues, FantasyCalc, saved per week). For the draft the current standings decide (2027), use the pick's projected slot from analysis/draftOrder.mjs#projectDraftOrder and tradePicks.mjs#pickProjection to choose the Early/Mid/Late tier, and label it an estimate. Later drafts use the generic round value. A pick the market does not price (5th rounds; any season FantasyCalc does not list) is reported as unpriced, never given an invented value.\n\n2. THE HORIZON IS THE TRADEABLE DRAFTS, NOT A FIXED THREE. As of 2026-10-09 Sleeper reports this league's traded picks for 2026-2028 only, and FantasyCalc prices 2027 and 2028 picks only. A 2029 column would give every team its own picks and no price, which is noise. Derive the horizon from the seasons that have tradeable or priced picks.\n\n3. OWNERSHIP ALREADY EXISTS. sleeper/normalize.mjs#futurePickOwnership starts every team with its own picks and applies Sleeper's moves (Sleeper lists only picks that moved). Build on it and on normalizeFutureDraftCapital rather than recomputing ownership.\n\nTHE MOTIVATING CASE in the operator's league: Taco Tuesday holds no 2027 1st or 2nd (traded to Rebuild Szn and Lowered Expectations) but three 2027 3rds. Rebuild Szn holds its own 2027 1st (projected 1.02) and Taco Tuesday' (projected 1.07, or 1.02 if JD misses the playoffs).\n\n---- original description ----\n\nExtend the existing pick capital view into a rolling window suitable for a forward-looking report.\n\nnormalizeFutureDraftCapital already returns per-season rows with picksHeld against a baseline. What is missing is the summary the report needs: net capital across the next three drafts as a single comparable figure per team, with the per-season detail retained.\n\nWATCH OUT\nSleeper only reports picks that have MOVED, which is why the existing code starts every team at roundsPerDraft and applies the moves. That assumption must carry into the horizon summary — a team absent from tradedPicks holds a full complement, not zero.\n\nACCEPTANCE\n- Net three-year capital per team, plus the existing per-season breakdown.\n- A league with no traded future picks yields equal capital for all teams rather than nulls."
lastModified: "2026-10-09T21:21:53.990Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
