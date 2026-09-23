# Weekly Survival Preview

Preview the week the league is about to play. This is a guillotine league: every
team scores on its own, and at the end of the week the lowest scorer is
eliminated permanently. Nobody is safe by beating anybody. The only question
that matters is who is closest to the floor.

This week has **not** been played. There are no scores for it and you must not
invent any.

## What you know

- `standings` — the teams still alive, ranked on points scored so far. This is
  not a table of who is winning; it is the field that is left.
- `eliminationHistory` — who has already been chopped, and in which week. These
  teams are gone. Never write about them as though they were still playing.
- `dangerBoard.lastCompletedWeek` — the last week that finished: `chopLine` is
  the score that was not enough to survive it, `survivalMargin` is how close the
  team directly above that line came to going instead, and `scoringOrder` gives
  every team's `marginAboveChopLine` for that week.
- `dangerBoard.floors` — each team's `lowest` and `median` score across the
  season, worst first. This is the number that actually predicts danger in this
  format: a team dies on its bad weeks, not its good ones.
- `byeExposure` — how many rostered starters each team loses to an NFL bye in
  each of the next few weeks, and which players. A cluster here is a genuine
  elimination risk, not a footnote.
- `faabMarket` — what each team has left to spend, and the pools that earlier
  chops released onto the wire.
- `league.positionalValue` — the ways this league's scoring changes what a
  position is worth. Apply every entry when you judge a roster's floor. An empty
  list means nothing here is unusual.

Read `unavailable` before you write anything. Each entry names something this
edition does not know and carries an instruction. Follow all of them exactly.

## Structure

One post per item, separated by `%%%`, numbered in the header:

```
WEEK <n> SURVIVAL PREVIEW • 1/5
```

1. **The state of the field.** How many are left, who went last week and on what
   score. Name the storyline that actually matters going into this week.
2. **The chop line.** What it took to survive the last completed week, and how
   near the survivors came. Use the real numbers from `dangerBoard`.
3. **The danger list.** Three or four teams most likely to go this week, worst
   floor first. For each: the number that puts them there, and the specific
   reason this week is worse or better than their average one.
4. **Byes and the wire.** Who is short-handed, named players and counts from
   `byeExposure`. Then what the survivors can still spend, and who is positioned
   to buy the next roster that hits the pool.
5. **The called shot and closing.** Name the team you expect to be chopped, say
   plainly why, and leave it there. No hedging and no second pick.

Adjust the count if there is less to say; keep the `x/total` numbering honest.

## Rules for this edition

- A team's danger is its own scoring floor measured against the rest of the
  field. Never frame it as one team against another.
- Do not rank teams for the sake of ranking them. Position in `standings` is a
  points total, and a team near the bottom of it is not thereby in danger this
  week — that is what the floors are for.
- Do not claim a team is "safe". In this format a bad enough week ends anyone.
- One joke per post at most, rooted in something specific to this league.
- A line beginning `CALLED SHOT:` in the final post, naming exactly one team.

## Machine-readable prediction

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block naming the team you called:

```json
[
  {
    "week": 3,
    "predicted_chop": "Virginia Virgins",
    "reasoning": "lowest floor in the league and three starters on bye"
  }
]
```

Exactly one entry. The team name must match the context exactly, character for
character, and must be a team in `standings` — a team already in
`eliminationHistory` cannot be chopped twice. This block is how you get graded
once the week is settled; if it is wrong, the receipts break.
