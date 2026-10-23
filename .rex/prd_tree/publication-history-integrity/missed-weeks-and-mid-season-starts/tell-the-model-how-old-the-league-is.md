---
id: "b9d2b37a-2d6f-4760-852d-45c814160691"
level: "task"
title: "Tell the model how old the league is, apart from the publication"
status: "pending"
priority: "high"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A Sleeper league renewed from 2023 gets firstSeason 2023 and seasonNumber 4 in its 2026 context; a league with no previous_league_id gets seasonNumber 1"
  - "The chain is walked once and cached; a second edition makes no extra Sleeper calls for it"
  - "An unreadable chain or an ESPN league gets an unavailable entry, and the .env override replaces either"
  - "The first-edition note names it the first Fantasy Pressbox edition and, when seasonNumber > 1, says the league is not new"
  - "The prompts forbid calling it the league's first season unless seasonNumber is 1, and forbid describing earlier seasons' events"
  - "Tests cover a renewed league, a first-season league, a broken chain and the override, with a stub client (no network)"
description: "Found 2026-10-22: the first rankings for a league in its fourth season (started 2023) came back framed as the league's first year, and the operator had to rewrite the opening. Two causes. (1) The context carries no fact about the league's age: context.league (src/promptContext.mjs) has season 2026 and nothing else, though the Sleeper normalizer already reads previous_league_id (src/sleeper/normalize.mjs, previousLeagueId) and drops it. (2) The first-edition note says 'No earlier ranking has been published, so this is the first edition' without saying whose first, and the rankings prompts mention 'a league's first year' in the draft-capital section, which together invite the reading. Sleeper's previous_league_id chain gives the answer: for the operator's dynasty league it walks 2026 -> 2025 -> 2024 -> 2023 and stops. WHAT TO ADD: walk the chain once (provider client; Sleeper only, ESPN reports unavailable), cache the result in the league folder so editions do not repeat it, and put context.league.history = { firstSeason, seasonNumber, source } in every edition's context, or an unavailable entry with its reason when the chain cannot be read. An optional .env override (for example LEAGUE_FIRST_SEASON) for a league that was recreated rather than renewed, or an ESPN league; init shows what it found ('Sleeper says this league started in 2023: 2026 is its 4th season') and offers the override. Reword the first-edition note to 'the first Fantasy Pressbox edition for this league', and when seasonNumber > 1 say outright that the league is not new. Prompts (system.md and the ranking prompts): call it the league's first season only when seasonNumber is 1; describe nothing from earlier seasons (champions, trades, standings) because none of it is on file, beyond the bare fact of how many seasons the league has run. Decide whether the league file carries the cached history."
lastModified: "2026-10-22T19:53:19.982Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
