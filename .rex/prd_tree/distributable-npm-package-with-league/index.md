---
id: "e09e1f99-f3ef-47bf-87de-d3a844569c19"
level: "epic"
title: "Distributable npm package with league workspaces"
status: "pending"
priority: "high"
description: "Turn Fantasy Pressbox from a cloned repo that covers one league into an installable npm package that manages a workspace per league.\n\nTARGET WORKFLOW\n1. Install the package.\n2. Run an init that asks for the league (Sleeper ID), categorises the format type (dynasty / redraft / guillotine), and creates a local directory for that league holding its config and data.\n3. Run the generate commands in or against that directory, producing pasteable prompts or calling the provider API — the two paths that already exist in src/generate.mjs.\n\nTHE CENTRAL OBSTACLE\nsrc/config.mjs exports ROOT as the package directory and uses it for BOTH kinds of path:\n- package assets that ship with the code: prompts/ (read by readPrompt in src/promptContext.mjs), the config/*.yml defaults;\n- user data that belongs to a league: data/, output/, and .env holding SLEEPER_LEAGUE_ID.\nOnce the package is installed under node_modules, those two must not be the same directory — writing a user's league snapshots into node_modules is obviously wrong, and reading prompts from the user's working directory would break a default install. Separating them is the prerequisite for everything else in this epic.\n\nSECOND OBSTACLE\nEverything about league identity lives in a single .env at the package root, so the project structurally cannot hold two leagues at once. Multi-league is the point of the init flow.\n\nNOTE package.json currently declares private: true and a bin of fantasy-pressbox pointing at src/cli.mjs. It has zero dependencies, which is worth preserving if the init flow can be built without pulling in a prompt library."
lastModified: "2026-09-23T05:44:10.040Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Interactive init and league workspaces](./interactive-init-and-league-workspaces/index.md) | pending |
| [Publish preparation](./publish-preparation/index.md) | pending |
| [Separate package assets from workspace data](./separate-package-assets-from-workspace/index.md) | pending |
