---
id: "44c3f4eb-5650-4bfb-b787-fa4d4e830abb"
level: "task"
title: "Split ROOT into package root and workspace root"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Replace the single exported ROOT in src/config.mjs with two clearly named paths, and update every consumer.\n\nCONSUMERS TO UPDATE\n- src/config.mjs: DEFAULT paths for dataDir and outputDir, the config/*.yml reads, and the .env location in loadConfig.\n- src/promptContext.mjs: readPrompt joins ROOT with prompts/ — that is a PACKAGE asset.\n- src/cli.mjs: commandDoctor checks prompt files under ROOT — also a package asset.\n\nRULES\n- Package root resolves from import.meta.url as ROOT does today, and is read-only at runtime.\n- Workspace root defaults to the current working directory, overridable by a flag and by an environment variable, following the precedence already documented at the top of src/config.mjs.\n\nACCEPTANCE\n- No write ever targets the package root.\n- Running from a directory other than the package root reads prompts correctly and writes data and output into the working directory.\n- The existing single-league repo workflow still works, so current users are not broken by the split alone."
lastModified: "2026-09-23T05:44:12.267Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
