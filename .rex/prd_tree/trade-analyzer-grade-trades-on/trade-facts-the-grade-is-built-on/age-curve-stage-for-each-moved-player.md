---
id: "24e8301b-4315-474a-a119-4f610353898b"
level: "task"
title: "Age-curve stage for each moved player"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A 29-year-old RB shows his last season before the cliff; a 26-year-old WR shows before decline"
  - "The stage logic is shared with the five-year plan, not duplicated"
  - "Each side carries a summary of stages received and given up"
  - "Redraft and guillotine trade reports carry no stages"
description: "Ages reach the trade report only as a number in the player line, and prompts/trade-report.md says to use them 'as opinion'. config/rankings.yml already declares age_curves per position (peak, decline, cliff; RB decline 27 and cliff 30, TE decline 30 and cliff 33, WR decline 29 and cliff 32, QB decline 34 and cliff 37), resolved by resolveAgeCurves and used by the five-year plan (src/analysis/fiveYearPlan.mjs) and future stock. WHAT TO ADD, per moved player in a dynasty league: his stage on his position's curve (before peak, at peak, declining, past the cliff) and seasons until decline and until the cliff, using the same stage logic as the five-year plan rather than a second copy. Each side gets a one-line summary of the stages it received and gave up. The prompt treats the curve as the house model of a typical player, not a forecast for this one. Redraft and guillotine leagues do not get it."
lastModified: "2026-10-22T20:34:44.380Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
