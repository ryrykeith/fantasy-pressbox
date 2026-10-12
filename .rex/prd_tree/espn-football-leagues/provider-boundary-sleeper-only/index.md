---
id: "f4e00e0b-574f-45fd-9110-8c4d52a95d2b"
level: "feature"
title: "Provider boundary (Sleeper only)"
status: "pending"
priority: "high"
tags:
  - "providers"
  - "refactor"
acceptanceCriteria: []
description: "Move every Sleeper detail behind a provider interface, without changing any output.\n\nThis ships alone as PR 1 on feat/provider-boundary, before any ESPN code. Each task leaves the 671 existing tests passing, with only import-path changes, and leaves prompt output byte-identical on the fixtures.\n\nDesign: docs/plans/espn-football.md §6. Coupling inventory: §5."
lastModified: "2026-10-12T03:14:01.393Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Normalized draft capital and draft status](./normalized-draft-capital-and-draft.md) | completed |
| [Normalized player dictionary](./normalized-player-dictionary.md) | completed |
| [Normalized week data and the readers of saved weeks](./normalized-week-data-and-the-readers.md) | completed |
| [Provider boundary guard test and architecture docs](./provider-boundary-guard-test-and.md) | pending |
| [Provider interface, registry and LEAGUE_PROVIDER](./provider-interface-registry-and-league.md) | pending |
| [Setup, doctor and the CLI through the provider](./setup-doctor-and-the-cli-through-the.md) | pending |
