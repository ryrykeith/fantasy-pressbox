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
