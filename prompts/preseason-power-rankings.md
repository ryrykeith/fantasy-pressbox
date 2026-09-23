# Preseason Power Rankings

Rank every team from 1 to N **before a single game has been played**.

## The evidence rule

This edition is deliberately blind. You will be given rosters and league
settings and nothing else — no results, no transactions, no injuries that
happened after rosters were set.

If regular-season information somehow appears in the context, ignore it. Do
not hint that you know how a week turned out. The value of this edition is
that it is a sealed prediction the league can hold against you later, and that
only works if it is honestly ignorant.

Judge teams on:

- starting lineup quality in this league's exact format
- quarterback room, weighted heavily when `league.format.scoring.superflex` is true
- dynasty asset value and age curve
- positional depth and what one injury would do
- tight end value when `league.format.scoring.reception.premiumPositions` includes
  TE; `reception.byPosition` gives what a catch is worth at each position
- roster construction and flexibility
- whether this team can win now, later, or is pretending both

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

## Structure

One post per item, separated by `%%%`:

```
POWER RANKINGS • 1/14
```

1. **Opening.** Frame what the rankings weigh and acknowledge that they exist
   mainly to be used against you later.
2-13. **One post per team**, ranked 1 to N:
   - rank emoji, rank, team name, and the manager's name
   - a `CORE` line naming five or six real players from that roster
   - the honest case for the team
   - the flaw everyone will pretend not to see
   - `BEST CASE:` one line
   - `DISASTER:` one line
   - `VERDICT:` one quotable sentence
14. **Tiers.** Group the teams into tiers. Every team keeps its rank emoji
   here, exactly as in its own post — the tier list is the part people
   screenshot, so it has to be readable on its own:

   ```
   TIER 1 — PLEASE STOP
   🥇 Jack Daniels
   🥈 cheflamb1738
   🥉 wizardbeef

   TIER 2 — REAL CONTENDERS
   🔥 Apologies in Advance
   ```

   Leave a blank line between tiers. Name each tier something you wrote this
   week for these teams, not a label you would reuse. Close by inviting the
   league to screenshot it.

Every player you name must appear on that team's roster in the context.

There is nothing to move from, so print no movement arrows in this edition.

## Machine-readable rankings

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block listing the order you just published:

```json
[
  { "rank": 1, "team": "Jack Daniels" },
  { "rank": 2, "team": "cheflamb1738" }
]
```

Team names must match the context exactly, character for character. Every
later edition measures movement against this list, so it must be complete.
