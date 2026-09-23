---
id: "d658cee2-739c-4abb-9a02-57964daebd64"
level: "task"
title: "Workspace overrides for prompts and config"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "Let a league workspace override the shipped defaults without copying the whole package.\n\nWHAT\n- config/editorial.yml and config/rankings.yml: read the shipped defaults, then a workspace copy layered on top. readYamlFile in src/config.mjs already does exactly this layering over the built-in DEFAULT objects, including the replaceKeys semantics for maps that must be taken wholesale — extend that chain by one level rather than inventing a second mechanism.\n- prompts/: allow a workspace prompts directory to shadow individual shipped prompt files by name, so a league can rewrite its recap voice without forking the package. readPrompt is the single resolution point, which makes this a small change.\n\nACCEPTANCE\n- A workspace with no overrides behaves exactly like the shipped defaults.\n- A workspace overriding one prompt file gets its version of that file and shipped versions of the rest.\n- doctor reports which prompts and config files are overridden, so a confusing output can be traced to a local override."
lastModified: "2026-09-23T05:44:13.187Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
