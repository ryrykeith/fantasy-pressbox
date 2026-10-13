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
description: "The website will parse files a stranger could hand it, and the CLI's import-league will parse the same files.\n\nFound 2026-10-12: src/lib/yaml.mjs builds {} and assigns keys, so a nested __proto__: table sets that object's prototype. Parsing 'output:' with a nested '__proto__:' table holding 'include_emoji: false' gives an output object whose Object.keys and JSON are empty, yet output.include_emoji reads false. deepMerge in config.mjs copies keys the same way.\n\n- Refuse __proto__, constructor and prototype keys in the YAML reader, in deepMerge, and in a JSON reviver that core exports for league files.\n- Add limits that core's parsers enforce: file size, nesting depth and string length.\n- Errors are in plain words and name the file and the field."
lastModified: "2026-10-13T02:35:38.785Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
