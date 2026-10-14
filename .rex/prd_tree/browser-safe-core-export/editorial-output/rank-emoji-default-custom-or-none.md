---
id: "18d1f957-35d1-41de-8c2f-b30fa3438df5"
level: "task"
title: "Rank emoji: default, custom or none"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "INCLUDE_EMOJI=false gives mode none; a ranking_emoji table in editorial.yml gives custom"
  - "--emoji none overrides the league's setting for that run only"
  - "With none, the built prompt tells the model to print no rank emoji"
  - "Each custom entry must be a single emoji grapheme (checked with Intl.Segmenter); anything else is refused"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- No ESPN change is needed. The table runs to 18 entries; nothing about it is provider-specific.\n\nToday, editorial.output.include_emoji (env INCLUDE_EMOJI) switches emoji off, and editorial.ranking_emoji holds an 18-entry table that a league can override in config/editorial.yml.\n\nTurn these into one setting, rankEmoji: { mode: 'default' | 'custom' | 'none', table }.\n- none means no emoji wherever a rank or standing prints, and the prompt tells the model so.\n- It applies to every ranking edition (weekly, preseason, postseason, survival rankings, future stock) and to the standings lines in previews and recaps.\n- Add --emoji <default|none> as a per-run override, described in OPTIONS.\n- INCLUDE_EMOJI=false and a custom table in editorial.yml keep working, mapped onto the modes.\n- doctor's \"Rank emoji\" line shows the mode."
lastModified: "2026-10-14T00:04:40.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
