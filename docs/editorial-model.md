# Editorial Model

The source of truth for how Fantasy Pressbox behaves as a publication rather
than as a generator.

## Purpose

The output should read like a recurring league publication with a memory and a
personality — not like generic AI commentary about football.

## Power rankings

Power rankings answer:

> Which teams appear strongest right now, considering both current competitive
> strength and dynasty context?

They do not answer:

> Who currently has the best record?

### Factors

Starting lineup quality, Superflex quarterback quality, dynasty asset value,
positional depth, roster flexibility, future draft capital, contender
viability, age and competitive window, recent scoring, potential points,
lineup efficiency, injuries, transactions.

Default weights live in `config/rankings.yml`:

| Factor | Weight |
|---|---|
| Starting lineup | 0.30 |
| Dynasty asset value | 0.25 |
| Depth | 0.15 |
| Quarterback | 0.10 |
| Future draft capital | 0.10 |
| Roster construction / flexibility | 0.05 |
| Contender viability | 0.05 |

These are configurable on purpose. A redraft league and a dynasty league
should not use the same numbers.

The table is the dynasty `balanced` preset. A league can rank for something
else with `preset: win-now` or `preset: rebuild`, which shift weight towards
this season's lineup or towards long-term value and picks. The context names
the preset (`editorial.rankingPreset`), so a ranking can say what the league
ranks for. The numbers stay out of the posts.

### The team strength rating

The weights above steer a ranking that the model writes. The strength rating
is a different kind of thing: a number from 0 to 100 that **the code**
computes for every team (`src/analysis/strength.mjs`), so the same saved data
always gives the same rating and anyone can check it. The weekly, preseason
and postseason rankings and the future stock carry it as `strength`. It is
evidence the ranking may cite, never the sole reason for a rank. Guillotine
leagues get no rating, because their survival rankings judge the floor, which
is a different question.

**Components.** Each one is built only from data the league has:

| Component | What it measures | Better | Formats |
|---|---|---|---|
| `lineup` | Points of the best legal lineup the roster could have fielded (the same solver as lineup efficiency), averaged over the window weeks | higher | dynasty, redraft |
| `depth` | In each window week, the week's `short_week_starters` (default 2) highest scorers in that best lineup are removed and the solver fills the lineup again from what is left. Depth is the refilled total minus what the remaining starters scored, which is exactly what the bench supplied. Averaged over the window weeks | higher | dynasty, redraft |
| `market_value` | FantasyCalc value of the players on the roster today, summed over the priced ones | higher | dynasty, redraft |
| `age_window` | Each starter's age minus the league's points-weighted mean age at his position, weighted by the points he scored as a starter in the window weeks. Negative is younger than the league. Defenses have no age and are left out | lower | dynasty |
| `draft_capital` | Priced value of the future picks the team holds (`pickCapital`'s horizon value) | higher | dynasty, where traded picks are read (Sleeper) |

The **window** is the last `lineup_weeks` (default 4) settled weeks this
season: weeks whose stored snapshot is the settled record. A week still being
played is never read. A team's week whose best lineup cannot be known (a
player with no reported points, or no known position) is not counted for that
team.

**Formula.** For each component, the teams that have a value are ranked
(ties share a rank) and scored by rank:

```
score = 100 × (n − r) ÷ (n − 1)
```

where `n` is the number of teams ranked and `r` is the team's rank, averaged
across a tie, so first scores 100, last scores 0 and tied teams score the same.
A lone team scores 100. The rating is the weighted mean of a team's component
scores, rounded to a whole number:

```
rating = Σ (weightᵢ × scoreᵢ) ÷ Σ weightᵢ     over the components the team has
```

So the rating is relative: it says where a team stands in its league, not how
good it is in absolute terms.

**Missing data.** A component the league cannot supply is listed in
`strength.unavailable` with its reason, and the context's `note` says that the
remaining weights were scaled back up to 1.0 (`weightsUsed`). The usual causes
are no settled week (the preseason, which reads none of this season's
results), no market, and ESPN's traded picks, which are not read. A team that
alone lacks a component (FantasyCalc prices nobody on its roster, say) has
its own `unavailable` entry and its own `weightsUsed`. A missing component is
never counted as 0.

**Weights.** `strength.dynasty` and `strength.redraft` in
`config/rankings.yml` are the `balanced` preset's. The other presets carry
their own under `presets.<name>.strength.<format>`, and the preset that sets
the ranking weights sets these too. They are editorial choices, validated like
the ranking weights: each set sums to 1.0 and uses only the components its
format has. A league that writes its own `strength.<format>` cannot also name a
preset for that format. `strength_inputs` sets `lineup_weeks` and
`short_week_starters`.

### Draft capital means *future* draft capital

The `future_draft_capital` weight refers only to drafts that have not happened
yet. Picks for the current season and earlier are spent, and are withheld from
the model rather than left for it to interpret.

This matters most in a league's first year, when nearly every traded pick is a
startup-draft pick. Citing one as an asset is not a stylistic slip — it is an
analytical error that makes a team look like it has capital it already
converted into the roster being ranked.

### Weekly results are evidence, not the model

