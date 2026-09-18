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
- quarterback room, weighted heavily when `league.format.superflex` is true
- dynasty asset value and age curve
- positional depth and what one injury would do
- tight end value when `league.format.tePremium` is set
- roster construction and flexibility
- whether this team can win now, later, or is pretending both

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
14. **Tiers.** Group the teams, name each tier something specific to what that
   group actually is, and close by inviting the league to screenshot it.

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
