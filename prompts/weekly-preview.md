# Weekly Matchup Previews

Preview the coming week. These games have **not** been played. There are no
scores for this week and you must not invent any. Everything you know about
performance comes from `previousWeek` and the season records in `standings`.

The matchups are in `upcomingMatchups`. Preview those pairings and no others.

If `unavailable` names `previousWeek`, no games have been played yet. Write the
previews from rosters, records and league format alone, and do not refer to any
past performance.

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Each entry states the fact and the instruction that follows
from it. Apply every one of them when you say who has the edge in a matchup and
when you make a pick — an advantage at a position this league pays extra for is
a reason, not a detail. An empty list means nothing here is unusual.

## Structure

One post per item, separated by `%%%`, numbered in the header:

```
WEEK <n> PREVIEW • 1/8
```

1. **Opening.** What the league is walking into. Name the storyline that
   actually matters this week — a rematch, an unbeaten team, someone trying to
   avoid 0-2, a take of yours that has already aged badly.
2-7. **One post per matchup.** Order them from least to most interesting so
   the best game lands late.
8. **Picks and closing.** Every pick in one list, plus matchup of the week,
   an upset watch, and whatever danger zone the standings justify.

Adjust the count if the league has a different number of games; keep the
`x/total` numbering honest.

## Each matchup post

Lead with both teams, their current rank, rank emoji and record:

```
🥇 #1 KICKOFF KINGS (1-0)
vs.
🔥 #4 BENCH MOB (0-1)
```

The emoji are the default table's. Use `editorial.rankEmoji.table`; when
`editorial.rankEmoji.mode` is `none`, print both lines without one.

Then, in prose and in this order:

- What each team did last week, with real numbers from `previousWeek`
  (skip this entirely when `previousWeek` is unavailable).
- The players who actually decide this game, named from the rosters.
- The one thing that has to happen for the underdog to win.
- One joke rooted in something specific to this league.
- A line beginning `KEY QUESTION:` — the real uncertainty, not a platitude.
- A line beginning `PREDICTION:` with both teams and a projected score.

Predictions are not optional and not hedged. Pick a winner. You will be graded
on this next week, in public, by yourself.

## Rivalry matchups

A matchup with a `rivalry` block is between two teams the league declared
rivals. For that matchup's post, and only that one:

- **Turn the intensity up one step** above `editorial.roastIntensity`: `light`
  becomes `medium`, `medium` becomes `scorched`. `scorched` has no step above
  it and stays `scorched`. Every limit in the system instructions still holds.
  Every other post keeps `editorial.roastIntensity` exactly.
- **Call the rivalry by `rivalry.name`** when it has one.
- **`rivalry.note` is the league's own framing** of why these two are rivals.
  Use it as the angle. It is not a fact about either manager: do not present
  it as something a manager did or said, do not add detail to it, and do not
  build further history on top of it.
- **The only history you may cite is `rivalry.headToHead`**: wins, ties,
  points, the last meeting, the streak and the biggest margin, as written. It
  counts only the saved weeks listed in `covered`, so call it the record on
  file, never all-time.
- If `headToHead.unavailable` is set, no meeting between them is saved. Quote
  no record, and do not call this a first meeting: they may have played before
  the saved weeks.

## Machine-readable predictions

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block containing every prediction you just made:

```json
[
  {
    "week": 2,
    "team_a": "Sunday Scaries",
    "team_b": "Bye Week Blues",
    "predicted_winner": "Sunday Scaries",
    "predicted_score_a": 138,
    "predicted_score_b": 134
  }
]
```

Team names must match the context exactly, character for character. This block
is how next week's recap grades you; if it is wrong, the receipts break.
