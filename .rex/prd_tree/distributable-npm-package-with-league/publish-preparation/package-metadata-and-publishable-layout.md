---
id: "ba040558-5242-41d7-86ab-52d6781dbd4f"
level: "task"
title: "Package metadata and publishable layout"
status: "pending"
priority: "medium"
acceptanceCriteria: []
description: "Prepare package.json and the file layout for publication.\n\nWHAT\n- Remove private: true and choose the published name. Decide scoped versus unscoped before publishing, since it cannot be changed afterwards without a new package.\n- files: must include prompts/ and config/ — they are runtime assets, not build inputs, and readPrompt fails without them.\n- bin: keep the existing fantasy-pressbox entry and confirm the shebang and executable bit on src/cli.mjs survive packing.\n- engines already requires Node 18+, which matches the code's use of built-in fetch.\n- Verify the whole thing with a pack and a local install into a scratch directory before publishing anything.\n\nACCEPTANCE\n- npm pack produces a tarball that installs and runs init and one generate command end to end in a clean directory.\n- No dev or repo-only files ship in the tarball."
lastModified: "2026-09-23T05:44:17.402Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
