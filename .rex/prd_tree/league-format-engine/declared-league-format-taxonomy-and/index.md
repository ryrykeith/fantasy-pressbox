---
id: "c750f1eb-2d36-4204-9e92-47524cddc656"
level: "feature"
title: "Declared league format taxonomy and resolution"
status: "completed"
priority: "critical"
startedAt: "2026-09-23T06:28:48.107Z"
completedAt: "2026-09-23T06:28:48.107Z"
endedAt: "2026-09-23T06:28:48.107Z"
acceptanceCriteria: []
description: "Introduce an explicit format type that the operator can declare and the tool can partly detect, then thread the resolved value through the context builder.\n\nSleeper exposes enough to infer dynasty (settings.type == 2 or taxi_slots) and superflex, but NOT guillotine — the commissioner runs that manually, so Sleeper still reports head-to-head matchups. Declaration must therefore win over detection, and the resolved format must be visible in doctor output so a user can see what the tool thinks their league is before generating anything."
lastModified: "2026-09-23T06:28:48.120Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Define the format taxonomy and config schema](./define-the-format-taxonomy-and-config.md) | completed |
| [Resolve declared format over Sleeper detection](./resolve-declared-format-over-sleeper.md) | completed |
| [Thread resolved format into prompt context and the unavailable list](./thread-resolved-format-into-prompt.md) | completed |
