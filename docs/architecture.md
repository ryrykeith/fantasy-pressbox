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
`Ranking`, `Prediction`, `Award`.

Sleeper-specific fields normalize into these rather than leaking through the
application. `roster_id` and `fpts_decimal` are not concepts; they are one
provider's storage details.

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
