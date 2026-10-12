---
id: "db577f6c-f820-4507-83d8-266268ed6f44"
level: "epic"
title: "ESPN football leagues"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "providers"
source: "docs/plans/espn-football.md"
description: "Add ESPN fantasy football leagues alongside Sleeper.\n\nWHY\nFantasy Pressbox only covers Sleeper. Sleeper's raw shapes leak well past src/sleeper/: into analysis, the prompt context, the CLI, setup and the raw history saved under data/raw/. So a second platform can't be added without first drawing a provider boundary.\n\nAPPROACH\n1. A provider boundary lands first, as its own PR on feat/provider-boundary. It is Sleeper only and changes nothing a Sleeper league does.\n2. ESPN support follows on feat/espn-football, cut from main after that PR merges.\n\nESPN's API is unofficial and undocumented, and no test league exists yet. So ESPN support:\n- is built from cited public descriptions;\n- labels every fact as verified, operator-checked or assumed;\n- refuses loudly (EspnShapeError) when a response doesn't match its documented shape;\n- is labelled experimental until it has been checked against a live league.\n\nDECISIONS (2026-10-11, all in docs/plans/espn-football.md §2)\n- Current season only.\n- Keys: LEAGUE_PROVIDER (absent means sleeper), ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID, LEAGUE_SEASON and POST_MAX_LENGTH. The SLEEPER_* keys still work.\n- src/sleeper/ and src/espn/ sit side by side behind src/providers.mjs.\n- Raw weeks are saved tagged with their provider and normalized on read.\n- On ESPN, keeper means redraft. A declared dynasty is accepted, but editions that need traded future picks refuse.\n- Guillotine is refused on ESPN in v1.\n- Manager names: ESPN displayName only.\n- A matchup period spanning more than one NFL week is refused.\n\nPLAN\ndocs/plans/espn-football.md: the coupling inventory, the boundary design, config, the coverage matrix and the risks."
lastModified: "2026-10-12T03:13:40.306Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [ESPN API facts](./espn-api-facts/index.md) | pending |
| [ESPN client and normalizer](./espn-client-and-normalizer/index.md) | pending |
| [ESPN config, setup and doctor](./espn-config-setup-and-doctor/index.md) | pending |
| [ESPN editions and coverage matrix](./espn-editions-and-coverage-matrix/index.md) | pending |
| [FantasyCalc market values for ESPN](./fantasycalc-market-values-for-espn/index.md) | pending |
| [Provider boundary (Sleeper only)](./provider-boundary-sleeper-only/index.md) | pending |
| [ESPN docs and README](./espn-docs-and-readme/index.md) | pending |
