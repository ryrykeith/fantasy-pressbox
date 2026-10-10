---
id: "109292da-9243-4a01-a38a-1f9eb64dac53"
level: "task"
title: "Return the shipped rookie-draft.yml to a template once the operator's league runs from its own folder"
status: "completed"
priority: "high"
startedAt: "2026-10-10T17:53:34.996Z"
completedAt: "2026-10-10T17:54:36.259Z"
endedAt: "2026-10-10T17:54:36.259Z"
acceptanceCriteria:
  - "The shipped config/rookie-draft.yml declares no order, rounds or start week"
  - "config/prospects.2027.yml is not tracked in the repository"
  - "tests/rookie-draft-rule.test.mjs asserts the shipped file declares nothing"
  - "The operator's workspace outside the repository still shows the rule and board in doctor"
description: "BLOCKED ON THE OPERATOR: this task can only start after the operator has run `node src/cli.mjs migrate ~/leagues/<name>` from the checkout and checked the result with `doctor --workspace`. Order matters. migrate copies config/rookie-draft.yml and config/prospects.2027.yml from the checkout, so emptying them first would drop the league's rule and board from the copy. The agent session that built migrate (task dc9a9068) could not write outside the repository, so it could not do the migration itself.\n\nVerified on 2026-10-10 against a temp copy of the live data: week 5 measures against week 4; user4817 and Pick Six Appeal both resolve to roster 5; doctor shows the rule, linear rounds and the 12-prospect board.\n\nTHEN:\n- Return config/rookie-draft.yml to an empty template: order:, rounds: and tank_watch.start_week: all empty, keeping the explanatory comments. Drop the \"This league:\" paragraph.\n- Run git rm on config/prospects.2027.yml. The package ships only prospects.example.yml.\n- In tests/rookie-draft-rule.test.mjs, flip 'the committed config/rookie-draft.yml is readable and declares a projectable rule' back to 'the shipped config/rookie-draft.yml is readable and declares nothing' (order null; rounds null). Remove the PR #16 stopgap comment.\n- Check that no other test reads the shipped prospects.2027.yml.\n- Do not delete the checkout's data/, output/ or .env. The operator removes those after checking."
commits:
  - {"hash":"c2b617cf2443c4ba11be31d7d1ae6f7d3477d493","author":"Ryan Keith","authorEmail":"ryan.k@endash.us","timestamp":"2026-10-10T13:55:50-04:00"}
lastModified: "2026-10-10T17:55:50.797Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
