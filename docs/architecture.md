# Architecture

## The pipeline

```
Sleeper API
    ↓  src/sleeper/client.mjs
Fetch
    ↓  src/sleeper/normalize.mjs
Normalize
    ↓  src/store.mjs
Snapshot / persist
    ↓  src/analysis/
Analyze
    ↓  src/promptContext.mjs
Build prompt context
    ↓  src/generate.mjs  (optional)
Generate
    ↓  src/validate.mjs
Validate
    ↓
Sleeper chat / iMessage / a file
```

`src/pipeline.mjs` is the sequence. `src/cli.mjs` is the interface. Neither
contains domain logic.

## Why the stages are separate

Because the failure modes are different, and mixing them makes bugs
undiagnosable.

- Sleeper API code contains no roast-writing logic.
- Prompt files do not determine matchup pairings.
- Renderers do not calculate rankings.
- Ranking logic knows nothing about Sleeper chat formatting.
- Snapshots are written before any editorial generation happens.

When output is wrong, this separation makes it answerable whether the data was
wrong, the analysis was wrong, or the writing was wrong.

## Module map

| Path | Responsibility |
|---|---|
| `src/lib/yaml.mjs` | A small YAML reader, so `config/` needs no dependency |
| `src/lib/env.mjs` | `.env` parsing, so secrets need no dependency |
| `src/config.mjs` | Merges flags, env, `config/*.yml` and defaults |
| `src/format.mjs` | The league format taxonomy: valid types, declaration parsing, resolution |
| `src/sleeper/client.mjs` | HTTP only. Retries, friendly errors, player-file cache |
| `src/sleeper/normalize.mjs` | Sleeper shapes → league concepts |
| `src/analysis/lineup.mjs` | Optimal lineup solving |
| `src/analysis/week.mjs` | Week facts and award candidates |
| `src/analysis/elimination.mjs` | Who is still alive in a guillotine league, and who was chopped when |
| `src/eliminationReport.mjs` | The elimination ledger as `doctor` prints it |
| `src/store.mjs` | Snapshots, rankings, predictions, movement, grading |
| `src/promptContext.mjs` | Assembles the model's facts and instructions |
| `src/generate.mjs` | Optional Anthropic / OpenAI call |
| `src/validate.mjs` | Post splitting and length checking |
| `src/pipeline.mjs` | The run order |
| `src/cli.mjs` | Commands and human-facing output |

## Domain concepts

`League`, `Team`, `Player`, `Matchup`, `Transaction`, `WeeklySnapshot`,
`Ranking`, `Prediction`, `Award`, `Format`.

Sleeper-specific fields normalize into these rather than leaking through the
application. `roster_id` and `fpts_decimal` are not concepts; they are one
provider's storage details.

### Format

What kind of league this is — `dynasty`, `redraft` or `guillotine` — as opposed
to how it scores. The two are orthogonal and are modelled separately:

```json
{
  "type": "guillotine",
  "source": "declared",
  "declaredType": "guillotine",
  "detectedType": "redraft",
  "scoring": {
    "superflex": true,
    "reception": {
      "base": 1,
      "tier": "full PPR",
      "byPosition": {
        "RB": { "perCatch": 1, "bonus": 0 },
        "WR": { "perCatch": 1, "bonus": 0 },
        "TE": { "perCatch": 1.5, "bonus": 0.5 }
      },
      "premiumPositions": ["TE"]
    },
    "passing": { "touchdown": 6, "pointsPerYard": 0.04, "yardsPerPoint": 25, "interception": -2 },
    "nonDefault": [{ "key": "bonus_rec_te", "value": 0.5, "default": 0 }],
    "isDefault": false
  }
}
```

Format has to be **declared as well as detected**. Sleeper reports enough to
recognise dynasty (`settings.type == 2`, or a taxi squad) and redraft, but a
guillotine league is run by manual commissioner action — the API still
describes an ordinary head-to-head league. So a declaration always wins,
detection is the fallback, and `source` records which happened so `doctor` can
tell the user whether the tool was told or guessed.

