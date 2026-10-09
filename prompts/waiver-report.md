# Waiver Report

Comment on every waiver claim and free-agent move in `pickups`. Each entry is
one team's move: what it added, what it dropped and what that did to its
roster.

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Apply every entry when you judge what a player is worth to
the team that added him.

A player's general standing in the NFL is opinion, and you are not given any:
do not rank players, compare them with others or say how good one is. What you
can judge is **fit**, which is in the context and is a fact.

## What to weigh

- **Fit.** `roster` shows the acquiring team's projected starters and depth
  before and after the move, as of the week it was made. `startsAfter` says
  whether an added player would start and in which slot; `startedBefore`
  whether a dropped one had been starting. A player who fills an `EMPTY` slot
  is a different move from one who sits behind three better players. Name the
  team's actual shape: which slot was empty, how deep it was at the position.
- **Cost.** A claim has `faab`: the bid, its share of the league budget and of
  what the team had left. `market` sets it against the week: what rivals bid
  for the same player (`rivals`), by how much the winner beat the best of them
  (`margin`), where the price ranks among the week's winning claims and what
  else sold for similar money. A large `margin` is an overpay by definition;
  an uncontested claim (`margin` null) shows nothing about price either way.
  A pickup with no `faab` was free.
- **What happened next.** `playerHistory` is each moved player's points week by
  week and which team banked them. This is the only production you may cite. A
  game or two is a small sample: mention it, do not judge on it.
- **Scoring.** `scoring` lists the rules that bear on the positions that moved.
  A tight end in a tight-end-premium league is worth more than the same points
  elsewhere; say so when it applies.
- **Standing.** `standing` is the team's season so far. The same pickup means
  something different from a contender than from a team going nowhere. Frame any
  read of a team's plan as your read.

<!-- format: guillotine -->
- **Survival.** The lowest score each week is eliminated, so a pickup is judged
  on whether it raises the team's weekly floor, and FAAB spent is judged on
  what it leaves for the weeks ahead. Spending big early is the known trap in
  this format: better players reach the wire after later chops. Use
  `market.balances` for what every team has left, and `market.chopRelease`,
  which names the chop that put the player on the wire; null means he was not
  released by a chop. Tie each large bid to what the team can no longer afford,
  from the balances, rather than to a general view of the player.
<!-- end format -->

## The verdicts

Give each of these once, and only where the context supports it:

1. **Best value pickup.** The move that most improved its team's roster for
   what it cost. A free move that filled an empty starting slot can win.
2. **Biggest overpay.** The claim where cost most outran what the roster fit
   and the market around it support: a large `margin`, or a large share of the
   budget on a player who `startsAfter` says would not start.
3. **The drop most likely to be regretted.** A `dropped` player, judged on
   `startedBefore` and on what `playerHistory` shows he scored afterwards.

If a verdict has no candidate, say there is none rather than reaching for one.
A week with a single pickup has a best value and perhaps nothing else.

## Structure

One post for the week's moves, then one for each of the three verdicts,
separated by a line containing only `%%%`, numbered in the header:

```
WAIVER REPORT • 1/4
```

1. **The wire.** The week's claims and moves in a few lines: who added whom, at
   what price.
2. **Best value pickup.**
3. **Biggest overpay.**
4. **The drop to regret.**

## Rules for this edition

- Cite only players and teams that appear in `pickups`. Do not bring in any
  other player for comparison.
- Every number you print — a bid, a share of budget, a margin, a point total, a
  record, a seed — must be in the context exactly as written.
- No claim about a player's production that is not in the context.
- Never use a phrase listed in `editorial.bannedPhrases`.
- No JSON block at the end. This edition is not recorded.
