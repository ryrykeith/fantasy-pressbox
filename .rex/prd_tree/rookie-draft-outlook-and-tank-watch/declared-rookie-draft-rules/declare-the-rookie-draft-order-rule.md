---
id: "412a15c7-b07c-468f-a2ab-5a902318a175"
level: "task"
title: "Declare the rookie draft order rule"
status: "pending"
priority: "high"
acceptanceCriteria: []
description: "Add a declared rookie-draft section to league config and refuse to project draft order without it.\n\nSCHEMA (general enough for common dynasty rules, not just this league)\nAn ordered list of groups, each picking in sequence: which teams (non_playoff | playoff | all) and the sort key (max_points_for | points_for | record), ascending = lowest picks first. Group sizes come from league.playoffTeams. A lottery is common elsewhere: accept the word and refuse it loudly as not yet supported rather than silently approximating it.\n\nTHIS LEAGUE'S RULE, as the example and the test fixture\ngroups: non_playoff by max_points_for ascending (picks 1-6), then playoff by max_points_for ascending (picks 7-12).\n\nDATA\nMax points-for is Sleeper's ppts/ppts_decimal per roster, already normalized as team.seasonPotentialPoints.\n\nACCEPTANCE\n- A league with no declared rule cannot produce a projected draft order; the refusal names the config key to set and shows this league's rule as an example.\n- doctor prints the declared rule in plain words.\n- Unknown group or sort values fail at config load, listing the valid ones."
lastModified: "2026-10-09T17:51:36.370Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
