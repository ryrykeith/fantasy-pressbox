# Weekly Power Rankings

Rank every team from 1 to N after the week in `thisWeek`.

## What a power ranking is

<!-- format: dynasty -->
Power rankings answer: **which teams look strongest right now, accounting for
both current strength and dynasty context?**
<!-- end format -->

<!-- format: redraft -->
Power rankings answer: **which teams are most likely to win this season?**
<!-- end format -->

They do not answer "who has the best record". A team can lose with 145 points
and rise. A team can win with 105 and fall. Standings are an input, not the
output.

Weigh the factors in `editorial.rankingWeights`. Those weights are the house
model — respect their relative sizes.

## Positional value

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Each entry states the fact and the instruction that follows
from it. Apply every one of them, and let them override the raw weights where
the two disagree — the weights describe a generic league, that list describes
this one. An empty list means nothing here is unusual and no position needs
adjusting.

## Movement

If `unavailable` names `previousRankings`, this is the first edition: print no
arrows at all, and open by saying there is nothing to move from yet.

Otherwise `previousRankings` holds last edition's order. Print each team's
movement after its name:

```
🥇 1. KICKOFF_KINGS ↑2
🥈 2. TACO TUESDAY ↓1
🥉 3. USER4817 —
```

One week is a tiny sample. Normally keep movement within
`editorial.movementGuidance.max_normal_movement` spots. Move a team further
only when the week genuinely demands it, and say out loud why you broke your
own rule.

**Justify every move with evidence.** "Rose because they won" is not analysis.
"Rose because they scored the third-most points in the league while starting a
backup quarterback" is.

<!-- format: redraft -->
## This season is the only season

Every roster in this league is drafted again from scratch next year. Nothing a
team owns carries over, so judge each roster only on what it can do between
now and the championship.

Age counts only where it bears on this season — a 30-year-old running back
whose touches are already shrinking is a real worry for December. What a player
might be worth next year, or the year after, is not a reason to rank anyone
higher or lower.
<!-- end format -->

<!-- format: dynasty -->
## Draft capital

`futureDraftCapital` lists picks for drafts that **have not happened yet**, and
only those. Picks for the current season and earlier are already spent and are
excluded from the context on purpose — in a league's first year those are
startup-draft picks, and treating them as assets is a straightforward analytical
error.

Read it as follows:

- `baseline` is how many picks a team would hold with no trades. `picksHeld`
  above or below that is the whole story.
- `acquired` and `tradedAway` name the specific picks that moved.
- A team not listed has made no future-pick trades and holds its standard
  allotment. That is the normal case and is not worth remarking on.

Future picks are rookie picks. They matter because they become cheap young
talent or trade currency, not because a spreadsheet says a 2nd is worth points.
Never mention a pick for a draft that has already been held.
<!-- end format -->

## Structure

One post per item, separated by `%%%`:

```
POWER RANKINGS • 1/14
```

1. **Opening.** What changed and what you got wrong last time.
2-13. **One post per team**, ranked 1 to N. Each post carries the rank emoji,
   rank, team name and movement, then:
   - the core of the roster, by name
   - what this week's result actually proved or failed to prove
   - the case for them and the case against them
   - a line beginning `VERDICT:` — one sentence, quotable
14. **Tiers.** Group the teams into tiers. Every team keeps its rank emoji
   here, exactly as in its own post — the tier list is the part people
   screenshot, so it has to be readable on its own:

   ```
   TIER 1 — PLEASE STOP
   🥇 Taco Tuesday
   🥈 Bench Mob
   🥉 Kickoff Kings

   TIER 2 — REAL CONTENDERS
   🔥 Lowered Expectations
   ```

   Leave a blank line between tiers. Name each tier something you wrote this
   week for these teams, not a label you would reuse. Close with a line that will
   look funny in December.

For an `imessage` output format, collapse this into one long message: a short
intro, then a compact block per team, then risers and fallers.

## Machine-readable rankings

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block listing the order you just published:

```json
[
  { "rank": 1, "team": "Kickoff Kings" },
  { "rank": 2, "team": "Taco Tuesday" }
]
```

Team names must match the context exactly, character for character. This is
how next week's edition knows what to measure movement against.
