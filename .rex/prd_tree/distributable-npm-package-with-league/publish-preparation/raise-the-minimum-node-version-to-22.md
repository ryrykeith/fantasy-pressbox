---
id: "aa686c44-a928-476a-a42a-15a33fba4918"
level: "task"
title: "Raise the minimum Node version to 22"
status: "completed"
priority: "medium"
tags:
  - "ci"
  - "publish"
startedAt: "2026-10-11T00:03:23.104Z"
completedAt: "2026-10-11T00:03:23.104Z"
endedAt: "2026-10-11T00:03:23.104Z"
resolutionType: "code-change"
resolutionDetail: "engines, setup MIN_NODE_MAJOR, doctor check and README raised from 18 to 22; npm test and pack check pass."
acceptanceCriteria:
  - "package.json engines.node is >=22.0.0"
  - "setup.mjs and the doctor command require Node 22"
  - "README states Node 22 or newer"
  - "npm test and the pack check pass"
description: "engines claimed node >=18, but Node 18 and 20 are end of life, npm test cannot run on either (their test runner does not expand the quoted glob), and CI tests only 22 and 24. Raise engines to >=22 and keep every user-facing minimum in step: setup's MIN_NODE_MAJOR, the doctor check, and the README requirements and install flowchart."
lastModified: "2026-10-11T00:03:23.147Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