A misspelled declaration is refused at config load, listing the valid values.
Silently defaulting would mean the wrong coverage with nothing to show for it.

The taxonomy lives in `src/format.mjs` and knows no provider's field names;
detection from Sleeper is `detectFormatType` in `src/sleeper/normalize.mjs`.

#### Formats that play no matchups

Sleeper pairs every league into matchups, including the formats that never play
one: a guillotine league scores each roster on its own and eliminates the lowest,
but the API still reports pairings, and those pairings mean nothing.

They are **discarded, not ignored**. `hasMatchups(format)` in `src/format.mjs` is
the single answer to whether the pairings are real, and two places act on it:

- `analyzeWeek` never pairs them. Each roster's week is scored alone, and the
  `opponent`, `opponentPoints`, `result` and `margin` fields are absent from the
  record rather than set to `null` — an absent field cannot be printed, a null
  one invites a guess. The head-to-head awards (blowout, closest game, highest
  losing score) are not computed at all.
- `buildContext` emits no `games`, no `upcomingMatchups` and no win-loss record
  in a week view, filters the matchup-only awards out of `editorial.awards`, and
  adds an `unavailable` entry telling the model that matchups are not a concept
  in this league.

The reasoning is the project's first rule: the JSON context block is
authoritative, so anything in it may be printed. A matchup that reached it would
be a false fact with the tool's own authority behind it.

#### Refusing preview and recap outright

Stripping matchup fields is not enough on its own for `preview` and `recap`:
both editions are *about* a game, so a guillotine league leaves them with
nothing to describe, not just fewer facts to describe it with. Rather than
generate a thin, confused edition, both commands refuse outright.

Two lines of defence, both keyed off `hasMatchups`/the declared format:

- `refuseGuillotineMatchupEdition` in `src/cli.mjs` runs first, before any
  Sleeper call or file write. It only needs `config.leagueFormat`: guillotine
  can never be *detected* (see above), so a declaration is the only way it is
  ever true, and checking it costs nothing.
- `buildPrompt` in `src/promptContext.mjs` checks again against the resolved
  `context.league.format`, in case some other caller reaches it directly and
  skips the CLI guard.

Both name the edition that will eventually replace the one refused
(`survival-preview`, `chop-recap`) — neither has shipped yet; they are tracked
under the "Guillotine editions" feature. `rankings` is unaffected: a power
ranking judges rosters, not games, so it has something to say for any format
once its own weight set exists.

#### The elimination ledger

In every other format the set of teams is fixed from the draft to the final
week. In a guillotine league it shrinks, and "who is still in this league" is
the question every edition is built on — get it wrong and the publication
reports on teams that are not in the league any more.

Sleeper has no elimination field. Commissioners run the format by hand: each
week they remove the chopped team's owner and force-drop its players to the
waiver pool. So `buildEliminationLedger` in `src/analysis/elimination.mjs`
works from two unreliable signals and one reliable declaration:

| | Where it comes from | Why it can be wrong |
|---|---|---|
| **derived** | the lowest scorer among the teams still alive that week, *confirmed* by that roster now being ownerless or unable to field a lineup | both halves need a human to have done manual work promptly and correctly |
| **declared** | `eliminations:` in `config/guillotine.yml`, a week → team map the operator maintains | nothing about it goes stale |

Three rules follow, and they are the whole design:

- **A declaration always wins.** It is the only signal that does not depend on
  a commissioner's timing. `doctor` prints the ledger it produced and, when
  there is no declared one, says plainly that every week in it was a
  derivation.
- **A derivation that contradicts a declaration is reported, never swallowed.**
  The two disagreeing means one of them is wrong, and nothing in the numbers
  says which. The warning names both teams and the week.
- **A week nothing settles is `unresolved`, with its candidate named.** That is
  the state of every guillotine league every Monday, and it is not an error. An
  edition that says "we do not know yet who was chopped" is recoverable; one
  that names the wrong team is not, because in this format the error compounds
  — every later week is then judged against the wrong field.

