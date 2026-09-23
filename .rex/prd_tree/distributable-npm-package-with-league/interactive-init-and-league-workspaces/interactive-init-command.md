---
id: "420e0a9e-6eb0-4276-9eec-6101ff19f191"
level: "task"
title: "Interactive init command"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "An init that creates a workspace for one league.\n\nFLOW\n- Ask for the Sleeper league ID, then fetch the league to confirm it resolves and show the name, season and team count back for confirmation. src/sleeper/client.mjs already does the fetching and setup.mjs already has patterns for guided setup worth reusing.\n- Categorise the format: offer the detected type where detection is possible and require an explicit choice for guillotine, which cannot be detected (see the format engine epic). This is the step that makes the guillotine fix reachable for a user, so the prompt wording matters — a user in a chopped league must recognise their format in the options.\n- Confirm the scoring profile back to the user (PPR tier, TE premium, superflex), since a misread here silently degrades every edition afterwards.\n- Write the workspace: directory, league config including the declared format type, and the data and output subdirectories.\n- Optionally collect a provider API key, keeping it out of the workspace config file and in an env file, matching how src/config.mjs reads keys from the environment today.\n\nACCEPTANCE\n- Running init twice against the same league does not clobber existing config without asking.\n- An invalid or unreachable league ID fails at the point of entry with a clear message, not later during a generate.\n- The resulting workspace works with the generate commands immediately, with no manual file editing.\n- Zero new runtime dependencies if achievable with node:readline."
lastModified: "2026-09-23T05:44:15.014Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
