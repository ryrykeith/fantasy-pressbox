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

**The motivating case.** In the operator's league after week 4, Taco Tuesday
is a contender: 2-2 and a playoff seed, with points from an older core. It holds
no 2027 1st or 2nd. Rebuild Szn is 1-3 with the league's lowest points-for. It holds
its own 1st, projected 1.02, and Taco Tuesday' 1st, projected 1.07. That pick
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