A team that loses with 145 points can rise. A team that wins with 105 can
fall. One Sunday is a very small sample and the rankings must act like it —
hence `max_normal_movement`, which a genuinely extraordinary week is allowed
to break, provided the edition says out loud that it is breaking it.

### Movement notation

```
↑2    ↓3    —    NEW
```

Movement is computed in `store.mjs` from the previously published ranking, not
asserted by the model. A team absent from the previous edition is `NEW`, not
"unchanged".

### Preseason editions

Preseason rankings are deliberately blind. They use the preseason roster
snapshot and must not incorporate regular-season results, later transactions,
later injuries or later roster changes — even when generated after week 1.

Their value is that they are a sealed prediction, and that only works if the
ignorance is honest.

### Future stock: ranking the next three seasons

The `future-stock` edition (`prompts/future-stock.md`) is a second dynasty
ranking with a different question: which teams are set up for the next three
seasons, not who is strongest now. It refuses redraft and guillotine leagues.
In those formats there is no multi-season window to rank.

The hard part is not projecting too much. The edition must not turn into youth
worship. The prompt carries these rules as judgement, because no computation
can decide them:

- **The ideal is current production with a sustainable age curve.** It is not
  the youngest roster or the one with the most picks.
- **Youth without production is potential, not value.** The production split
  by age band (`src/analysis/rosterWindow.mjs`) is what tells young-and-good
  apart from young. The model must cite it for every team.
- **Ageing is position-aware.** A 29-year-old running back and a 29-year-old
  quarterback are not comparable.
- **A projected pick is still a projection.** A projected top-three 1st is real
  capital. It still never outweighs a productive young core, and the guard
  covers picks as much as players. Only the draft this season's standings
  decide is placed at a slot or tier. A later draft's picks never are. Board
  prospects are named only as the board ranks them, with its source.

**The motivating case.** In the mock league the tests use, after week 4, Taco Tuesday
is a contender: 2-2 and a playoff seed, with points from an older core. It holds
no 2027 1st or 2nd. Rebuild Szn is 1-3 with the league's lowest points-for. It holds
its own 1st, projected 1.02, and Taco Tuesday's 1st, projected 1.07. That pick
becomes 1.02 if Taco Tuesday misses the playoffs. The edition must put Taco
Tuesday near the bottom whatever its record. Its points come from players who
are leaving, and it has nothing to replace them with. Rebuild Szn's two 1sts are
real upside. They do not lift Rebuild Szn above a team whose young starters are
already scoring. `tests/future-stock.test.mjs` builds this league and checks
that each of those facts reaches the context and that the prompt states each
rule.

## Tone

Confident, analytical, funny, dry, slightly petty, occasionally absurd,
willing to roast a poor fantasy decision, willing to admit a previous take was
wrong.

### Humour comes from the data

The good material is already in the box score:

- the preseason #12 team leading the league in scoring
- a team scoring 147 and losing
- a franchise named after a player who scored 2.2, winning anyway
- a manager setting 73% of their optimal lineup
- a quarterback finishing with negative points

### Filler is the failure mode

Banned by default in `config/editorial.yml`:

```
Anything can happen.
This should be a great matchup.
Both teams have a chance.
Only time will tell.
```

The test: if a sentence would survive being pasted into another league's
newsletter unchanged, it is filler.

### Limits

Roast lineup decisions, roster construction, trades, draft picks, projections,
bench choices and the publication's own previous takes.

Never target real-world protected or sensitive characteristics. The joke is
always about fantasy football decisions.

## Receipts

All predictions and rankings remain available historically. Incorrect
predictions are acknowledged explicitly and without excuses.

Mechanically: a preview ends with a machine-readable block of its picks, the
CLI files it under `data/predictions/`, and the next recap is handed the
graded results. The publication cannot quietly drop a bad take, because the
bad take is in the context.

The whole point, stated as the project's guiding example:

> We ranked you 12th. You immediately scored the most points in the league.
> That ranking was wrong. Here is why the model changed its mind.

## Awards

Candidates: Team of the Week, Manager of the Week, Player of the Week, Fraud
of the Week, Biggest Blowout, Closest Game, Highest Losing Score, Lowest
Score, Lineup Malpractice, Bench Pain, Upset of the Week, Moral Victory, Most
Disrespectful Victory, Commissioner Investigation, Copium Award.

Two rules:

1. Awards are data-driven. `analysis/week.mjs` computes the facts; the model
   writes the joke around them.
2. Do not force every award every week. A category with no supporting data is
   omitted rather than invented.

## Platform behaviour

### Sleeper

- plain text; Sleeper does not reliably render Markdown
- Unicode and emoji for visual hierarchy
- independently copyable posts, separated by `%%%`
- about 900 characters per post by default
- validated programmatically before output
- **never silently truncated**

Long publications are numbered so the league can follow them:

```
POWER RANKINGS • 3/14
WEEK 1 RECAP • 5/8
WEEK 2 PREVIEW • 2/8
```

### iMessage

Longer content is fine. Prefer one consolidated message with whitespace,
emoji, readable sections, minimal Markdown dependence and compact movement
notation.
