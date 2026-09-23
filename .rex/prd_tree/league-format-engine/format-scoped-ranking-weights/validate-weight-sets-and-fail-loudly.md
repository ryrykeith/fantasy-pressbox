---
id: "cb77f985-2985-4569-9441-1d97220fb82d"
level: "task"
title: "Validate weight sets and fail loudly on mismatch"
status: "completed"
priority: "medium"
startedAt: "2026-09-23T07:20:19.577Z"
completedAt: "2026-09-23T07:28:26.545Z"
endedAt: "2026-09-23T07:28:26.545Z"
acceptanceCriteria: []
description: "Weights are documented as needing to sum to 1.0 but nothing checks it, and nothing checks that the resolved format actually has a weight set.\n\nACCEPTANCE\n- A weight set that does not sum to 1.0 (within a small tolerance) is reported at config load with the actual sum and the offending format.\n- A format type with no weight set is a loud error naming the missing key, not a silent fallback to dynasty weights.\n- doctor surfaces both checks."
lastModified: "2026-09-23T07:28:26.560Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
