---
id: "5d1bc559-e47b-4f43-ad78-8eb83028bfb0"
level: "task"
title: "Guillotine power rankings edition"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Rank surviving teams on survival probability rather than on dynasty asset value.\n\nWHY A SEPARATE EDITION\nThe existing weekly rankings prompt ranks on starting lineup, dynasty value, depth, quarterback, future draft capital and flexibility. In guillotine, future draft capital does not exist, dynasty value is irrelevant (the season ends when you are chopped or win), and the dominant factors are weekly FLOOR, bye-week exposure and FAAB ammunition.\n\nSUGGESTED WEIGHTS (fills the placeholder left in the format-scoped weights task)\n- weekly floor / consistency: heaviest\n- starting lineup quality\n- bye-week exposure over the next few weeks\n- FAAB remaining as ammunition for future pools\n- depth, in the sense of injury survivability\n\nExplicitly zero: dynasty_value, future_draft_capital.\n\nACCEPTANCE\n- New prompt file plus a guillotine weight set in config/rankings.yml.\n- Only surviving teams are ranked; eliminated teams appear as history, not as ranks.\n- The prompt instructs on floor-over-ceiling reasoning, which is the format's core strategic inversion.\n- The rank emoji table in config/editorial.yml defaults to 12 entries while guillotine leagues commonly start at 18. rankEmoji in src/config.mjs repeats the last emoji past the end of the table, so an 18-team league gets seven identical emoji. Ship a documented larger default or a guillotine-appropriate table."
lastModified: "2026-09-23T05:41:35.788Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
