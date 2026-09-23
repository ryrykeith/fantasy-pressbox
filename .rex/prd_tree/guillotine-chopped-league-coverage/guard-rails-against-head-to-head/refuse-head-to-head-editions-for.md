---
id: "90e28064-bbd8-41c6-916c-e2d828ec1923"
level: "task"
title: "Refuse head-to-head editions for guillotine leagues"
status: "pending"
priority: "critical"
acceptanceCriteria: []
description: "When the resolved format type is guillotine, the preview and recap commands must refuse and point at the guillotine equivalents.\n\nWHERE src/cli.mjs command dispatch, and buildPrompt in src/promptContext.mjs as a second line of defence.\n\nACCEPTANCE\n- Running preview or recap on a declared guillotine league exits non-zero with a message naming the correct command, in the style of the existing helpful errors in src/cli.mjs (e.g. the missing-league-ID message that tells you to run setup).\n- The error explains WHY, briefly: this league has no matchups.\n- No prompt file is written when the command refuses."
lastModified: "2026-09-23T05:41:36.851Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
