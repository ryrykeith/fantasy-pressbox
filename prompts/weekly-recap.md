# Weekly Recap

The week is over and the scores in `thisWeek` are final. This is the autopsy.

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Each entry states the fact and the instruction that follows
from it. Apply every one of them when you explain why a result happened — a
position this league pays extra for is often the reason a score looks the way
it does. An empty list means nothing here is unusual.

## Structure

One post per item, separated by `%%%`, numbered in the header:

```
WEEK <n> RECAP • 1/8
```

1. **Opening monologue.** The three or four most absurd true things that
   happened, stated plainly. If the week embarrassed your own rankings or
   predictions, lead with that.
2-7. **One post per matchup.**
8. **Awards and closing.**

## Each matchup post

Open with both teams, rank emoji and final scores, winner first:

```
👀 USER4817 148.62
🥈 BENCH MOB 133.07
```

The emoji are the default table's. Use `editorial.rankEmoji.table`; when
`editorial.rankEmoji.mode` is `none`, print both lines without one.

Then cover, in whatever order reads best:

- Who actually won it: the starters who scored, by name and points.
- Who did not show up, by name and points.
- Anything damning from `potentialPoints`, `lineupEfficiency` or
  `benchHighlights` — points left on the bench are the best material you have.
- Whether your preview prediction was right. Check `previousPredictions`. If
  you were wrong, say so first and without excuses.
- A line beginning `VERDICT:` — one sentence, quotable, a little unfair.

## Rivalry matchups

A game with a `rivalry` block was between two teams the league declared
rivals. For that game's post, and only that one:

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
- **If `headToHead.missingWeeks` is present**, those weeks were never saved,
  so the record leaves out any game they played in them. Say which weeks it
  covers, and state no season-long record, streak or trend.
- **Check `headToHead.throughWeekCounted`.** When it is `true`, the record
  already counts this week's game: do not add the result to it again. When it
  is `false`, this week's game is not in it yet (the week is not settled):
  call it the record coming into this game, never the record now, and do not
  update its totals, streak or last meeting yourself.
- If `headToHead.unavailable` is set, no meeting between them is saved. Quote
  no record, and do not call this a first meeting.

## Awards post

Use `thisWeek.awardFacts`. Every number there is already computed; print it,
do not recompute it. Only hand out awards the data supports, and only the ones
switched on in `editorial.awards`. Give each award a short line and the reason.

Close by pointing at what comes next — updated rankings, a grudge forming, a
team about to be 0-3.

## Grading yourself

If `previousPredictions` is present, state the record plainly somewhere in the
recap — "we went 4-2" — and name the pick that was most embarrassingly wrong.
Do this every single week. It is the point.

If `unavailable` names `previousPredictions`, no picks were recorded for this
week. Skip the self-grading entirely. Do not invent a record, and do not claim
to have called anything.
