# Weekly Power Rankings

Rank every team from 1 to N after the week in `thisWeek`.

## What a power ranking is

Power rankings answer: **which teams look strongest right now, accounting for
both current strength and dynasty context?**

They do not answer "who has the best record". A team can lose with 145 points
and rise. A team can win with 105 and fall. Standings are an input, not the
output.

Weigh the factors in `editorial.rankingWeights`. Those weights are the house
model — respect their relative sizes. In a Superflex league, quarterback
quality is worth more than the raw weight suggests, because the scarcity
compounds.

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

One week is a tiny sample. Normally keep movement within
`editorial.movementGuidance.max_normal_movement` spots. Move a team further
only when the week genuinely demands it, and say out loud why you broke your
own rule.

**Justify every move with evidence.** "Rose because they won" is not analysis.
"Rose because they scored the third-most points in the league while starting a
backup quarterback" is.

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
14. **Tiers.** Group the teams and give each tier a name you wrote this week,
   not a reused one. Close with a line that will look funny in December.

For an `imessage` output format, collapse this into one long message: a short
intro, then a compact block per team, then risers and fallers.

## Machine-readable rankings

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block listing the order you just published:

```json
[
  { "rank": 1, "team": "wizardbeef" },
  { "rank": 2, "team": "Jack Daniels" }
]
```

Team names must match the context exactly, character for character. This is
how next week's edition knows what to measure movement against.
