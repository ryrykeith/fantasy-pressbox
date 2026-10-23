---
id: "e5da55bf-6596-4a02-9dee-a8c95a653c05"
level: "task"
title: "Accept an untagged fence for the machine-readable block"
status: "pending"
priority: "medium"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A reply whose block after the last %%% has a bare fence records exactly as a json-tagged one does"
  - "A fenced block before the last %%% (in a post) is never read as the machine-readable block"
  - "A block that is found but does not parse gets an error saying so"
  - "stripJsonBlock removes the untagged block too"
  - "Tests cover tagged, untagged, uppercase JSON, unparseable and no-block replies"
description: "Found 2026-10-22: recording the operator's week 6 rankings failed with 'No ```json block found at the end of that file.' although the block was there. The chat had written the ranking block after the last %%% with a bare fence (three backticks, no language tag); the week 2-4 replies had been tagged json. extractJsonBlock (src/validate.mjs) matches only fences tagged json, and stripJsonBlock likewise, so the operator had to edit the file by hand. Both the CLI's record and the website's paste flow go through these. WHAT TO CHANGE: after the last %%% line, accept the final fenced block whether tagged json, JSON or untagged, provided it parses; keep preferring a json-tagged block when there is one. A block that is present but does not parse gets its own error saying it was found and could not be read, instead of 'No json block found'. stripJsonBlock strips the same block extractJsonBlock reads. Applies to every recordable edition (rankings, predictions, survival editions, postseason)."
lastModified: "2026-10-22T19:42:09.081Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
