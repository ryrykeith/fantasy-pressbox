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
| `src/analysis/danger.mjs` | The chop line, survival margin and rolling floor for a guillotine league |
| `src/analysis/faab.mjs` | Remaining FAAB per survivor and the player pool each chop released, for a guillotine league |
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

Both name the edition that replaces the one refused (`survival-preview`,
`chop-recap`), and both have shipped (see below). The refusal asks `TASKS`
which is which rather than carrying its own claim, so the message would stop
saying "not shipped yet" the week a future replacement lands, instead of
going stale. `rankings` is unaffected: a power ranking judges rosters, not
games, so it has something to say for any format once its own weight set
exists.

#### The survival preview

The forward-looking edition a guillotine league gets in place of the matchup
preview. `prompts/survival-preview.md` is registered in `TASK_PROMPTS` as
`survival-preview`, and `src/cli.mjs` exposes it as its own command.

It is guarded in both directions, mirroring the matchup guard exactly:
`refuseSurvivalEditionWithoutEliminations` in `src/cli.mjs` refuses it before
any work begins for a league that is not declared guillotine, and `buildPrompt`
refuses again from the resolved format via `ELIMINATION_ONLY_TASKS`. The CLI
guard can read the declaration alone for the same reason the matchup one can:
guillotine is the only format anyone is chopped out of and it can never be
detected, so an undeclared league is definitively not one.

Its facts are the ones the format actually turns on, and all of them come from
analysis that already existed:

| Context key | Built by | Why |
|---|---|---|
| `dangerBoard.lastCompletedWeek` | `src/analysis/danger.mjs` | the score it took to survive, and by how little |
| `dangerBoard.floors` | `src/analysis/danger.mjs` | the number that predicts danger — a team dies on its bad weeks |
| `byeExposure` | `src/analysis/byeExposure.mjs` | a bye cluster is a genuine elimination risk here |
| `faabMarket` | `src/analysis/faab.mjs` | who can afford the next roster to hit the wire |
| `standings`, `eliminationHistory` | `src/analysis/elimination.mjs` | the field still alive, kept apart from the field that is gone |

Two filters in `dangerBoardView` (`src/promptContext.mjs`) are load-bearing:

- **The week being previewed never sets the chop line.** `buildDangerBoard`
  already skips a week that was not played, but a week *in progress* counts as
  played — Sunday afternoon has real points on the board — and a chop line
  drawn under a third of a week's scores is wrong in the most convincing way
  available. So the view drops every week at or after the one being previewed,
  and `unavailable` carries a `chopLine` entry when that leaves nothing.
- **Floors cover only the survivors.** `rollingFloor` deliberately reports
  every roster that ever scored, but this edition reads the list worst-first as
  "who is in danger". A chopped team's floor is the worst in the league almost
  by definition — it is why they went — so leaving one in puts an eliminated
  team at the top of the list of teams to watch. `lastCompletedWeek.scoringOrder`
  is *not* filtered: the team chopped in that week belongs in that week's
  record, sitting on the line it failed to clear. History is not rewritten.

**The called shot is a chop, not a winner.** A format with no games has nothing
to pick the winner of, so the machine-readable block names the team expected to
go out:

```json
[{ "week": 3, "predicted_chop": "Virginia Virgins", "reasoning": "lowest floor, three starters on bye" }]
```

`recordBlock` files it through the same `store.savePredictions` path a matchup
preview uses, and `gradePredictions` tells the two shapes apart by their own
fields (`predicted_chop` versus `predicted_winner`) rather than by the league's
format — by grading time the record already says which it is, and reading that
off the record keeps a mixed file from being scored against the wrong rule.

A called chop is graded against the elimination ledger, the only thing in this
project entitled to say a team was chopped. **A week the ledger has not settled
is left ungraded, never scored wrong.** That is the ordinary Monday state of a
guillotine league — the scores are in but the commissioner has not processed
the chop, or two teams tied for lowest — and marking those wrong would both
invent a result and punish a correct call for a commissioner's timing. `grade`
prints the ungraded rows with their reason rather than skipping them, so a
prediction never silently vanishes from its own grading.

**Ranking weights are asked for only by editions that rank.** `guillotine` has
no weight set yet and `resolveRankingWeights` refuses rather than borrowing the
dynasty set, so resolving one for every edition would have blocked the survival
preview on a decision it never reads. `RANKING_TASKS` in `src/promptContext.mjs`
is the list that asks; a guillotine league can publish its survival preview
today and is refused only if it asks for a ranking.

