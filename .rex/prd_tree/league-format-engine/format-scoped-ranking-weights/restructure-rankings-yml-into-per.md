---
id: "79c15e99-bdc0-42f7-9305-f79ed6d1e853"
level: "task"
title: "Restructure rankings.yml into per-format weight sets"
status: "completed"
priority: "high"
startedAt: "2026-09-23T07:00:03.707Z"
completedAt: "2026-09-23T07:06:08.929Z"
endedAt: "2026-09-23T07:06:08.929Z"
acceptanceCriteria: []
description: "Move weights under a format key while keeping a shared default, and select the set from the resolved format type.\n\nWHERE src/config.mjs (DEFAULT_RANKINGS, readYamlFile) and config/rankings.yml.\n\nSUGGESTED SHAPE\nKeep the existing weights as the dynasty set. Add a redraft set that drops dynasty_value and future_draft_capital and redistributes into starting_lineup, depth and contender_viability. The guillotine set is specified in the guillotine epic — leave a placeholder here and cross-reference.\n\nNOTE ON MERGE SEMANTICS\nreadYamlFile deep-merges over defaults, with replaceKeys for maps that must be taken wholesale. A weight set is exactly that kind of map: someone who writes five weights means five, and silently restoring the other four from defaults produces a set that does not sum to 1.0. Add the per-format weight maps to replaceKeys.\n\nACCEPTANCE\n- A redraft league's prompt context carries redraft weights and never mentions draft capital.\n- A user-supplied partial weight map replaces rather than merges, matching the existing ranking_emoji behaviour."
lastModified: "2026-09-23T07:06:08.942Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
