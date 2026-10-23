# Prompt Design

## Assembly

Every prompt file is built by `buildPrompt` in `src/promptContext.mjs` in this
order:

```
READ THIS FIRST          a short preamble: this is an assignment, not a document to review
SYSTEM INSTRUCTIONS      prompts/system.md
TASK INSTRUCTIONS        prompts/<edition>.md
LEAGUE CONTEXT           an instruction to read the `unavailable` list first, then a JSON block
```

With `--generate` the call is split instead (`src/cli.mjs`): `system.md` goes as
the system message, and the task instructions plus the `# LEAGUE CONTEXT`
heading and the JSON block go as the user message. That path has neither the
preamble nor the `unavailable` instruction.

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
the ranking preset and its weights
the team strength rating
declared rivalries, with their head-to-head record
market values, with the FantasyCalc credit line
the five-year plan's facts (`fiveYearPlan`)
unavailable: what the edition does not know, each with an instruction
```

## Structured facts, not prose facts

Facts are given as JSON, not as a written summary, because a JSON block is
checkable. When the output contains a number, it is possible to search the
context for it and know whether the model was quoting or inventing.

The model is told, in `system.md`:

> **Never invent a league fact.**
>
> The JSON context you are given is the complete record of this league. Players,
> scores, records, rosters, starters, benches, transactions, draft picks,
> rankings and predictions all come from there and nowhere else.
>
> - If a claim is not supported by the context, do not make it.
> - If you want a number you were not given, leave the sentence out.

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

Every other edition ends without one. The prompts for `future-stock`,
`five-year-plan`, `tank-watch`, the trade report and the waiver report say so
outright: "No JSON block at the end. This edition is not recorded."

Team names in these blocks must match the context exactly. `extractJsonBlock`
reads the block after the last `%%%` line (a fence inside a post is never read):
the last fence tagged `json` in any case, or, when none is tagged, the last bare
fence, since the chat sometimes drops the tag. `findJsonBlock` also says whether
a block was found but would not parse, which recording reports as its own error.
`stripJsonBlock` removes the same block from the human-facing copy.

This is what makes the copy-and-paste workflow have a memory: the user runs
`record` on the reply, and the block is filed.

## Editing prompts

Prompt files are behaviour. Changing one changes the product.

After editing a prompt, regenerate a sample edition and read it. A prompt
change that has not been run is not a tested change.
