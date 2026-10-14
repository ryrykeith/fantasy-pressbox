---
id: "dfc42402-f65b-43a5-9b60-4fea54743f7a"
level: "epic"
title: "Browser-safe core export"
status: "pending"
priority: "high"
source: "fantasy-pressbox-dev docs/plans/package-core.md"
description: "Give the package a browser-safe entry, fantasy-pressbox/core, so the website (fantasy-pressbox-dev) can build in the browser the same prompts the CLI builds. The site loads it from jsDelivr at an exact version, with no build step.\n\nWHY\nThe website is a browser-only tool: it never calls an AI, takes no key and stores nothing on a server. It needs the package's analysis, prompt building, post checks and league history in the browser. About 25 of the package's 41 modules are already pure. The rest are tied to Node at six places:\n- store.mjs (disk);\n- config.mjs (disk, .env, process);\n- promptContext.mjs (reads prompts/ from disk);\n- sleeper/client.mjs (player cache on disk);\n- cli.mjs (the edition steps and recordBlock live in command handlers);\n- generate.mjs (the AI call, left out of core).\n\nORDER\nUpdated 2026-10-13: the owner reversed the 2026-10-12 \"core first\" order, and ESPN merged to main first (#8); main was then merged into this branch. The first four tasks change no behaviour and come first. Run order:\n1. store;\n2. settings;\n3. assets;\n4. player cache;\n5. edition steps;\n6. hostile input;\n7. league file;\n8. rank emoji;\n9. inspectLeague;\n10. post formatting;\n11. core entry;\n12. release.\nESPN is on main: src/espn/ is part of the code these tasks change. Owner decisions 2026-10-13: core supports ESPN on the import route only (the cookie fetch stays CLI-only), and a league file strips member IDs, owners[] and first/last names from saved ESPN pages. Each task carries a dated READ FIRST note with what ESPN changed for it.\n\nRULES\n- Nothing changes for CLI users except where a task says so.\n- Tests use only the invented cast and the fake league ID 000000000000000000.\n- The website consumes core and never writes to this repo.\n\nPLAN\nThe full design is in the website repo at ~/pet-projects/fantasy-pressbox-dev/docs/plans/package-core.md. Each task here is self-contained."
lastModified: "2026-10-14T00:04:52.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Core entry and release](./core-entry-and-release/index.md) | pending |
| [Editorial output](./editorial-output/index.md) | pending |
| [League file and status](./league-file-and-status/index.md) | pending |
| [Shared edition steps and safe input](./shared-edition-steps-and-safe-input/index.md) | pending |
| [Untangle core from Node](./untangle-core-from-node/index.md) | completed |