#### The chop recap

The backward-looking edition a guillotine league gets in place of the matchup
recap. `prompts/chop-recap.md` is registered in `TASK_PROMPTS` as `chop-recap`,
and `src/cli.mjs` exposes it as its own command. It shares `commandEdition`'s
recap/rankings/postseason path in `src/cli.mjs` rather than getting a branch of
its own — the only thing that path does differently for it is also read the
danger board, which a plain recap has no format-fact to want.

Guarded exactly like the survival preview, in both directions: guillotine
refuses `recap` and points at `chop-recap` (`refuseGuillotineMatchupEdition`),
and any other format refuses `chop-recap` and points back at `recap`
(`refuseSurvivalEditionWithoutEliminations`, generalised to both directions via
`ORDINARY_EDITION_FOR` — the reverse of the `GUILLOTINE_EDITION_FOR` map the
first guard already used, built once so the two guards can never name
different commands for the same pair). `buildPrompt` in `src/promptContext.mjs`
refuses again from the resolved format, the same second line of defence every
other elimination-only edition carries.

**The one fork this task adds to code the survival preview already owns:**
`dangerBoardView` (`src/promptContext.mjs`) computes `lastCompletedWeek` from
weeks strictly before `beforeWeek`. A survival preview is *about* a week that
has not been played, so it passes `beforeWeek: week` — excluding that week is
the whole point, since its scores do not exist yet. A chop recap is *about*
the week that just finished, and that week's own chop is the fact the edition
exists to report, so it passes `beforeWeek: week + 1` instead — landing
`lastCompletedWeek` on the week being recapped rather than the one before it.
`FORWARD_LOOKING_TASKS` (`src/promptContext.mjs`, imported by `src/cli.mjs` for
the same `resolveWeek` offset decision rather than duplicated) is what
`buildContext` asks to choose between the two.

Nothing else about the danger board changes: `lastCompletedWeek.scoringOrder`
still carries the team that was just chopped, sitting on the line at a margin
of exactly zero — the same "history is not rewritten" rule documented under
the survival preview above is what makes "who nearly went" (the smallest
nonzero margin) and "who went" (the zero) both readable off one array. The
released pool a chop recap reports is the `releasedPools` entry whose `week`
matches the context's own `week`; the ones before it are older chops, not this
week's news, and the prompt file is what tells the model to tell them apart.

**`survivorCount` is stated, not counted.** `context.survivorCount` is set
directly from `eliminationLedger.survivorCount` (falling back to the full
roster when no ledger ran) rather than left for a model to infer from the
length of `standings` — the one number a chop recap's headline has to get
exactly right, computed the same way `pointsLeftOnBench` and every other
model-facing number in this project already is.

**Grading reuses the survival preview's own mechanism.** A chop recap's
`previousPredictions` comes from the identical `gradePredictions` call a plain
recap already makes — `gradeChopPrediction` (`src/store.mjs`) tells a called
chop apart from a called game by its own fields, not by the caller's task, so
nothing here needed to change for the called shot a survival preview makes the
week before to come back gradeable the week after.

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

#### Survivor standings, not win-loss standings

`buildContext` in `src/promptContext.mjs` has a season-long team view for two
different purposes — `context.teams`, the full roster picture rankings
editions judge, and `context.standings`, a compact leaderboard — and both are
format-aware for the same reason the week view is: a guillotine league's
Sleeper-reported win-loss record comes from matchups nobody played, so it is
not a fact, and nothing downstream may cite it.

- `rosterView` (feeding `context.teams`) omits `record` whenever
  `hasMatchups(format)` is false — the same `includeRecord` treatment
  `teamWeekView` already applies to a single week's record, applied here to
  the season's.
- For `hasEliminations(format)` (currently just guillotine), `context.standings`
  is built by `survivalStandingsView` instead of the ordinary wins-then-points
  sort: teams still alive, ranked purely by `seasonPointsFor`. Neither `record`
  nor `pointsAgainst` appears — both are opponent-shaped facts, and this format
  has no opponents.
