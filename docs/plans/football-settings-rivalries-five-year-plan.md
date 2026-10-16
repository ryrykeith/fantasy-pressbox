# Ranking presets, a strength rating, rivalries and the five-year plan

Status: planned 2026-10-15. Owner: the operator. Ships in 0.2.0, before the
release task (`8574bb39`). Branch: `feat/football-config`.

Three PRD epics: "Ranking presets and a team strength rating", "Rivalries"
and "Five-year plan". Each task in them is self-contained. This file holds the
reasoning that would make the task descriptions too long.

## 1. Owner decisions (2026-10-15)

- **Weights:** add named presets, a team strength rating that the code
  computes, and carry both in the league file. Ranking weights can already be
  overridden per league in `config/rankings.yml`, and that stays as it is.
- **Five-year plan:** a new dynasty-only edition about **one** team, chosen
  with `--team`. It is an outlook built from facts, not a prediction.
- **Rivalries:** the operator declares rival pairs in a config file, with an
  optional name and a line of backstory. Editions add the pair's real
  head-to-head record from saved history, and the preview and the recap turn
  the intensity up for those matchups.

## 2. Rules every task keeps

- **Never invent a fact.** Anything the league's data cannot supply becomes
  an `unavailable` entry with its reason. Nothing defaults to 0.
- **Judgement is labelled as judgement.** Preset weights, age curves and
  rivalry intensity are editorial choices. Each one lives in a config file
  with comments saying so, never in code presented as a fact.
- **The invented cast only** in tests, fixtures, docs and commit messages. The
  operator's rivalry names and backstory live only in their own league
  folder's `config/rivalries.yml` (and in a league file they export), never in
  the repository.
- **One option list.** A new edition or flag goes into `src/options.mjs`, so
  the CLI and the website both get it (`tests/options.test.mjs`).
- **Core stays browser-safe.** New modules import nothing from `node:`
  (`tests/core-purity.test.mjs`).
- **The league file is still unreleased** (schema v1 has not shipped). New
  settings can join v1 without a version bump until 0.2.0 is published.

## 3. Ranking presets

Today `config/rankings.yml` holds one weight set per format (`dynasty`,
`redraft`, `guillotine`) and one per ranking edition (`future_stock`). A
workspace override replaces a set wholesale.

The new setting is `preset`. It picks a named set of weights for the league's
format:

