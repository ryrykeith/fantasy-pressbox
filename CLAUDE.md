# Fantasy Pressbox — Claude Instructions

Before making changes, read `AGENTS.md`. It holds the repository-wide rules
and points at the architecture, data, editorial and prompt documentation.

## Workflow

1. inspect the relevant existing code
2. read the applicable file under `docs/`
3. read the relevant file under `prompts/` if generation behaviour is involved
4. preserve existing project conventions
5. add or update tests
6. validate before finishing

Do not duplicate permanent project rules here. When a new architectural,
editorial or data rule appears, write it into the right file under `docs/`
rather than expanding this one.

## Constraints worth repeating

- Never invent fantasy league data.
- Never hard-code league-specific teams, players, IDs, jokes or scoring rules.
- Keep fetching, normalization, analysis, prompting and rendering separate.
- Do not add npm dependencies casually; zero-dependency install is a feature.
- Do not commit `.env`, API keys or private league data.
- Preserve historical state when generating historical rankings or recaps.
- Sleeper output obeys the configured plain-text and length constraints.

See `AGENTS.md` for the canonical guidance.
