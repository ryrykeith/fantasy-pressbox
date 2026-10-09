---
id: "339d04bb-37dd-424e-9eee-b2601714cdca"
level: "task"
title: "Declared prospect board per draft class"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "config/prospects.<draftYear>.yml, curated by the operator and refreshed a few times a season.\n\nSHAPE\ndraftYear, updated (date, required), and ranked entries: rank, name, position, school, an optional short note, and source (required: publication name and/or URL).\n\nRULES\n- Every entry must carry a source. The publication may say \"the consensus 1.01\" only because a declared, sourced board says so.\n- A prospect not on the board is not discussed; the model gets an unavailable entry saying so.\n- Validation refuses a missing source, duplicate ranks, or a missing updated date. doctor reports the board's age and warns when it is stale.\n\nDO NOT seed real rankings from model memory. Ship the loader, the validation and an example file; the operator fills the real board. (Context from 2026-10: Jeremiah Smith WR Ohio State at the top of the 2027 class per Tankathon, Roto Street Journal and Dynasty Nerds; a QB-heavy class: Arch Manning, Dante Moore, CJ Carr, Julian Sayin, Jayden Maiava; Cam Coleman WR. The operator verifies and sources these, not the agent.)"
lastModified: "2026-10-09T17:51:37.933Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
