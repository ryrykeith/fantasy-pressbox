---
id: "76506cdc-d612-4d5b-a567-5b92c2b40bd3"
level: "task"
title: "Keep recording replies the old reader accepted: CRLF, a trailing %%%, an inline closing fence"
status: "pending"
priority: "high"
blockedBy:
  - "e5da55bf-6596-4a02-9dee-a8c95a653c05"
source: "review of e5da55bf on fix/untagged-json-fence, 2026-10-22"
acceptanceCriteria:
  - "A CRLF reply, tagged or untagged, records exactly as the same reply with LF does"
  - "A reply ending in a %%% line after the block records the block; a fence inside a post before that is still never read"
  - "A block whose closing fence ends the JSON's last line is found"
  - "An opening fence after the last %%% with no closing fence gets the 'could not read it as JSON' error, not 'No JSON block found'"
  - "stripJsonBlock removes the block in each of these cases and leaves the posts"
  - "Every existing test in tests/json-block.test.mjs passes unchanged; npm test passes"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "Found in review 2026-10-22 of 'Accept an untagged fence for the machine-readable block' (e5da55bf, commit 28a11b3). findJsonBlock (src/validate.mjs) now finds the block after the last %%% line, but its fence pattern refuses replies the old ```json regex on main accepted, so they fail record with 'No JSON block found'. Probed on the branch against main:\n- Windows line endings (CRLF), tagged or untagged: main records, branch 'none'. The opening fence needs [ \\t]*\\n and the closing fence [ \\t]*$ with the m flag, so a \\r before the newline breaks both. The old regex used \\s*\\n. A record file saved on Windows hits this.\n- A %%% line after the block (the model closes with a separator): main records, branch 'none', because the tail after the last %%% is empty.\n- The closing fence on the JSON's last line (]``` with no newline before it): main records, branch 'none'.\n- A reply cut off before the closing fence (```json and a partial array, no closing ```): branch says 'No JSON block found', so the new 'could not read it as JSON ... may have been cut off' error never shows for the commonest unreadable case.\nWHAT TO CHANGE in findJsonBlock (stripJsonBlock and extractJsonBlock follow it):\n- Normalize \\r\\n and a lone \\r to \\n before searching. Offsets returned for stripJsonBlock must still slice the text the caller passed in, or stripJsonBlock must return the normalized text: pick one and test it.\n- If the tail after the last %%% holds only whitespace, use the tail after the %%% before it instead (at most one step back).\n- Accept a closing fence that ends the JSON's last line as well as one on its own line.\n- An opening json-tagged or untagged fence after the last %%% with no closing fence is 'unreadable', not 'none'.\nKeep everything e5da55bf established: a fence before the last %%% (inside a post) is never read; a json tag in any case wins over an untagged fence; fences in other languages are not the block. Add the cases to tests/json-block.test.mjs. No CHANGELOG entry: entries are written at release."
lastModified: "2026-10-23T00:55:47.695Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
