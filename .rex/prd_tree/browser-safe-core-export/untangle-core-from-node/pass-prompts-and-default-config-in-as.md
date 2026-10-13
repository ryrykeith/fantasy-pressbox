---
id: "b36d9dee-c87d-41aa-8837-ca7ac23a5f7d"
level: "task"
title: "Pass prompts and default config in as text"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "No module on core's path calls readFileSync or existsSync"
  - "Workspace prompt overrides still win, and describePromptOverrides still reports them"
  - "A test builds every edition's prompt from an in-memory asset map, and it matches the disk-loaded prompt exactly"
  - "A missing file's error still names it, as 'Missing prompt file: prompts/<file>' does today"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "promptContext.mjs reads prompts/*.md from PACKAGE_ROOT, with workspace overrides. config.mjs reads config/editorial.yml, rankings.yml and bye-weeks.<season>.yml from disk.\n\n- Add loadAssets(readText), where readText(path) returns a package file's text by its path from the package root, e.g. 'prompts/system.md'.\n- The CLI's readText reads the disk and keeps workspace prompt overrides. The website's fetches the same file from jsDelivr at the pinned version.\n- buildPrompt, systemPromptOnly, taskPromptOnly and loadByeWeekTable take the loaded assets instead of reading files."
lastModified: "2026-10-13T02:35:36.565Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
