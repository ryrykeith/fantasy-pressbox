---
id: "cb77f985-2985-4569-9441-1d97220fb82d"
level: "task"
title: "Validate weight sets and fail loudly on mismatch"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "Weights are documented as needing to sum to 1.0 but nothing checks it, and nothing checks that the resolved format actually has a weight set.\n\nACCEPTANCE\n- A weight set that does not sum to 1.0 (within a small tolerance) is reported at config load with the actual sum and the offending format.\n- A format type with no weight set is a loud error naming the missing key, not a silent fallback to dynasty weights.\n- doctor surfaces both checks."
lastModified: "2026-09-23T05:40:16.145Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
