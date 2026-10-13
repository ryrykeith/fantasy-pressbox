---
id: "1206f11b-e5c1-4465-8ac5-126d5c1e7f59"
level: "task"
title: "describeFormat and the not-modelled scoring heading name Sleeper for every provider"
status: "pending"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
  - "espn"
  - "doctor"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "describeFormat, describeUnmodelledScoring and the parseDeclaredFormatType error name the league's provider (for example 'detected from ESPN') through its displayName"
  - "Sleeper wording is byte-identical (existing tests unchanged)"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Found by the adversarial review of task f7204756. Verdict: out-of-scope (pre-existing), low.\n\nSCENARIO\n1. src/format.mjs:152-156: describeFormat returns \"Redraft (detected from Sleeper)\" for any detected format. An ESPN League (src/espn/normalize.mjs, source 'detected') would print that in doctor (src/cli.mjs:427).\n2. src/scoringReport.mjs describeUnmodelledScoring heads its list \"Sleeper settings this tool does not use\", which is wrong for ESPN's notModelled entries.\n3. parseDeclaredFormatType's error text says Fantasy Pressbox \"will work it out from Sleeper\".\n\nREACHABILITY\nThese become reachable once the ESPN provider is registered (task 3.6) and doctor runs on an ESPN league.\n\nOPTION\nPass the provider's displayName into these (for example, describeFormat(format, { provider })), keeping the Sleeper wording byte-identical. This is cheap and low-risk."
lastModified: "2026-10-13T00:06:08.651Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
