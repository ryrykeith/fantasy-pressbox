# Tank Watch

Write this league's tank watch: who is racing for the top picks in next
season's rookie draft, who actually owns those picks, and which picks would
jump if their team crossed the playoff line.

Everything you need is in `tankWatch`. Read `tankWatch.rule` first. It is how
this league orders its rookie draft, and every point you make has to follow
from it. Under this rule a team does not earn a top pick just by losing. What
decides the order is whether a team misses the playoffs and then the measure
in `tankWatch.race.measuredIn`. Explain that once, in a sentence, the first
time it matters.

## What to cover

- **The race for the top picks.** `tankWatch.topPicks` names them, and
  `tankWatch.race.picks` lists every pick in the race in order. `inTopPicks`
  says who holds one today. `gapToPickAbove` and `gapToPickBelow` are the
  margins between neighbouring picks, and `marginToTopLine` is how far a pick
  is from crossing into or out of the top picks. All of them are measured in
  `race.measuredIn`. Quote these gaps exactly; they are already computed.
- **Who is rooting for whom.** `tankWatch.stakes` lists every pick held by
  someone other than the team whose finish decides it. A team that owns
  another team's pick has a stake in that team's season going badly. Name the
  holder and the original team, and use `projectedPick` where it is given.
- **The playoff cliff.** `tankWatch.cliff` lists the teams on the playoff
  bubble. `pickIfCrossed` and `picksMoved` say where each team's pick would land
  if it crossed the line, and `swappedWith` names the team that would trade
  places with it. A pick that jumps several places on one playoff result is
  the main story of this edition. Lead with it when it is there, and always
  say who owns the pick that moves.
- **The prize.** If `prospectBoard` is present, its prospects are what the top
  picks are for. Name them only as the board does, credit the `source`, and
  attach no prospect to a specific pick. If `prospectBoard` is absent, follow
  the `prospectBoard` entry in `unavailable` and leave the class out.
- **Movement.** If `tankWatch.movement` is present, it compares every pick with
  the previous tank watch (`sinceWeek`). `change` is positive when a pick moved
  earlier. Lead with the biggest moves. If it is absent, follow the
  `previousTankWatch` entry in `unavailable`.

`tankWatch.order` is the whole projected round 1, for reference. Use it to
answer anything the sections above do not cover. Do not re-list it in full.

## Structure

Three to five posts, separated by a line containing only `%%%`, numbered in
the header:

```
TANK WATCH • 1/4
```

1. **The race.** The top picks and who holds them, the gaps that separate the
   contenders, and the movement since the last tank watch.
2. **The stakes.** Who owns whose pick, and who should be cheering whose
   losses this week.
3. **The cliff.** The bubble teams whose pick would jump across the playoff
   line, by how much, and who that would hand a top pick to.
4. **The prize** (only if `prospectBoard` is present). What the top picks are
   for, according to the board.

Leave out a post that has nothing in the context to stand on, rather than
padding it.

## Rules for this edition

- Every pick here is a projection, not a result. Follow the `finalDraftOrder`
  entry in `unavailable` whenever it appears.
- Give pick numbers like 1.02 for round 1 only. Follow the
  `laterRoundPickNumbers` entry.
- Every number you print, whether a pick, gap, record or points total, must be
  in the context exactly as written.
- A manager's interest in another team losing is fair game for a joke. Saying a
  manager is *deliberately* losing is not: nothing here records intent. Frame
  any read of a team's plan as your read.
- Never use a phrase listed in `editorial.bannedPhrases`.
- No JSON block at the end. This edition is not recorded.
