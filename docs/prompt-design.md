# Prompt Design

## Assembly

Every prompt is built by `src/promptContext.mjs` in this order:

```
SYSTEM INSTRUCTIONS      prompts/system.md
TASK INSTRUCTIONS        prompts/<edition>.md
LEAGUE CONTEXT           a JSON block
```

The JSON block carries, depending on the edition:

```
league settings
current team state / standings
this week's data
previous week's data
previous rankings
previous predictions, graded
transactions
editorial configuration
```

## Structured facts, not prose facts

Facts are given as JSON, not as a written summary, because a JSON block is
checkable. When the output contains a number, it is possible to search the
context for it and know whether the model was quoting or inventing.

The model is told, in `system.md`:

> Do not invent facts not present in the supplied context. Treat scores,
> records, rosters, players, transactions and rankings in the structured
> context as authoritative. Editorialize only after factual grounding.

## Compactness matters

A 12-team dynasty league is around 400 players. Spelled out as
pretty-printed JSON objects, a rankings prompt reached 200 KB — too large to
paste into a chat window and expensive to send to an API.

Players are therefore written as single lines:

```
Josh Allen (QB, BUF, age 30)
QB Josh Allen (BUF) 35.66
```

This cut the same prompt to under 60 KB with no loss of meaning. When adding
context, prefer a readable line over a nested object.

## Separate prompts for separate evidence rules

Preseason and weekly power rankings are different files, because their
evidence rules are materially different:

- `preseason-power-rankings.md` must **ignore** regular-season evidence
- `weekly-power-rankings.md` explicitly **incorporates** it
- `postseason-power-rankings.md` uses full hindsight and audits its own
  earlier editions

Collapsing these into one prompt with conditionals invites the preseason
edition to leak knowledge it should not have.

## Format-conditional sections

League format is the opposite case. A redraft ranking and a dynasty ranking
follow the same evidence rules, structure and house style; they differ only in
a few passages: dynasty asset value, age curves and future draft capital.
Those passages are wrapped in delimited blocks inside the shared prompt file:

```
<!-- format: dynasty -->
## Draft capital
...
<!-- end format -->
```

A block may name several formats (`<!-- format: dynasty, redraft -->`). Text
outside any block applies to every format.

**Decision: conditional blocks in one file, not one file per format.** Per-format
copies would duplicate the house style (structure, tiers, the JSON tail) across
files that would drift apart the first time someone edited one and not the
other. Blocks keep one file per edition, and the HTML-comment markers keep the
exceptions visibly fenced off.

The blocks are resolved by `src/promptTemplate.mjs` when the prompt is built,
from `context.league.format.type`, so the model never sees a block that is not
for its league. It is not asked to skip the dynasty passage; it never reads it.
Malformed markup is refused rather than guessed at: an unknown format name, an
unclosed, nested or stray marker, or a file with blocks rendered without a
format. `tests/prompt-format-blocks.test.mjs` renders every prompt file for
every format, and checks that the redraft ranking instructions contain no
dynasty-only vocabulary.

In a redraft league, age is still a fair factor where it bears on this season
(an ageing running back losing touches), but never as an argument about what
a player is worth later.

## The output contract

### Post separation

Posts are separated by a line containing only `%%%`. `validate.mjs` splits on
it and checks each post against the configured limit. Emoji are counted the
way a chat box counts them, not by UTF-16 code units.

### Machine-readable tails

Editions that create future obligations end with a fenced `json` block after
the final `%%%`:

- **previews** emit their predictions, so the next recap can grade them
- **ranking editions** emit their order, so the next edition can show movement

Team names in these blocks must match the context exactly. `extractJsonBlock`
reads the last one; `stripJsonBlock` removes it from the human-facing copy.

This is what makes the copy-and-paste workflow have a memory: the user runs
`record` on the reply, and the block is filed.

## Editing prompts

Prompt files are behaviour. Changing one changes the product.

After editing a prompt, regenerate a sample edition and read it. A prompt
change that has not been run is not a tested change.
