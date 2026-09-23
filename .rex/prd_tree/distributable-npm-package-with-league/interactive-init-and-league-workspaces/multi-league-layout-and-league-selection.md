---
id: "dc9a9068-1d4c-4bfc-9d81-6d5c433d3eb4"
level: "task"
title: "Multi-league layout and league selection"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Let one installation serve several leagues.\n\nWHAT\n- A layout where each league is its own directory, either as siblings under a parent or as independent directories the user creates wherever they like. Prefer the latter unless there is a reason not to: it keeps the tool free of a global registry and makes a workspace portable.\n- League selection: run from inside the workspace directory by default, with a flag to point at one explicitly.\n- Every command resolves its league from the workspace, so running a recap in the wrong directory is impossible rather than merely discouraged.\n\nACCEPTANCE\n- Two workspaces for two leagues in different formats each generate correctly, with no cross-contamination of data, output or config.\n- Running a command outside any workspace produces a message naming init as the fix, in the style of the existing missing-league-ID error in src/cli.mjs.\n- data/ and output/ are per workspace, so snapshot history — which the project treats as immutable once written — stays scoped to its league."
lastModified: "2026-09-23T05:44:16.115Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
