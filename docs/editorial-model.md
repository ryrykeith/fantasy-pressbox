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