- A chopped team is not sorted to the bottom of `context.standings`; it is
  removed from it entirely. `eliminationHistoryView` builds a separate
  `context.eliminationHistory` list — `{ team, week }` per chop, in week order
  — from the same `eliminationLedger.history` the elimination ledger produces,
  so a model can never mistake a team that is no longer in the league for one
  still competing. It is present as `[]` rather than absent when nobody has
  been chopped yet: an empty list is a fact ("nobody chopped so far"), while an
  absent key would be indistinguishable from "not tracked in this edition".

`eliminationLedger` reaches `buildContext` as a plain parameter — `src/cli.mjs`
passes through the same ledger `captureWeek` already attached to the week's
snapshot, so nothing downstream builds its own copy.

#### The danger board

Cumulative points (above) say who is winning the season; they say nothing
about who nearly died *this week*, which is the fact a guillotine edition is
actually built to report. `src/analysis/danger.mjs` answers that from the same
weekly scores `elimination.mjs` already reads:

- `weekDanger` takes one week's scores and the elimination ledger (to know who
  was still alive *entering* that week) and returns the week's scoring order —
  highest points first, the same convention as `analyzeWeek`'s `scoringOrder`
  — with each team's `marginAboveChopLine` attached. `chopLine` is the lowest
  score among that week's contenders; `survivalMargin` is the gap between it
  and the next-lowest score, i.e. how close the team that survived came to not
  surviving. A roster Sleeper still returns a score for after it has been
  chopped cannot pollute either number: the ledger says it was not a
  contender, so its score is filtered out before the sort. A week with fewer
  than two contenders (the field already has its champion) reports `null` for
  both rather than a number that would misstate the guaranteed-safe case as
  some kind of margin.
- `rollingFloor` reduces each team's played weeks to its **lowest** and
  **median** score. Ceiling is not tracked — floor is the number that keeps a
  roster alive in this format, not the one that wins it a week — and the list
  is sorted worst-floor-first, the team the coverage should be watching
  hardest.
- `buildDangerBoard` combines both across the weeks supplied, skipping weeks
  that were not played or that resolved to fewer than two contenders.

`captureWeek` computes the elimination ledger and the danger board from the
identical `weeks` array — the danger board is built *from* the ledger it was
computed alongside, so a roster chopped this week never sets or clears this
week's chop line — and writes both into the snapshot. `danger` is absent from
the snapshot for a format with no eliminations, the same "absent key, not
null" rule the `elimination` key follows. `readDangerBoard` in
`src/pipeline.mjs` mirrors `readEliminationLedger`: it rebuilds the board from
weeks already on disk and fetches nothing, for `doctor`-style checks.

#### The FAAB market

The waiver market IS the story in a guillotine league — every chop dumps a
full roster of talent onto the wire at once, unlike the trickle of cuts an
ordinary league sees. `src/analysis/faab.mjs` answers two questions:

- **`faabBalances`** — what each surviving team has left of the league's FAAB
  budget, and what it has spent so far. `league.waiverBudget` and
  `team.waiverBudgetUsed` (`src/sleeper/normalize.mjs`) are already exactly
  these facts; the only work here is the subtraction, and restricting the
  result to `ledger.survivors` the same way `weekDanger` restricts contenders
  — an eliminated team has no more waivers left to win. A league that never
  set a budget reports `remaining: null` rather than a subtraction against
  nothing.
