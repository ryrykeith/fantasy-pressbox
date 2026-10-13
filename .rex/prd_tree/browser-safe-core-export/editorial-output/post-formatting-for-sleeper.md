---
id: "326b9efc-5b2b-483a-94f4-24e51ff544be"
level: "task"
title: "Post formatting for Sleeper"
status: "pending"
priority: "high"
acceptanceCriteria:
  - "formatPost tests cover CRLF, trailing spaces and runs of blank lines, and leave single blank lines alone"
  - "looksCollapsed is true for a highlighted copy of a multi-paragraph invented edition, and false for the same text with its blank lines"
  - "check and record print the warning for a collapsed reply"
  - "The copy-button advice appears in the getting-started steps and in record's help"
run: {"tier":"standard","models":{"claude":"claude-sonnet-5-5"}}
description: "The owner's spacing test (2026-10-12, Sleeper on a computer) found:\n- Sleeper keeps ordinary blank lines pasted as plain text. Lines holding only U+2800, U+200B, U+00A0 or U+3164 also show as blank lines.\n- Blank lines are lost when a reply is highlighted and copied in ChatGPT. ChatGPT's own copy button keeps them.\n\nAdd to core:\n- formatPost(text): turns \\r\\n into \\n, trims trailing spaces, and collapses three or more line breaks into one blank line. It keeps the model's blank lines and adds no invisible characters.\n- looksCollapsed(posts): true when posts run several lines with no blank line anywhere.\n\nIn the CLI:\n- check and record warn when looksCollapsed is true, telling the user to copy the reply with the chat's copy button.\n- The getting-started steps and record's help say to copy with the copy button, not by highlighting.\n- The planned post command will use formatPost.\n\nThe Sleeper phone apps are unchecked. Don't re-space posts by rule."
lastModified: "2026-10-13T02:35:41.238Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
