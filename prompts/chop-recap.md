# Chop Recap

The week is over and the scores in `thisWeek` are final. This is a guillotine
league: every team scored on its own, and the lowest scorer of the teams still
alive has just been eliminated permanently. This is the autopsy.

Nobody in this league ever played anybody, and nothing here was decided
head-to-head. Every fact you have is one team's own score, measured against
the rest of the field or against the line that decided who stays.

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Apply every entry when you explain why a score looks the
way it does. An empty list means nothing here is unusual.

## What you know

- `standings` — the teams still alive after this week's chop, ranked on points
  scored so far. The team that just went is **not** on this list.
- `survivorCount` — exactly how many teams are left. State this number as
  given; do not recount it yourself from `standings`, and do not round it.
- `eliminationHistory` — every chop so far, including this week's. The entry
  whose `week` matches the top-level `week` field below is this week's chop.
- `dangerBoard.lastCompletedWeek` — this week's own chop-line picture:
  `chopLine` is the score that was not enough to survive it, `survivalMargin`
  is how close the team directly above that line came to going instead, and
  `scoringOrder` ranks every team that played this week with each one's
  `marginAboveChopLine`. The team with a margin of 0 is the one just chopped.
- `dangerBoard.floors` — each surviving team's `lowest` and `median` score
  across the season, worst first. Useful for saying whether this chop was a
  fluke or the predictable end of a bad season.
- `thisWeek.teams` — every team's own week: starters, points, bench
  highlights, potential points and lineup efficiency, including the team that
  just went. Find it by name using the chop identified above.
- `thisWeek.awardFacts` — every number already computed; print it, do not
  recompute it. Only hand out awards switched on in `editorial.awards`.
- `faabMarket` — what survivors have left to spend, and every pool a chop has
  released onto the wire. The entry in `releasedPools` whose `week` matches
  the top-level `week` field below is what this week's chop just dumped onto
  it; older entries are earlier chops and are background, not this week's
  news.
- `previousPredictions` — last week's called chop, graded against what
  actually happened.

Read `unavailable` first. It names the things this edition does not know.
Each entry carries an instruction; follow it exactly.

## Structure

One post per item, separated by `%%%`, numbered in the header:

```
CHOP RECAP • 1/6
```

1. **The chop.** Name who went and the score it took them out on. State the
   survival margin from `dangerBoard.lastCompletedWeek` — how close the team
   directly above the line came to being the one gone instead. State
   `survivorCount` plainly: how many teams are left in the league.
2. **The autopsy.** The eliminated team's own week from `thisWeek.teams`:
   starters, points, bench, potential points, lineup efficiency. If a better
   lineup would have survived the week — check `potentialPoints` against
   `chopLine` — say so without mercy. A manager who got chopped while leaving
   points on the bench is the most brutal fact this format produces; do not
   bury it.
3. **Who nearly went.** Name the team with the smallest nonzero
   `marginAboveChopLine` in `dangerBoard.lastCompletedWeek.scoringOrder` and
   the specific number that saved it.
4. **The wire.** What this week's chop released, named players and their
   points from `faabMarket.releasedPools`. Then what survivors have left to
   spend, and who is positioned to buy the roster that just hit the pool.
5. **Grading the call.** If `previousPredictions` is present, state plainly
   whether last week's called chop was right, and name who was actually
   called for it. If `unavailable` names `previousPredictions`, skip this
   post entirely rather than inventing a record.
6. **Around the league and closing.** Any award from `thisWeek.awardFacts`
   not already used above — a big score, a rough bench, an efficient week —
   restated survivor count, and a line pointing at what's next.

Adjust the count if there is less to say; keep the `x/total` numbering honest.

## Rules for this edition

- Nobody in this league ever played anybody, so there is nothing to call a
  result. Every fact here is one team's own score, measured against the rest
  of the field or against the chop line. Never frame it as one team against
  another.
- Never soften the chop with hedging ("unfortunately," "sadly"). State the
  score and the margin and move on — the format is blunt and so is the
  coverage of it.
- `survivorCount` is a fact, not an estimate. Use the number given, exactly.
- A team's floor (`dangerBoard.floors`) explains a season, not one week. Use
  it to say whether this chop was coming, not to predict who goes next — this
  edition is about the week that already happened.
- One joke per post at most, rooted in something specific to this league.
