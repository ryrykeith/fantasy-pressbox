---
id: "cf395cd8-94d6-4689-a0dd-aac1a8144cbc"
level: "epic"
title: "Guillotine (chopped) league coverage"
status: "pending"
priority: "critical"
description: "Support guillotine leagues, where there are no head-to-head matchups and the lowest-scoring team is eliminated every week until one survivor remains.\n\nORIGIN\nReported by a league mate who actually tried to use Fantasy Pressbox on his guillotine league. The generated prompt was not relevant to his format: it described head-to-head matchups that do not exist, called winners and losers of games that are not played, and ranked teams on dynasty asset value in a format where only weekly floor keeps you alive. This is a real user hitting a real wall, and it is the highest-priority item in this PRD.\n\nTHE FORMAT\n- Typically 18 teams (one per NFL regular-season week), though 12- and 17-team variants exist.\n- No matchups. Each week every roster scores, and the LOWEST scorer is eliminated permanently.\n- The eliminated roster is dumped onto the waiver wire and surviving teams bid FAAB (blind) for the players.\n- Rosters get stronger as the season goes on, because the pool keeps absorbing eliminated teams' talent.\n- Strategy inverts the usual advice: play for the FLOOR, not the ceiling. You do not need the most points, only to not be last. Bye-week clustering is a genuine elimination risk. Hoarding FAAB early matters because better players hit the wire later.\n\nTHE CRITICAL TECHNICAL CONSTRAINT\nSleeper has NO native guillotine support. Commissioners run it manually: each week they remove the chopped team's owner and force-drop that roster's players to the waiver pool. Over the API a Sleeper guillotine league still looks like an ordinary head-to-head league, complete with generated matchup pairings that mean nothing. Consequences:\n- The format cannot be detected. It must be declared (see the format engine epic).\n- Sleeper's matchup pairings are noise and must be actively discarded, not merely ignored — src/analysis/week.mjs pairs them via pairMatchups and builds winner/loser/margin facts that are meaningless here.\n- Elimination state is not a field. It has to be derived from manual commissioner actions (emptied roster, removed owner) and/or declared, and derived state from manual actions is unreliable enough to need an operator override.\n\nSources: https://sleeper.com/blog/guillotine-fantasy-football/ and https://rotogrinders.com/fantasy/sleeper-promo-code/guillotine"
lastModified: "2026-09-23T05:41:31.125Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---

## Children

| Title | Status |
|-------|--------|
| [Guard rails against head-to-head output in non-matchup leagues](./guard-rails-against-head-to-head/index.md) | completed |
| [Guillotine editions](./guillotine-editions/index.md) | pending |
| [Guillotine league model](./guillotine-league-model/index.md) | completed |
