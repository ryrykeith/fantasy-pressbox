---
id: "d377c5cf-7300-4868-a344-db6938170ce7"
level: "task"
title: "Take the Unreleased heading out of CHANGELOG.md"
status: "pending"
priority: "medium"
acceptanceCriteria:
  - "CHANGELOG.md has no 'Unreleased' heading and no entry added by fe01f9b; it matches its state before that commit"
  - "npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "fe01f9b (task 3f07f436) added a '## Unreleased' section to CHANGELOG.md. This project writes CHANGELOG.md only at release time, and never under an Unreleased heading. Remove the section fe01f9b added, leaving CHANGELOG.md exactly as it was before that commit (git show fe01f9b -- CHANGELOG.md). The text is kept in the release task (8574bb39) for the release notes; do not move it anywhere else. Change nothing but CHANGELOG.md."
lastModified: "2026-10-14T20:21:50.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