- **`releasedPool`** — the player pool one elimination dumped onto the wire,
  attributed to the team that was chopped. Sleeper keeps no history of a past
  roster (the same limitation `elimination.mjs` documents), so this cannot be
  reconstructed by diffing today's now-empty roster against anything. What
  *does* survive is that week's own matchup entry — Sleeper scores a week
  against the roster as it stood when the week was played, before a
  commissioner force-drops it afterward — and its raw `players` array
  (`src/store.mjs`'s raw bundle, saved the moment the week was fetched) is the
  full squad, bench included. A week whose raw bundle was never saved reports
  the gap explicitly (`note`), rather than an empty pool that would look the
  same as "this roster released nothing".
- **`buildFaabMarket`** combines both, and attaches any winning FAAB bid
  already placed on a released player: `waiverBidsFor` in
  `src/sleeper/normalize.mjs` reads the same raw transaction fields
  `normalizeTransactions` reads (`status`, `adds`, `settings.waiver_bid`)
  rather than a second parser, matching a bid to one specific player id
  instead of turning it into a prose line. A released player can be claimed
  any week from the chop onward, not only the week it happened, so every
  later raw bundle's transactions are searched, not just the chop week's own.

`captureWeek` computes the FAAB market from the elimination ledger it just
built, using `store.loadRawThrough` to pick up every earlier week's raw
bundle already on disk (including the one just saved for the current week —
no second fetch), and writes it into the snapshot as `faab`, absent rather
than `null` for a format with no eliminations, the same rule `elimination`
and `danger` both follow. `readFaabMarket` in `src/pipeline.mjs` mirrors
`readEliminationLedger`/`readDangerBoard`: it rebuilds the market from weeks
already on disk and fetches nothing.

`faabMarketView` in `src/promptContext.mjs` is where a released player id
becomes a line a model can read — `src/analysis/faab.mjs` deals only in ids
and numbers, the same split `rosterView` already makes for a team's own
roster — and reaches `context.faabMarket` the same way `eliminationLedger`
reaches `context.standings`: as a plain parameter `src/cli.mjs` passes
through from `captureWeek`'s own result, so nothing downstream builds a
second copy.

#### Bye-week exposure

A bye week is not a Sleeper field. The full cached `/players/nfl` dictionary
(12,000+ players) has no field resembling one at any nesting level — checked
directly rather than assumed — and Sleeper has no schedule or bye-week
endpoint either. A bye is the *absence* of a game, so the only honest source
is the real NFL schedule.

`scripts/fetch-bye-weeks.mjs` walks ESPN's public scoreboard endpoint once per
season (all 18 regular-season weeks) and writes a reviewable, committed
`config/bye-weeks.<season>.yml`: 32 teams, each with exactly one bye week. It
refuses to write a table that does not come out to exactly that shape, and it
resolves the mapping gotchas that would otherwise silently corrupt the count —
ESPN reports Washington as `WSH` where Sleeper (and this table) says `WAS`,
and Sleeper still carries the retired `OAK` code on old players, aliased here
to `LV`. Nothing at runtime calls ESPN: the table is 32 static rows that do
not change once the schedule is published, so putting a third-party API on
the critical path of every edition would buy nothing and risk everything.

`src/analysis/byeExposure.mjs` reads that committed table, never the network:

- **`parseByeWeekTable`** validates a parsed table and folds it into one
  `team -> week` lookup, with every alias resolved into the same lookup the
  real teams live in — looking up `OAK` and looking up `LV` return the
  identical week, so nothing downstream special-cases a stale code. It mirrors
  `parseDeclaredEliminations` (`src/analysis/elimination.mjs`): every
  complaint is about a hand-edited or broken-generator file, so every one of
  them stops the run rather than silently reporting a partial table — a team
  that looks like it never has a bye is exactly the kind of wrong fact this
  project refuses to print. `src/config.mjs#loadByeWeekTable` is the one place
  that turns a season number into a file path and calls it; there is no
  fallback default the way `config/guillotine.yml` has one, because "no table
  found" cannot honestly default to "nobody has a bye" — a season without its
  table yet is refused loudly, naming `scripts/fetch-bye-weeks.mjs` as the
  fix, the same way `resolveRankingWeights` refuses a format with no weight
  set rather than guessing.
- **`byeWeekFor`** looks up one starter's NFL team. An abbreviation the table
  does not recognise — a gap, not a real "no bye" — is refused rather than
  read as zero exposure, for the same reason the table's own generator
  refuses to ship a partial one.
- **`upcomingByeExposure`** is the forward-looking report itself: for each
  team still alive (`ledger.survivors`, the same convention `weekDanger` and
  `faabBalances` already follow), how many of its *current* rostered starters
  (`team.starterIds`, not the full roster) land on a bye in each of the next
  few weeks. It reads the roster's current starters rather than a played
  week's Sleeper matchup entry — this is a report about weeks that have not
  happened yet, so there is no per-week starter list to read.

`src/pipeline.mjs#captureWeek` computes it alongside `danger` and `faab`, from
the identical elimination ledger, and writes it into the snapshot as
`byeExposure` — absent rather than `null` for a format with no eliminations,
the same rule every guillotine-only key in the snapshot follows.
`readByeExposure` mirrors `readDangerBoard`/`readFaabMarket`: it rebuilds the
report from weeks already on disk and fetches nothing over the network (the
bye-week table is a local file read, not a fetch).

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
