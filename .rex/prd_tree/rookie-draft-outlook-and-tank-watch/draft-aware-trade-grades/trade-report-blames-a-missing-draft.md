---
id: "b6fdfc96-0963-4f17-ad2a-36c3dfb8e475"
level: "task"
title: "Trade report blames a missing draft rule when only later-year picks moved"
status: "pending"
priority: "medium"
source: "operator review session 2026-10-22"
acceptanceCriteria:
  - "A trade report whose only traded picks are for a later draft than the projected one gets the 'Only the <season> draft is projected' explanation, not the no-rule one"
  - "The no-rule explanation appears only when no order is projected"
  - "The CLI does not say traded picks are valued at their projected slot when none of them is in that class"
  - "Tests cover projected-year picks only, later-year picks only, both, and no declared rule"
description: "Found 2026-10-22 on an operator's week 7 trade report: a dynasty trade whose only pick was a 2028 1st. config/rookie-draft.yml declares a projectable order and the 2027 draft is projected, yet the prompt's projectedDraftSlot entry said 'no projectable rule is declared in config/rookie-draft.yml, or the league does not report how many teams make the playoffs'. Cause: buildContext (src/promptContext.mjs, the trade-report block) sets context.draftProjection only when some traded pick is in the projected season (tradedPicks.some(pick.season === projectable.draftSeason)). With only 2028 picks traded it stays null, and projectedPicksUnavailable (src/tradePicks.mjs) takes its !draftProjection branch, which is the no-rule explanation, instead of its existing 'Only the <season> draft is projected ... The <later seasons> ...' branch. The instruction was right (place no slot), the reason was false. The CLI line in src/edition.mjs ('Traded 2027 picks are valued at their projected slot') also printed though no 2027 pick moved. FIX: let projectedPicksUnavailable tell 'nothing is projected' from 'something is projected, just not these picks' (pass the projected season separately from the draftProjection view, or always build the view when an order is projected and only omit it from the context); say in the CLI which traded picks are slotted, or that none of them are in the projected class. Check future-stock, which shares projectedPicksUnavailable, for the same case."
lastModified: "2026-10-22T20:11:28.655Z"
lastModifiedBy: "Ryan Keith <ryan.k@endash.us>"
---
