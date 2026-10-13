---
id: "6ea1284e-c25c-42e6-9e41-5a57f1737ae0"
level: "task"
title: "Doctor prints \"unknown (null per catch)\" for an ESPN league that lists no reception stat"
status: "pending"
priority: "medium"
tags:
  - "ndx-adversarial-review"
  - "severity:medium"
  - "espn"
  - "doctor"
  - "scoring"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "describeScoringSummary prints that the reception rate is not reported by the league's provider when reception.base is null, never 'null per catch'"
  - "marketValueQuery (src/fantasycalc/client.mjs) does not read a null reception rate as 0: it adds a receptionScoring caveat saying the league's rate is unknown, and says which PPR setting the values assume"
  - "promptContext does not read a null reception rate as 0: the rate stays absent and an unavailable entry tells the model not to state the league's per-catch value"
  - "Sleeper output is unchanged"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Found by the adversarial review of task f7204756 (ESPN league, team and player normalizer). Verdict: should-fix, medium.\n\nSCENARIO\nAn ESPN league whose scoringItems has no stat 53 gets format.scoring.reception = { base: null, tier: 'unknown' } (src/espn/normalize.mjs deriveEspnScoringProfile). This is deliberate: open question 5 means an unlisted stat is not known to be 0. But src/scoringReport.mjs describeScoringSummary prints `Reception          ${reception.tier} (${reception.base} per catch)`, which gives \"Reception          unknown (null per catch)\". Downstream readers that do `reception.base ?? 0` (src/promptContext.mjs:282, src/fantasycalc/client.mjs:37) silently treat it as standard scoring.\n\nREACHABILITY\nThis can't happen yet: the ESPN provider is not registered until task 3.6. It becomes reachable through `doctor` and every edition once an ESPN league without stat 53 is opened.\n\nOPTIONS\n1. describeScoringSummary prints \"not reported by ESPN\" when base is null. This is cheap and the recommended fix.\n2. Also have promptContext emit an unavailable entry for the reception rate rather than reading null as 0. This is more work and belongs with task 5.1's unavailable entries."
lastModified: "2026-10-13T00:06:08.710Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
