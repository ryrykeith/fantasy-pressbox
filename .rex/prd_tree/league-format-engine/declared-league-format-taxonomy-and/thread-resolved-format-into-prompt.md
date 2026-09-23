---
id: "d76f0b1b-0ff9-41f0-9310-6aff4f4ca2cc"
level: "task"
title: "Thread resolved format into prompt context and the unavailable list"
status: "completed"
priority: "high"
startedAt: "2026-09-23T06:25:29.936Z"
completedAt: "2026-09-23T06:28:48.059Z"
endedAt: "2026-09-23T06:28:48.059Z"
acceptanceCriteria: []
description: "buildContext in src/promptContext.mjs already emits league.format. Extend it to carry the resolved type and source, and teach describeMissingContext to reason about format.\n\nWHAT\n- context.league.format gains type and source.\n- describeMissingContext gains format-aware entries. Today it emits a futureDraftCapital 'nothing traded' note for every ranking edition; in a redraft league that note is wrong in a different way — future picks are not a concept at all, so the instruction should say so rather than implying picks exist but are untraded.\n\nACCEPTANCE\n- A redraft league's ranking context carries an unavailable entry that tells the model not to discuss draft capital as a concept.\n- A dynasty league's behaviour is unchanged from today."
lastModified: "2026-09-23T06:28:48.071Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
