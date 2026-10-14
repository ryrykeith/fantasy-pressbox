---
id: "bfa4786b-0239-4cc7-9b61-0c0072225d4c"
level: "task"
title: "Refuse hostile input in the parsers"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "A YAML or JSON key named __proto__, constructor or prototype is refused with an error naming the file and the key"
  - "The 2026-10-12 reproduction is a regression test"
  - "The size, depth and string-length limits have tests at and just over each limit"
  - "Every shipped config file still parses"
run: {"tier":"heavy","models":{"claude":"claude-opus-5-5"}}
description: "READ FIRST (2026-10-13, after ESPN merged to main as #8): Owner decisions 2026-10-13: core supports ESPN on the IMPORT route only (the cookie fetch stays CLI-only, like --generate); a league file STRIPS member IDs, owners[] and first/last names from saved ESPN pages.\n- src/espn/import.mjs already refuses __proto__/constructor/prototype keys (HOSTILE_KEYS) and pages over 20 MB (MAX_IMPORT_BYTES) in parseSavedFile. Make it use the same reviver and limits as core's other parsers rather than a second copy, with the limits sized for an ESPN league page; its refusals must keep naming the file and never echo a value.\n\nThe website will parse files a stranger could hand it, and the CLI's import-league will parse the same files.\n\nFound 2026-10-12: src/lib/yaml.mjs builds {} and assigns keys, so a nested __proto__: table sets that object's prototype. Parsing 'output:' with a nested '__proto__:' table holding 'include_emoji: false' gives an output object whose Object.keys and JSON are empty, yet output.include_emoji reads false. deepMerge in config.mjs copies keys the same way.\n\n- Refuse __proto__, constructor and prototype keys in the YAML reader, in deepMerge, and in a JSON reviver that core exports for league files.\n- Add limits that core's parsers enforce: file size, nesting depth and string length.\n- Errors are in plain words and name the file and the field."
lastModified: "2026-10-14T00:04:40.000Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
