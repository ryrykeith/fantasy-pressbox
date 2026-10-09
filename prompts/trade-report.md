# Trade Report

Grade every trade in `trades`. Each one is graded side by side: what each team
gave up, what it got, and whether it was a good move *for that team*.

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Apply every entry when you judge what a player is worth to
the team that got him.

## What to weigh

- **Value.** If `marketValues` is present, it is the anchor: a real market
  snapshot for this league's settings. Compare each side's `received` items,
  and `receivedMarketTotal` when it helps — it is already summed, so quote it
  rather than adding values up yourself. Apply every entry in
  `marketValues.caveats`. A `market` of null means the item is not priced:
  give it no value. If `unavailable` names `marketValues`, there is no market
  at all — follow that instruction instead.
- **Fit.** `roster` shows each side's projected starters and depth before and
  after the trade, as of the week it was made. `startsAfter` says whether a
  player received would start; `startedBefore` whether one given up did. A
  player who fills an `EMPTY` slot is a different move from the same player
  sitting on a bench.
- **Window.** `standing` is each team's season so far. A win-now move by a
  contender and the same move by a team going nowhere are not the same trade.
  Judge each side against its own situation, and frame any read of its plan
  as your read.
- **What has happened since.** `playerHistory` is each moved player's points
  week by week and which team banked them. A game or two after a trade is a
  small sample: mention it, do not grade on it.

<!-- format: dynasty -->
- **Picks.** A dynasty trade is judged on this season and the ones after it.
  Each traded pick shows its original team's record, points-for, max
  points-for and current seed, and what the market pays for a pick of that
  round. Follow the `projectedDraftSlot` entry in `unavailable` exactly: do not
  put any pick in a tier or name a slot. Quote the tiered values as the range
  the pick could be worth, not as where it will land.
- **Age.** Ages are in the player lines. Use them for the seasons after this
  one, as opinion, not as a fact about any player's future.
<!-- end format -->
<!-- format: redraft -->
- **This season only.** Rosters are re-drafted every year, so a trade is won
  or lost on what it does for the rest of this season. Ignore draft picks
  entirely and do not grade either side on age or future value.
<!-- end format -->
<!-- format: guillotine -->
- **The weekly floor.** In this league the lowest score each week is
  eliminated, so judge a trade purely on whether it raises the team's weekly
  floor — the score it falls to on a bad week — and for how many weeks.
  A ceiling a team cannot rely on does not keep it alive. Ignore draft picks
  and future value entirely: a team that is chopped never collects either.
<!-- end format -->

## Grades

A letter grade from A+ to F for each side. The grades are independent: both
sides can win a trade, and both can lose one.

A trade with no clear winner may be called exactly that. If the facts do not
separate the two sides, say it is even and say why, rather than forcing a
verdict the context does not support.

## Structure

Four posts per trade, separated by a line containing only `%%%`, numbered in
the header across the whole edition:

```
TRADE REPORT • 1/4
```

1. **The deal.** Who got what, and the week it went through. Keep it tight.
2. **The first team's grade.** The letter grade, then why.
3. **The second team's grade.** The letter grade, then why.
4. **The verdict.** Who won, or that nobody did, and the one fact that would
   change the verdict if it moved.

A trade with more than two teams gets one grade post per team.

## Rules for this edition

- Cite only players, picks and teams that appear in `trades`. Do not bring in
  any other player for comparison.
- Every number you print — a value, a point total, a record, a seed — must be
  in the context exactly as written.
- Never use a phrase listed in `editorial.bannedPhrases`.
- No JSON block at the end. This edition is not recorded.
