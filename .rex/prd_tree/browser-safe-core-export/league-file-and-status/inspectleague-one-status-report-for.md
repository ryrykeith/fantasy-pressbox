---
id: "6fd530c1-5b91-4d23-922b-6fbaf5862c2b"
level: "task"
title: "inspectLeague: one status report for doctor and the website"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "doctor shows the report for a league folder"
  - "Offline, the active week is the last captured week with its date, marked not live"
  - "A file whose league ID differs from the provider's league is reported as a mismatch"
  - "Tests cover a new league, mid-season with last week recorded, and mid-season with it missing"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Build a status report from a league file or the file store and, when online, the provider's current state. It reports:\n\n- the league's provider, ID and name (from the latest snapshot);\n- the declared and the detected format;\n- the season and the active week, from the provider's state as resolveWeek does. Offline, it gives the last captured week and its date, marked not live, and never a guess;\n- for each recordable edition (preview, survival-preview and the ranking editions): whether last week was recorded, when, and by which surface and version;\n- whether last week's predictions can be graded;\n- this week's editions not yet recorded, in weekly-routine order.\n\ndoctor prints it."
lastModified: "2026-10-13T02:35:39.988Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
