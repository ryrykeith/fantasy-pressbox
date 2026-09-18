# Weekly Matchup Previews

Preview the coming week. These games have **not** been played. There are no
scores for this week and you must not invent any. Everything you know about
performance comes from `previousWeek` and the season records in `standings`.

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
🥇 #1 WIZARDBEEF (1-0)
vs.
🔥 #4 CHEFLAMB1738 (0-1)
```

Then, in prose and in this order:

- What each team did last week, with real numbers from `previousWeek`.
- The players who actually decide this game, named from the rosters.
- The one thing that has to happen for the underdog to win.
- One joke rooted in something specific to this league.
- A line beginning `KEY QUESTION:` — the real uncertainty, not a platitude.
- A line beginning `PREDICTION:` with both teams and a projected score.

Predictions are not optional and not hedged. Pick a winner. You will be graded
on this next week, in public, by yourself.

## Machine-readable predictions

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block containing every prediction you just made:

```json
[
  {
    "week": 2,
    "team_a": "Cokeheads",
    "team_b": "Virginia Virgins",
    "predicted_winner": "Cokeheads",
    "predicted_score_a": 138,
    "predicted_score_b": 134
  }
]
```

Team names must match the context exactly, character for character. This block
is how next week's recap grades you; if it is wrong, the receipts break.
