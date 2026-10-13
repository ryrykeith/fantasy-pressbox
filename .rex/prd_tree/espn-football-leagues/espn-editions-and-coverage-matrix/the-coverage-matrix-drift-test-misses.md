---
id: "981a0d0a-5c63-40d9-8a53-900f74ebee44"
level: "task"
title: "The coverage-matrix drift test misses an unavailable key whose field is not written as `field: '<literal>'`"
status: "pending"
priority: "low"
tags:
  - "ndx-adversarial-review"
  - "severity:low"
  - "espn"
  - "tests"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "Adding an unavailable entry under src/ written as `{ field, why, instruction }` (shorthand), with no matrix row and on no ESPN-built path, makes tests/espn-coverage-matrix.test.mjs fail and name the file"
  - "Adding an entry written as `field:` followed by a newline and then `'newKey'` makes the test fail naming `newKey`, or naming the file"
  - "The test does not flag the unrelated `field` variables in src/espn/codes.mjs or src/analysis/draftOrder.mjs"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Found by the adversarial review of task 5c20b018 (commit 10ee9b3). Verdict: should-fix (low).\n\nFailure scenario: `unavailableKeys()` in tests/espn-coverage-matrix.test.mjs (around line 125) collects keys with `/\\bfield: '([A-Za-z]+)'/`. Its guard against non-literal fields, `/\\bfield: (?!')(\\S+)/`, needs exactly one space after the colon, followed by a non-space. Three ways a key gets past both:\n- a shorthand property, as in a helper `const gap = (field, why, instruction) => ({ field, why, instruction })`;\n- a value wrapped onto the next line (`field:\\n  'newKey'`);\n- a double-quoted value.\n\nIf that key is emitted only on a path the ESPN scenarios do not build (a Sleeper-only branch, or an ESPN condition no scenario sets up), nothing reports it. The matrix then lacks a row, and the acceptance criterion \"the drift test fails when an unavailable key is added without a row\" no longer holds. Today every key is written as a literal, so nothing is missed now.\n\nReachable: only when someone writes a new unavailable entry in one of those forms. That is plausible for a helper that builds entries.\n\nOptions:\n1. (Recommended) Scan for the entry objects themselves. Find every object literal holding `why:` and `instruction:` together, and require a literal `field` in each. Cheap, and it ties the check to the shape of an entry rather than to how the line is spelled.\n2. Widen the regexes: `\\s*` across newlines, both quote styles, and a shorthand `field` inside an object that also has `why`. Smaller change, but more brittle.\n3. Run the key through one exported constructor (e.g. `unavailableEntry(field, why, instruction)`) and have the test read its call sites. It touches src/, and that is a bigger change.\n\nA naive shorthand guard (`[{,]\\s*field\\s*[,}]`) false-positives on src/espn/codes.mjs:354 and src/analysis/draftOrder.mjs:252, which are unrelated `field` variables."
lastModified: "2026-10-13T19:21:57.396Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
