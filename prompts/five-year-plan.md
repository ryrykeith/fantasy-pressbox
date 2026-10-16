# Five-Year Plan

Write a plan for **one team**, `fiveYearPlan.team`, over the five seasons in
`fiveYearPlan.seasons`. Write it for its manager, with every other manager in
the league reading over their shoulder.

This is an outlook built from facts. It is not a prediction. The context
carries forward only two things: the calendar (each player is a year older
each season) and the picks already issued. Anything else about the future is
yours to reason about, and none of it may be stated as a fact.

## What the plan answers

1. **The contention window.** Which seasons this roster is built to compete in
   and when the window closes. Read it off two things: how many of today's
   starters are past their position's decline age in each season
   (`bySeason[].startersPastDecline`), and how much of today's starter
   production comes from players still before their cliff
   (`bySeason[].starterPointsBeforeCliff`). Name the window with seasons: open
   now, opening in a named season, closing after a named season, or shut.
2. **The options, season by season.** In each season, what can this team
   do, and what will it cost to do nothing?
   - **Sell before the cliff.** Name each player whose stage turns `declining`
     or `cliff` inside the plan, and the last season he is still at `peak`.
     A player is worth most to a trade partner before that turn. Say so for the
     players today's production depends on.
   - **The picks are the currency.** `bySeason[].picks` lists the picks held
     for each draft. Say which ones the team can spend to buy in for a window
     that is open, and which it should keep to restock a window that is
     closing. A pick from another team says whose finish decides it.
   - **Hold.** A young core at `rising` or `peak` across most of the plan is a
     reason to stand still. Say so when the facts show it.
3. **Where the team stands today.** Use `strength`, `standing` and
   `marketValue` as the starting point. They describe today, not any later
   season.

This edition is about one team, so you may be more concrete than a league-wide
ranking: name the players, the picks and the seasons. Choose the options the
facts point to and say which you would take and why. Being decisive is fine.
Stating a guess as if it were a fact is not.

## Reading the facts

- `starters` and `bench` give one line per player: his position and name, then
  each season's age and his stage on his position's curve. `withoutAge` lists
  the players with no age on record and the reason. Say nothing about the age
  or stage of a player in `withoutAge`.
- `ageCurves` are the curves the stages come from. `ageCurveBasis` says they
  are editorial judgement. Say "on the league's age curve" or "by this curve",
  not "he will decline". A curve is a rule of thumb about a position, not a
  fact about a player.
- `ageBasis` says how ages are carried forward. An age can be up to a year
  off, so do not build a claim on a single birthday.
- `starterPointsBeforeCliff.share` is a share of points today's starters have
  **already scored** in `starterProduction.weeksCovered`, with the same points
  read against each season's stages. It shows how much of today's production
  is at risk by that season. It is not a projection of that season's points.
  Quote it as written.
- `rosterByAgeBand` counts the whole roster by age in each season.
- Ages and positions are not comparable across positions. A 29-year-old
  quarterback at `peak` and a 29-year-old running back at `declining` are
  different stories. The curves already say so.

### Picks

- A season's `picks` lists each pick by round and original team. `(own)` marks
  the team's own pick. `picksHeld`, `ownPicks` and `netPicks` show how far
  trades have moved the team from its own picks.
- `value` and `netValue`, when present, are market prices. A pick with
  `basis: unpriced` has no price, so give it none.
- A pick with `projectedPick` and `tier` is placed by `draftProjection.rule`
  from today's standings. Call the slot projected. Any other pick has no slot.
- A season whose `picks` is `unavailable` says why: its draft has been held,
  or its picks are not issued yet. Never treat that season as holding no
  picks, and never invent the picks it will hold.

### Team strength

`strength` is a rating the code computed, 0 to 100 relative to this league,
with its `rank` among the league's `of` rated teams. It is evidence about today,
not the plan.

- `strength.components` gives each component's value and league rank, and
  `strength.legend` says what each one measures. Use them to say where the team
  is strong or thin today.
- `strength.leagueUnavailable` and `strength.teamUnavailable` list components
  that could not be computed, each with its reason. Say in a line that a
  component is missing, quoting the reason. Never guess its value and never
  treat it as zero.
- Never print a weight, and never let today's rating stand in for a later
  season.

## Missing facts

Anything with an `unavailable` field is unknown, and the field says why. This
applies to a season's picks, `strength`, `standing`, `marketValue` and
`starterPointsBeforeCliff`. Say in a line that it is not on record, quoting
the reason where it helps. Never fill it in and never treat it as zero. Read
the top-level `unavailable` list too, and follow every instruction in it.

## Positional value

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Apply each entry. An ageing player at a position the
scoring rewards is a bigger loss when he goes, and a young one there is worth
more to keep.

## Structure

One post per item, separated by a line containing only `%%%`. Head each post:

```
FIVE-YEAR PLAN • <team> • 1/7
```

1. **Today.** Where the team stands now: its strength rating and what drives
   it, its standing and its market value, wherever the context has them. End
   with a line beginning `WINDOW:`, one quotable sentence that names the
   window in seasons.
2-6. **One post per season**, in order, headed with the season. For each one:
   - the players who change stage that season, by name, age and stage
   - `startersPastDecline` and `starterPointsBeforeCliff` for that season,
     quoted as written
   - the picks held for that season's draft, or why they are unknown
   - the option you would take that season, and the fact it rests on
7. **The plan.** Three to five lines in order: what to do now, what to sell
   and by when, what to keep, and what to buy with. Each line names the fact
   it rests on.

For an `imessage` output format, collapse this into one long message: today,
then a short block per season, then the plan.

## Rules for this edition

- Write about `fiveYearPlan.team` only. Other teams appear only as the original
  teams of picks.
- Tie every claim to a fact in the context: an age, a stage, a share, a pick or
  a rating. "Young and talented" is not a reason. "Three of its five starters
  are at `peak` through 2028" is.
- Every number you print, whether an age, a share, a point total, a pick or a
  value, must be in the context exactly as written.
- **Never project points, a record, a playoff place, a finish or a title** for
  any season, this one included. "Contend" means the window is open by these
  facts, not that the team will win.
- If the context has `marketCredit`, any post that quotes a market value ends
  with its `line`, exactly as written, on its own line. It counts toward the
  post-length limit, so leave room. A post that quotes no value needs no credit
  line.
- Never use a phrase listed in `editorial.bannedPhrases`.
- No JSON block at the end. This edition is not recorded.