A tie for lowest is also `unresolved`: the lowest scorer is not a fact when two
teams share the score. Before any week has been played the chop signature is
not read at all, because every roster is empty in the preseason and reading it
then would eliminate the entire league in week 1.

`captureWeek` writes the ledger into the week's snapshot beside the scores. The
field a week was judged against is as much a part of that week's record as the
points are, and it obeys the same rule: **history is not rewritten.** For a
format where nobody is eliminated the `elimination` key is *absent* from the
snapshot rather than `null` — the same reasoning as the matchup fields above.
`hasEliminations(format)` in `src/format.mjs` is the single answer to whether
the question applies, so no module repeats a `=== 'guillotine'` check.

The ledger stores the full roster plus the ordered history rather than a
survivor list per week; `survivorsAt(ledger, week)` answers for any week from
those two, without writing eighteen names out eighteen times in every snapshot.

### Scoring profile

`format.scoring` is built by `deriveScoringProfile` in
`src/sleeper/normalize.mjs`. `league.scoring` keeps Sleeper's raw blob; the
profile is the part an editor can reason about — is a tight end worth more than
a receiver here, and how much is a quarterback worth.

Positional reception bonuses are reported as a **delta over the base rate** as
well as an effective per-catch value. The delta is the part that changes what a
position is worth: `bonus_rec_te: 0.5` on top of full PPR makes a tight end
catch worth 1.5, and 1.5-against-1.0 is the fact that moves a ranking. The same
treatment applies to `bonus_rec_rb` and `bonus_rec_wr`, so the next scoring
wrinkle does not need the same fix again.

`nonDefault` exists because Sleeper sends every league's complete settings blob
with no indication of which values the commissioner changed. The profile diffs
it against `SLEEPER_DEFAULT_SCORING`, a transcription of Sleeper's standard
template, and lists what differs — including settings turned *off*, because a
league with no interception penalty is unusual and would otherwise read as
ordinary. Keys the table has never heard of (return yardage, first-down
bonuses, tackle-based IDP) are listed too, unless they are zero, which is how
Sleeper spells "switched off".

That table is a transcription, so it can be wrong. It is arranged to fail in
the safe direction: a wrong entry makes an ordinary setting appear in
`nonDefault`, which is visible and correctable. Treating anything unrecognised
as ordinary would hide exactly the settings the diff exists to find.

## State

**League constitution** — mostly static: size, scoring, roster positions,
Superflex status, TE premium, playoff and taxi settings, trade deadline.

**Team state** — roster, starters, bench, taxi, reserve, record, current
ranking.

**Historical ledger**, per week — matchup, score, opponent, potential points,
lineup efficiency, ranking, movement, transactions, awards, the preview
prediction and whether it was right.

**Editorial memory** — recurring jokes, manager tendencies, rivalries, past
trades, previous rankings, bad predictions.

The governing philosophy:

> The publication should remember its own mistakes.

Which is why predictions are persisted at publication time, not reconstructed
afterwards.

## Historical integrity

Historical analysis uses historical snapshots. A preseason ranking generated
after week 1 must use the preseason roster snapshot, and must not incorporate
week 1 results, later transactions, later injuries or later roster changes.

This is why `data/snapshots/` is append-only and why `store.mjs` never
overwrites a past week with current data.

## Separating analysis from prose

The long-term goal is that analysis produces an explainable result:

```json
{
  "team": "Virginia Virgins",
  "previous_rank": 12,
  "current_rank": 9,
  "movement": 3,
  "week_score": 161.68,
  "week_rank": 1,
  "reason_codes": ["league_high_score", "qb_breakout", "strong_skill_positions"]
}
```

and the model converts that into prose. Reason codes are not yet implemented;
today the model is given the facts and forms the judgement itself. Moving
further in this direction makes rankings more testable and more explainable.

## Adding another platform

Write a new client and normalizer that emit the same normalized shapes.
Nothing downstream of `src/sleeper/` should need to change. If it does, a
Sleeper detail has leaked and belongs back in the normalizer.
