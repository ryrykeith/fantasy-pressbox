---
id: "d29bf507-72dd-43d3-af29-7f019d1f3c67"
level: "task"
title: "Release process: prepublish guard, publish workflow and RELEASING.md"
status: "pending"
priority: "medium"
tags:
  - "publish"
  - "ci"
acceptanceCriteria:
  - "npm publish runs npm test and the pack check first and aborts if either fails"
  - "publish.yml triggers only on a published release, needs id-token: write, refuses a tag that does not match package.json's version, and uses no npm token"
  - "RELEASING.md covers the first manual publish, trusted-publisher setup, and later releases"
description: "Make publishing hard to get wrong. A prepublishOnly script runs npm test and scripts/check-pack.mjs, so a hand-run npm publish refuses a failing or leaky package. .github/workflows/publish.yml publishes on a published GitHub release using npm trusted publishing (OIDC, no token), after checking that the tag matches package.json's version and running the same checks; it does nothing until the operator configures the trusted publisher on npmjs.com, which is only possible once the package exists. RELEASING.md documents the first manual publish, the trusted-publisher setup, and the release routine."
lastModified: "2026-10-11T00:11:53.868Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
