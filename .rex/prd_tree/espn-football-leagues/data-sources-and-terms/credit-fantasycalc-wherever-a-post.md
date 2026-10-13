---
id: "7c03bf42-203d-4f75-b994-29c5b43f9d44"
level: "task"
title: "Credit FantasyCalc wherever a post quotes its values"
status: "pending"
priority: "medium"
tags:
  - "fantasycalc"
  - "terms"
  - "validate"
acceptanceCriteria:
  - "An edition with market values instructs the credit line, and validate.mjs catches a post that quotes values without 'Values: FantasyCalc (fantasycalc.com)'"
  - "An edition without market values is unchanged and needs no credit"
  - "The credit counts toward the length limit"
  - "README notes FantasyCalc's non-commercial use and credit terms"
  - "Tests cover Sleeper and ESPN contexts"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "FantasyCalc's terms (https://fantasycalc.com/terms-of-usage, effective Feb 24, 2024, 'Use of Data') require the name 'FantasyCalc' and a link to FantasyCalc.com beside its values, and allow non-commercial use only. Owner decision, 2026-10-13. This fixes Sleeper output as well as ESPN.\n\nTODAY\n- The prompt context marks market values `source: 'FantasyCalc'` (src/promptContext.mjs, around line 795).\n- No prompt tells the model to credit or link FantasyCalc.\n- Nothing checks the finished post.\n- Only README.md links fantasycalc.com.\n\nCHANGE\n- When an edition's context carries market values, the context includes the credit line to use: 'Values: FantasyCalc (fantasycalc.com)'. The prompt instructs that any post quoting a value ends with that line.\n- Check it in code, not by trusting the model: src/validate.mjs refuses (or appends, if that's the existing pattern) when a post quotes market values without the credit line. Work out 'quotes values' from the context: the edition received market values, and the post mentions a valued player or pick with a number. Keep the check simple and explain it in a comment.\n- The credit line counts toward the post-length limit (POST_MAX_LENGTH / SLEEPER_POST_MAX_LENGTH).\n- README: the trade-values section says FantasyCalc's data is for non-commercial use and must be credited, and that Fantasy Pressbox adds the credit.\n- Don't change which values are fetched, or how.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere."
lastModified: "2026-10-13T03:13:28.861Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
