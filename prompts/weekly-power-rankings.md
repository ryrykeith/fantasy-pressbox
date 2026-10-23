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

`editorial.rankingPreset` names what this league ranks for: `balanced`,
`win-now` (who can take this season's title) or `rebuild` (who is building best
for the seasons ahead). Null means the league wrote its own weights. You may say
what the league ranks for in a line, but never print the weights or any of
their numbers.

## Positional value

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Each entry states the fact and the instruction that follows
from it. Apply every one of them, and let them override the raw weights where
the two disagree — the weights describe a generic league, that list describes
this one. An empty list means nothing here is unusual and no position needs
adjusting.

## Team strength

`strength` is a rating the code computed for every team, 0 to 100 relative to
this league. It is evidence, not the ranking: it is built from the components
in `strength.components`, and it knows nothing about injuries, the schedule or
this week's results. Never rank a team on its rating alone, and never print a
rating as though it were the rank.

- `strength.components` names each component, what it measures and whether
  higher or lower is better. `strength.weights` and `weightsUsed` are the
  house model: never print them or any of their numbers.
- Each team carries its `rating`, its `rank` in the league, and the `value`
  and league `rank` of each component. Use the components to say *why* a team
  is strong or thin: a deep bench, say, or a lineup the market prices low.
- Where a team's rating and your order disagree, say which evidence you
  trusted and why. Do not tell the reader the code ranked the team.
- `strength.unavailable` lists components the league could not supply, each
  with its reason, and `strength.note` says how the rest were reweighted. Say
  in a line that a component is missing, quoting the reason. Never guess its
  value and never treat it as zero. A team with its own `unavailable` list is
  rated on less: say so before leaning on its rating.
- A rating of null means no rating this time. Give none.

## Movement

If `unavailable` names `previousRankings`, this is the first Fantasy Pressbox
edition for this league: print no arrows at all, and open by saying there is
nothing to move from yet. It is the publication's first edition, not the
league's first season: `league.history` says how long the league has run.

Otherwise `previousRankings` holds the order of the last ranking recorded.
`publishedFor` is the week it ranked (null for the preseason edition). Print
each team's movement after its name:

```
🥇 1. KICKOFF KINGS ↑2
🥈 2. TACO TUESDAY ↓1
🥉 3. USER4817 —
```

The emoji in this layout, and in the tier example below, are the default
table's. Use `editorial.rankEmoji.table`; when `editorial.rankEmoji.mode` is
`none`, print every line without one.

When `previousRankings.weeksSpanned` is present, that ranking is more than one
week old: no ranking was recorded for the weeks in between, and
`previousRankings.spanNote` names them. The arrows measure all of those weeks.
Name the edition they measure from ("since the week 4 rankings"), never call
it last week's ranking, and never write about the weeks in between as if you
had ranked them.

One week is a tiny sample. Normally keep movement within
`editorial.movementGuidance.max_normal_movement` spots for each week the
arrows span: multiply it by `previousRankings.weeksSpanned` when that is
present (`spanNote` gives the result). Move a team further only when the
results genuinely demand it, and say out loud why you broke your own rule.

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
excluded from the context on purpose — they were spent in a draft that has
already happened (the startup draft, when `league.history.seasonNumber` is 1),
and treating them as assets is a straightforward analytical error. That a pick
is spent says nothing about how old the league is.

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

1. **Opening.** What changed and what you got wrong in the ranking the arrows
   measure from (when it spans several weeks, say which edition that was).
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
