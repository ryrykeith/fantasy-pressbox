---
id: "2d8f1346-a499-4d62-b21e-e7e3a56a5af2"
level: "task"
title: "Ranking presets in config/rankings.yml"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "config/rankings.yml ships presets: dynasty win-now, balanced and rebuild; redraft balanced and win-now; guillotine balanced. Each set sums to 1.0 and is commented as editorial guidance"
  - "balanced equals today's weight sets exactly, and a league that sets no preset ranks exactly as before (existing ranking tests pass unchanged)"
  - "A workspace that sets preset and an explicit weights.<format> for the same format is refused, naming both; an unknown preset or one its format lacks is refused, naming the presets that format has"
  - "The ranking contexts carry editorial.rankingPreset; prompts may name it and never print the numbers"
  - "The league file carries the preset (it already carries config/rankings.yml); a test round-trips it"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "RULES: never invent a fact (missing data is an `unavailable` entry with its reason, never 0); invented cast only in tests, fixtures, docs and commits; new modules on core's path import nothing from node: (tests/core-purity.test.mjs); a new edition or flag goes into src/options.mjs. \n\nPlan: docs/plans/football-settings-rivalries-five-year-plan.md section 3. Today config/rankings.yml holds one weight set per format (dynasty, redraft, guillotine) and per ranking edition (future_stock); a workspace override replaces a set wholesale (src/settings.mjs resolveRankingWeights, validateRankingWeights). Add a `preset` setting that picks a named set for the league's resolved format. Rebuild moves weight from contender_viability and starting_lineup towards dynasty_value, future_draft_capital (and age, where the set has it); win-now the reverse. Choose the values, explain them in the YAML comments, and keep the existing 'partial set replaces wholesale' rule. A preset will also choose the strength rating's weights (next task, A2): leave a clear place for strength.<format> under each preset, empty until A2 fills it, or add it in A2 if cleaner. Update README's settings section."
lastModified: "2026-10-15T16:59:21.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