| Format | Presets |
|---|---|
| dynasty | `win-now`, `balanced` (today's set), `rebuild` |
| redraft | `balanced` (today's set), `win-now` |
| guillotine | `balanced` only (today's set) |

- **Absent** means `balanced`, so a league that sets nothing ranks exactly as
  it does today.
- **The preset tables** are shipped in `config/rankings.yml`, commented as
  editorial guidance, and every set sums to 1.0. A rebuild preset moves weight
  from `contender_viability` and `starting_lineup` to `dynasty_value`, age and
  `future_draft_capital`. Win-now does the reverse. The run picks the values,
  and the comments explain them.
- **A preset sets both** the ranking weights and the strength rating's weights
  (section 4).
- **A workspace that sets both** `preset` and an explicit `weights.<format>`
  for the same format is refused, naming both. Nothing silently wins.
- **The prompt is told the preset name** (`editorial.rankingPreset`), so a
  ranking can say what the league ranks for, but it never prints the numbers.

## 4. Team strength rating

The rankings are written by the model, guided by weights. The strength rating
is different: a number that **the code** computes from facts, so it is
reproducible and can be checked.

- **Range:** each team gets a rating from 0 to 100, relative to its league.
  Each component also has its own value and league rank.
- **Components, each built only from data the league has:**

  | Component | From | Formats |
  |---|---|---|
  | `lineup` | Optimal-lineup points over the last N settled weeks (the lineup solver) | dynasty, redraft |
  | `depth` | Bench points that the solver would have started on a short week | dynasty, redraft |
  | `market_value` | FantasyCalc value of the roster | dynasty, redraft (when priced) |
  | `age_window` | Points-weighted starter age against each position's curve (`rosterWindow`) | dynasty |
  | `draft_capital` | Priced future picks (`pickCapital`) | dynasty, on Sleeper |

- **A component that can't be computed** (for example, no settled weeks in the
  preseason, no market, or ESPN's missing traded picks) is listed in
  `strength.unavailable` with its reason. The remaining weights are scaled
  back up to 1.0 and the context says so. A missing component never counts
  as 0.
- **Weights** are `strength.dynasty` and `strength.redraft` in
  `config/rankings.yml`, set by the preset.
- **Where it appears:** the weekly, preseason and postseason rankings
  contexts, the future stock context, and the five-year plan. The prompts
  may cite the rating and its parts, but the ranking is still the model's
  judgement under the ranking weights. A strong rating can't be cited as the
  sole reason for a ranking.
- **Guillotine leagues get no strength rating.** Their survival rankings
  already judge the floor, which is a different question.

## 5. Rivalries

Rivalries are set in a new, optional league-folder file, `config/rivalries.yml`:

```yaml
rivalries:
  - teams: [Bye Week Blues, Punt Intended]   # a team name or roster id each
    name: The Cheese Bowl                     # optional
    note: Started when one sniped the other's waiver claim in 2024. # optional, one line
```

- **Teams resolve to roster ids** through the team identity module, as
  `guillotine.yml` does, so a renamed team keeps its rivalry. An unknown or
  ambiguous name is refused, naming it. A pair must be two different teams,
  and a duplicate pair is refused. A team may have several rivals.
- **Limits:** the name and the note are length-limited and go through the
  safe-input rules.
- **Head-to-head record** (`src/analysis/rivalry.mjs`, pure) comes from saved
  snapshots across every saved season:
  - wins, losses and ties;
  - total points;
  - the last meeting (season, week, score);
  - the current streak;
  - the biggest margin.

  It counts only weeks where both sides were saved and says which seasons
  that covers. With no saved meeting the record is `unavailable` ("no
  meeting saved"), never 0-0.
- **Editions:**
  - The preview and the recap add a `rivalry` block to a matchup between
    rivals. The prompts turn the intensity up for those matchups only, one
    step above `roast_intensity`, and may use the note and the head-to-head
    facts, never invented history.
  - A trade between rivals is flagged in the trade report.
  - Survival editions have no matchups and are unchanged.
- **Providers:** rivalries work on ESPN too, since a team is a team.
- **Where it travels:** the league file carries `config/rivalries.yml`, and
  `inspectLeague` reports rivalries that no longer resolve to a team.

## 6. Five-year plan

The new edition is `five-year-plan --team <name or roster id>`. It is
dynasty-only and **not** recordable, and it isn't part of the weekly routine.

The facts for seasons S to S+4 come from `src/analysis/fiveYearPlan.mjs`
(pure):

- **Ages:** each rostered player's age at the start of each season. The basis
  is Sleeper's age, shifted forward a year per season; where Sleeper doesn't
  supply an age, it is `unavailable`.
- **Age-curve stage:** each player's stage in each season (rising, peak,
  declining or cliff), from editorial per-position curves in
  `config/rankings.yml` (`age_curves`), commented as judgement. The defaults
  are reviewed against the future stock prompt's statements about positions.
- **Per-season roll-ups:**
  - how many of today's starters are past their position's decline age;
  - how much of today's starter production comes from players still before
    their cliff.
- **Draft picks** held each season, from `pickCapital`. A draft already held is
  `unavailable`, and so is a draft beyond every traded or priced one: no
  Sleeper horizon of issued drafts is documented, so the reason is "whether it
  is issued is not known", never "not issued". Never empty.
- **Context:** today's strength rating and its parts, the team's league rank,
  and its market value.
- **No projected points, records or titles.** The prompt frames the plan as a
  contention window and the options open to the team (who to sell before a
  cliff, which picks are its currency), with each claim tied to a fact.

Refusals, each naming the reason:
- redraft and guillotine leagues;
- ESPN, as future stock is (traded picks aren't read);
- basketball, in its first flight;
- an unknown or ambiguous `--team`.

`--team` is a new entry in `OPTIONS`, applying to this edition only. The
website renders it as a team picker.

## 7. Order and branches

1. Presets (`feat/football-config`).
2. The strength rating.
3. Rivalries: config, head-to-head, then editions.
4. Five-year plan facts, then the edition. It needs the strength rating.
5. Docs and README.

Merge to main, then start `feat/sleeper-basketball`
(`docs/plans/sleeper-basketball.md`). The basketball research task is
docs-only, so it can run on the football branch while it's open if the
operator wants to overlap.

## 8. Risks

- **Preset values are opinion.** They're commented as such and easy to
  override. The tests check only that each set sums to 1.0, that the shape is
  right, and that `balanced` equals today's sets.
- **A strength rating can look more precise than it is.** It is relative
  (rank-based), and it lists what it left out.
- **Rivalry notes are free text about real people,** written by the operator.
  They stay in the operator's folder. The prompt is told to treat the note as
  the operator's framing, not a fact about a manager.
