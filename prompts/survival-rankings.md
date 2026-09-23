# Weekly Survival Rankings

Rank the teams still alive, best chance of surviving first, after the week in
`thisWeek`.

This is a guillotine league. Every team scores on its own, and at the end of
each week the lowest scorer is eliminated permanently. The league gets smaller
every week and it never gets bigger.

## What this ranking answers

**Which teams are least likely to be chopped next?**

That is not the same question an ordinary power ranking answers, and the
difference is the whole edition. Elsewhere you rank teams on how much they can
score. Here you rank them on how little they can score on a bad day, because
nobody is knocked out for failing to be the best — only for being the worst.

So the ranking is an inversion:

- **Floor beats ceiling.** A team that scores 95 every week is in better shape
  than one that alternates 150 and 80, even though the second has the higher
  average. The 80 is the number that kills you. Rank accordingly, and say so
  when you do it.
- **A big week is not evidence of safety.** It banks nothing. Next week starts
  from zero for everybody.
- **Nobody is safe.** Rank 1 means hardest to chop, not immune. Never write
  that a team cannot go out.
- **Consistency is a skill here.** Boring is good. Say it out loud when a
  boring roster deserves to be ranked above an exciting one — that judgement is
  the most useful thing this edition prints.

Weigh the factors in `editorial.rankingWeights`. Those weights are the house
model — respect their relative sizes. `weekly_floor` is the heaviest for the
reason above.

## What you know

- `teams` — the rosters still in the league, with each team's own points. Every
  team here is alive. There is no other kind in this list.
- `eliminationHistory` — who has already been chopped, and in which week. These
  teams are gone. They hold no rank, they do not appear in the tiers, and you
  never write about them in the present tense. Name them only as history.
- `survivorCount` — how many are left. Use this number; do not count the list.
- `dangerBoard.floors` — each team's `lowest` and `median` score, worst first.
  This is the evidence behind the heaviest weight in the model. Cite the actual
  numbers.
- `dangerBoard.lastCompletedWeek` — the week just played: `chopLine` is the
  score that was not enough to survive it, `survivalMargin` is how close the
  team directly above that line came to going instead, and `scoringOrder` gives
  every team's `marginAboveChopLine`. The team that went is still in that
  array, sitting on the line it failed to clear — that is the record of the
  week, not a live team.
- `byeExposure` — how many rostered starters each team loses to an NFL bye in
  each of the coming weeks, and which players. A cluster here is a genuine
  elimination risk and is weighted as one.
- `faabMarket` — what each team has left to spend, and the pools earlier chops
  released. Budget is ammunition: every chop dumps a whole roster onto the
  wire, the pools get better as the season goes on, and a team with nothing
  left to bid cannot fix a hole it develops in week 10.
- `league.positionalValue` — the ways this league's scoring changes what a
  position is worth. Apply every entry, and let them override the raw weights
  where the two disagree. An empty list means nothing here is unusual.

Read `unavailable` before you write anything. Each entry names something this
edition does not know and carries an instruction. Follow all of them exactly.

## Movement

If `unavailable` names `previousRankings`, this is the first edition: print no
arrows at all, and open by saying there is nothing to move from yet.

Otherwise `previousRankings` holds last edition's order. Print each team's
movement after its name:

```
🥇 1. WIZARDBEEF ↑2
🥈 2. JACK DANIELS ↓1
🥉 3. BRYCEFOSTER98 —
```

A team that has since been chopped will appear in `previousRankings` and not in
`teams`. It has not fallen; it has been removed. Do not print it, and do not
count it when you work out how far anybody else moved — the teams below it all
rise by one for no reason of their own, which is not movement and must not be
described as any.

One week is a tiny sample. Normally keep movement within
`editorial.movementGuidance.max_normal_movement` spots. Move a team further
only when the week genuinely demands it, and say out loud why you broke your
own rule.

**Justify every move with evidence.** "Fell because they scored badly" is not
analysis. "Fell because their floor dropped to 71 and three starters are on
bye next week" is.

## Structure

One post per item, separated by `%%%`:

```
SURVIVAL RANKINGS • 1/8
```

1. **Opening.** How many are left, who went last week and on what score. What
   the chop line is doing — drifting up, drifting down — and what that means
   for everyone still here. What you got wrong last time.
2-N. **One post per surviving team**, ranked 1 to `survivorCount`. Each post
   carries the rank emoji, rank, team name and movement, then:
   - the core of the roster, by name
   - their floor, with the number, and what it has actually done to them
   - the specific thing that could put them on the line in the next few weeks —
     a bye cluster, an injury, a starter who has quietly stopped producing
   - what they can still do about it, given what they have left to spend
   - a line beginning `VERDICT:` — one sentence, quotable
N+1. **Tiers.** Group the survivors into tiers. Every team keeps its rank emoji
   here, exactly as in its own post — the tier list is the part people
   screenshot, so it has to be readable on its own:

   ```
   TIER 1 — BORING AND ALIVE
   🥇 Jack Daniels
   🥈 cheflamb1738

   TIER 2 — ONE BAD SUNDAY AWAY
   🥉 wizardbeef
   ```

   Leave a blank line between tiers. Name each tier something you wrote this
   week for these teams, not a label you would reuse. The bottom tier is the
   danger tier; name it like it.

Adjust the count as the field shrinks; keep the `x/total` numbering honest.

For an `imessage` output format, collapse this into one long message: a short
intro, then a compact block per team, then the danger tier.

## Rules for this edition

- A team's danger is its own scoring floor measured against the rest of the
  field. Never frame it as one team against another.
- One joke per post at most, rooted in something specific to this league.
- Do not tell anyone they are safe.

## Machine-readable rankings

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block listing the order you just published:

```json
[
  { "rank": 1, "team": "wizardbeef" },
  { "rank": 2, "team": "Jack Daniels" }
]
```

Exactly one entry per surviving team, and no entry for any team in
`eliminationHistory`. Team names must match the context exactly, character for
character. This is how next week's edition knows what to measure movement
against.
