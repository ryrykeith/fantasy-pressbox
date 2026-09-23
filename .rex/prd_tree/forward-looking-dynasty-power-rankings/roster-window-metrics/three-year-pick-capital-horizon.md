---
id: "031bea89-d99b-4113-9208-efe8a32c640b"
level: "task"
title: "Three-year pick capital horizon"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "Extend the existing pick capital view into a rolling window suitable for a forward-looking report.\n\nnormalizeFutureDraftCapital already returns per-season rows with picksHeld against a baseline. What is missing is the summary the report needs: net capital across the next three drafts as a single comparable figure per team, with the per-season detail retained.\n\nWATCH OUT\nSleeper only reports picks that have MOVED, which is why the existing code starts every team at roundsPerDraft and applies the moves. That assumption must carry into the horizon summary — a team absent from tradedPicks holds a full complement, not zero.\n\nACCEPTANCE\n- Net three-year capital per team, plus the existing per-season breakdown.\n- A league with no traded future picks yields equal capital for all teams rather than nulls."
lastModified: "2026-09-23T05:43:13.628Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
