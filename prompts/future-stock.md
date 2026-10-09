# Future Stock

Rank every team in `teams` from 1 to N on one question: **which teams are set
up to win over the next three seasons?**

This is not the weekly power ranking. This week, and this season's record,
are evidence about a roster; they are not the thing being ranked. A team that
would win the title this year and fall apart next year is not a good future
stock.

## What a good future stock is

The ideal is a team **producing now with an age curve it can sustain**: its
points come from players young enough to keep scoring for three more seasons,
and it holds its own picks or better. Rank teams by how close they come to
that, not by who has the most picks or the youngest roster.

Weigh three things for every team, in this order:

1. **Production that will last.** `window.starterPointsByAgeBand` splits the
   points each team's starters have actually scored by the age of the player
   who scored them. Points from young players are the strongest evidence in
   this edition: they are proven production with years left on it. Points
   from the oldest band are real today and leaving soon. Cite this split for
   every team. It is the main fact that separates "young and good" from
   "young" and from "good and old".
2. **Age, by position.** `window.byPosition` gives each position's ages for
   the whole roster and for the starters. Ageing depends on the position. A
   29-year-old running back is near the end. A 29-year-old quarterback can
   have five good years left. Wide receivers and tight ends sit in between.
   Never compare ages across positions as if they meant the same thing, and
   never judge a roster on one average age. `window.startingLineupAge` and
   `window.pointsWeightedStarterAge` say who the points depend on.
3. **Draft capital.** `draftCapital` lists every pick each team holds across
   `draftCapital.seasons`. Picks are upside on top of a roster, not a
   substitute for one. See the guard below.

`editorial.rankingWeights` says how much each factor counts, as guidance. It
is this edition's own set: production from young players and the age window
outweigh draft capital, and this week's form counts for little. Let it settle
close calls, and do not print the numbers.

## The guard against over-projection

Forward-looking does not mean youth worship. These rules decide close calls.

- **An old contender with no picks ranks low.** A team winning now with an old
  starting core and none of its own early picks over the coming drafts belongs
  near the **bottom** of this ranking, however good its record is. Its points
  come from players who are leaving, and it has nothing to replace them with.
  Say this plainly when it applies. That team is the reason this edition
  exists.
- **Youth without production is potential, not value.** Do not rank a young
  roster highly for its age alone. If a team's starters are young but
  `starterPointsByAgeBand` shows they have not scored, the roster is unproven.
  Say so, and rank it below a team whose young players are already producing.
- **Current production still counts.** A team scoring well with a sustainable
  age curve ranks above a team with a pile of picks and a roster that cannot
  score. Never drop a productive team just because it holds fewer picks.
- **A projected pick is still a projection.** A projected top-three pick is
  real capital and worth saying so. It is a slot the standings could still
  change, not a player. It never outweighs a productive young core on its
  own. Two early 1sts do not turn a roster that cannot score into a top-three
  future stock.
- **The same guard covers picks and players.** Do not invent what a pick will
  become, any more than you invent what a 22-year-old will score.

## Reading the picks

- `ownPicks` is what a team would hold with no trades. `picksHeld` and
  `netPicks` show how far trades have moved it from that.
- `value` and `netValue`, when present, are market prices from
  `draftCapital.valueSource`. Read `draftCapital.scale` before using them.
  `netValue` is the fairest single comparison between teams. A pick with
  `basis: unpriced` has no price, so give it none.
- A pick from the draft in `draftProjection` carries `projectedPick` and
  `tier`, placed by `draftProjection.rule` from the current standings. Where
  `ifOriginalTeamCrosses` is present, the original team is on the playoff
  bubble. Say where the pick would move if that team crossed the line, and by
  how many places. A pick that would jump to the top of the draft on one
  playoff result is worth a sentence.
- A pick from any other draft has no slot and no tier. Name it by its season,
  round and original team, and follow the `projectedDraftSlot` entry in
  `unavailable`.
- If `prospectBoard` is present, `boardAroundPick` names the board prospects
  ranked near a pick's slot. You may say a pick is in range of them, as the
  board ranks them, naming the board's `source`. A board rank is a ranking,
  not a promise that the player will be there at that pick. Never say a pick
  will be a particular player, and never name a prospect who is not on the
  board.

## Positional value

`league.positionalValue` names the ways this league's scoring changes what a
position is worth. Apply each entry here too. An ageing player at a position
the scoring rewards is a bigger loss when he goes, and a young one there is
worth more.

## Structure

One post per item, separated by a line containing only `%%%`:

```
FUTURE STOCK • 1/14
```

1. **Opening.** What this ranking measures and how it differs from the weekly
   power rankings. Name the team whose rank differs most from its record, and
   say why.
2-13. **One post per team**, ranked 1 to N. Each post carries the rank emoji,
   rank and team name, then:
   - the players the next three seasons depend on, by name and age
   - the production split by age band, quoted from `starterPointsByAgeBand`
   - the age concern or strength that matters most, judged by position
   - the picks that matter, with projected slots only where the context gives
     them
   - a line beginning `VERDICT:`, one sentence and quotable, that names the
     team's window: open now, opening, closing, or shut
14. **Tiers.** Group the teams into tiers. Every team keeps its rank emoji
   here, exactly as in its own post. Name each tier for these teams, not with
   a label you would reuse.

For an `imessage` output format, collapse this into one long message: a short
intro, a compact block per team, then the tiers.

## Rules for this edition

- Rank every team in `teams`, each exactly once.
- Tie every ranking decision to facts in the context: ages, production by age
  band, records, points and picks. "Young and talented" is not a reason.
  "Three of their four leading scorers are under 25" is.
- Every number you print, whether an age, a point total, a share, a pick or a
  value, must be in the context exactly as written.
- Every pick is a projection until the context says otherwise. Follow the
  `finalDraftOrder` entry in `unavailable` whenever it appears.
- Never use a phrase listed in `editorial.bannedPhrases`.
- No JSON block at the end. This edition is not recorded.
