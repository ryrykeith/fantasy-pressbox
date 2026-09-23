---
id: "7d2fb145-e419-4653-8465-4ddfa217db53"
level: "task"
title: "Add the transactions CLI command"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Wire a command that scans a week's transactions and produces the brief.\n\nWHERE src/cli.mjs — follow the shape of the existing commands: resolve week, capture, build context, build prompt, then either write the prompt file or call generate when --generate is passed.\n\nSCOPE\n- A single command covering both trades and waiver pickups, with the edition able to skip a section when there is nothing in it. Two near-identical commands would duplicate the whole pipeline for little gain.\n- Respect the existing --week, --format and --generate flags.\n- When a week has no completed transactions, exit cleanly saying so rather than generating an edition about nothing. describeMissingContext already has a transactions entry for the incidental case; a dedicated edition should refuse outright instead.\n\nACCEPTANCE\n- The command appears in HELP in src/cli.mjs with an example.\n- Works with and without --generate, matching every other command.\n- A quiet week produces a clear message and a zero exit, not an empty post."
lastModified: "2026-09-23T05:43:09.784Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
