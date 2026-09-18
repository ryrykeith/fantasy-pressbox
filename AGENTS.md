# Fantasy Pressbox — Agent Instructions

Fantasy Pressbox turns fantasy football league data into AI-generated league
coverage: power rankings, previews, recaps, awards, prediction tracking,
ranking movement and league-specific humour. Sleeper is the first platform
integration.

## Before making changes

Read the documentation that covers what you are touching:

- Architecture and pipeline: `docs/architecture.md`
- Editorial behaviour and ranking philosophy: `docs/editorial-model.md`
- Prompt assembly: `docs/prompt-design.md`
- Sleeper data model: `docs/sleeper-data.md`

If the change affects generated content, read the relevant file in `prompts/`
as well. Prompt text is behaviour.

## Core rules

1. **Never invent league facts.** Scores, rosters, records, players,
   transactions and rankings come from league data. This rule applies to the
   code and to the prompts the code writes.
2. Prefer structured data over prose when giving the model facts.
3. Keep factual analysis separate from editorial generation. Numbers are
   computed in `src/analysis/`; opinions are formed in `prompts/`.
4. Preserve historical snapshots. A past ranking or prediction must never be
   recomputed using later information.
5. Power rankings are not standings.
6. Weekly predictions must stay recoverable so recaps can grade them.
7. Sleeper output is plain text and must respect the configured length limit.
   Never truncate silently — report and let a human decide.
8. League-specific values come from configuration or league data. Never
   hard-code a team, player, manager, joke, scoring rule or league ID.
9. Secrets live in `.env`, which is never committed.
10. Tests use fixtures, not live API calls.

## Architecture

```
fetch → normalize → snapshot → analyze → build prompt → generate → validate → render
```

Each stage is its own module. Sleeper's field names (`roster_id`,
`starters_points`, `fpts_decimal`) stop at `src/sleeper/`; nothing downstream
should know them.

## Dependencies

**The project has zero runtime npm dependencies, deliberately.** Its audience
is league commissioners who are not developers, so "install Node" is the whole
install story. Do not add a dependency without a strong reason — the YAML
reader and `.env` parser in `src/lib/` exist precisely to avoid two of them.

Node 18 or newer is assumed, so `fetch` is built in.

## Configuration

- Environment and secrets → `.env`
- Behaviour that a league commissioner might tune → `config/`
- Generation instructions → `prompts/`

Do not duplicate configuration in source code without a clear reason.

## Development expectations

Before finishing a meaningful change:

1. run `node --check` over changed files, or the test suite once one exists
2. run `node src/cli.mjs doctor` against a real league
3. regenerate a sample edition when prompt or context behaviour changed, and
   read it
4. update the relevant file in `docs/` when behaviour changed

Prefer small, explicit modules over large scripts or hidden global state.

## Source of truth

When instructions conflict:

1. repository code and tests define implemented behaviour
2. `docs/` defines intended architecture and domain rules
3. `prompts/` defines generation behaviour
4. `config/` defines tunable settings
5. this file provides high-level guidance
