---
id: "b68a41d0-26ea-4358-a3d2-8d0161f47b25"
level: "task"
title: "Check league views against a test league (operator-run)"
status: "blocked"
priority: "low"
tags:
  - "espn"
  - "live-check"
  - "operator-run"
blockedBy:
  - "b19b5d2b-6756-4289-a080-47e22661ef23"
  - "cdb18c31-80ea-4006-b268-3ec67a75a1b1"
acceptanceCriteria:
  - "No real response, value, name, ID or cookie is saved in the repository"
  - "Every corrected guess has a regression test using the invented cast"
  - "Every 'assumed' entry in docs/espn-data.md is now 'verified' or 'corrected'"
run: {"models":{"claude":"claude-opus-5-5"}}
description: "BLOCKED: NO ESPN TEST LEAGUE EXISTS YET. An autonomous run must not make live requests for this task.\n\nOnce the operator has created a public ESPN test league (and ideally a private one too):\n\n1. Extend scripts/check-espn-shapes.mjs to request the league views in docs/espn-data.md. It prints shapes only: key names, types and counts. Never values, names or IDs.\n2. Wherever a guess in the ESPN work was wrong, correct docs/espn-data.md, src/espn/shape.mjs, src/espn/codes.mjs, the normalizers and tests/fixtures/mock-espn-league.mjs. Nothing outside src/espn/ should need to change; if something does, a detail has leaked.\n3. Turn each 'assumed' label into 'verified' or 'corrected', with the date.\n4. Remove the experimental label from README, doctor and setup only when every row of the coverage matrix is verified.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere, test league included: no league ID, team or member names, scores or cookies in code, tests, fixtures, docs or commits.\n- Never save a real response, even redacted."
lastModified: "2026-10-12T03:17:12.804Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
