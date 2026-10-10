---
id: "266e3d18-de59-44ee-8567-222401eeab2b"
level: "task"
title: "CI workflow: test matrix and pack-contents guard"
status: "completed"
priority: "medium"
tags:
  - "ci"
  - "publish"
startedAt: "2026-10-10T19:43:41.369Z"
completedAt: "2026-10-10T19:44:41.468Z"
endedAt: "2026-10-10T19:44:41.468Z"
resolutionType: "code-change"
resolutionDetail: "Added .github/workflows/ci.yml (test on Node 20/22/24, pack job) and scripts/check-pack.mjs; verified the check passes on the real file list and fails on simulated forbidden paths."
acceptanceCriteria:
  - "Workflow triggers on pull_request to main and push to main"
  - "test job runs npm test on Node 20, 22 and 24"
  - "pack job fails when npm pack --dry-run would include a forbidden path and passes on the current file list"
  - "The pack rules live in a small readable maintainer script that is not shipped"
description: "Add .github/workflows/ci.yml running on pull requests to main and pushes to main. A \"test\" job runs npm test on Node 20, 22 and 24. A \"pack\" job runs npm pack --dry-run --json and fails if the tarball would contain anything that must never ship: .env files (.env.example allowed), data/, output/, real prospect boards (config/prospects.<digits>.yml), n-dx state (.rex/, .hench/, .sourcevision/), assistant folders (.claude/, .agents/, .codex/), tests/ or scripts/. No npm publish."
lastModified: "2026-10-10T19:44:41.513Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
