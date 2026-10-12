---
id: "3bb252d4-e95d-451b-8724-d38e3df34979"
level: "task"
title: "Fix positionFromEligibleSlots: team defenses and IDP positions"
status: "pending"
priority: "high"
tags:
  - "espn"
  - "ndx-adversarial-review"
  - "severity:high"
  - "severity:medium"
source: "ndx-adversarial-review"
acceptanceCriteria:
  - "A team defense (name containing '/', eligibleSlots like [16, 20, 21]) gets position 'DEF'"
  - "A player whose first eligible slot is DT, DE, CB, S, P or HC gets that slot name as position and does not throw"
  - "Bench, IR or slot 22 as the chosen slot throws EspnCodeError naming the player"
  - "positionFromEligibleSlots never calls lineupSlot(); the 'known gap' test is replaced"
  - "Full suite passes"
run: {"models":{"claude":"claude-sonnet-5-5"}}
description: "Fix src/espn/codes.mjs#positionFromEligibleSlots to the corrected rule in docs/espn-data.md, 'Positions'. Two findings from the review of the ESPN code tables task (run 7bcc435e), merged here.\n\nTHE BUGS\n1. Every team defense is refused. The doc's position rule (commit 6a730ae) dropped the second clause of espn-api's condition (football/player.py:30-34):\n   (pos != 25 and \"/\" not in POSITION_MAP[pos]) or \"/\" in self.name\n   A defense, named like \"… D/ST\", has eligibleSlots like [16, 20, 21]. Slot 16 is named 'D/ST', so it was skipped, and the rule then reached BE and threw. That was the doc's error, now fixed.\n2. Positions go through the starting-slot refusal. The function calls lineupSlot(id), so a player whose first eligible slot is DT, DE, CB or S (not mapped for starting) throws. A position is not a starting slot.\n\nTHE FIX (follow docs/espn-data.md 'Positions', the corrected version)\n- positionFromEligibleSlots(eligibleSlots, fullName) applies both clauses. The second clause, a '/' in the player's name, takes the first eligible slot whatever it is.\n- It returns the espn-api SLOT NAME (lineupSlotEntry(id).name), not the shared slot. Never call lineupSlot() for a position.\n- 'D/ST' is rewritten to 'DEF'. No other name is rewritten.\n- If the chosen slot is BE (20), IR (21) or slot 22, no position was found: throw EspnCodeError, naming the player.\n- Replace the test that pins the old D/ST failure as a 'known gap'.\n\nDon't add the IDP league refusal here; it belongs to the league normalizer task.\n\nHOUSE RULES\n- Never invent a fact.\n- No real league data anywhere. Use invented names such as 'Taco Tuesday D/ST'."
lastModified: "2026-10-12T17:56:03.631Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
