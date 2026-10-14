---
id: "d9fb2114-548e-439f-9b82-51e420a7635e"
level: "task"
title: "Doctor on the ESPN import route with nothing imported omits the unverified private-league note and the imported-weeks line"
status: "completed"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
  - "espn"
  - "doctor"
source: "ndx-adversarial-review"
startedAt: "2026-10-13T15:54:17.523Z"
completedAt: "2026-10-13T15:55:01.503Z"
endedAt: "2026-10-13T15:55:01.503Z"
acceptanceCriteria:
  - "Option 1: on the import route with nothing imported, doctor prints the addresses to save, 'Imported weeks: none yet', the personal-use wording and the unverified private-league note, and exits 1"
  - "It makes no network request (fetch that throws)"
  - "Refusals elsewhere are unchanged"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Verdict: should-fix (low). Found by the adversarial review of task f21d7c2e (Doctor for ESPN leagues).\n\nScenario: an ESPN league folder on ESPN_ROUTE=import with no league page imported yet → `fantasy-pressbox doctor`. In src/cli.mjs commandDoctor, openLeague throws EspnImportError (notImported in src/espn/provider.mjs). explainEspnError returns null for it, so the error is rethrown and main prints \"Error: ...\" with importInstructions. That text gives the addresses and the personal-use wording. It omits two things the owner decision (2026-10-13) asks doctor to show on the import route: that whether a private league's page shows on a plain signed-in visit is unverified, and an \"Imported weeks: none yet\" line. Those come from describeImportToSave, which runs only after a successful open.\n\nReachable: yes, on the first doctor run after setup, before any import.\n\nOptions:\n1. (Recommended) In commandDoctor, catch EspnImportError on the import route, print describeImportToSave-style lines with no weeks, and return 1. This is cheap, but describeImportToSave needs a version that doesn't depend on ctx.\n2. Add the unverified sentence to importInstructions in src/espn/import.mjs. Every refusal would then carry it, which is noisier."
lastModified: "2026-10-13T15:55:01.536Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
