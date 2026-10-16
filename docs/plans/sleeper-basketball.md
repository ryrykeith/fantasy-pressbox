# Sleeper basketball, first flight

Status: planned 2026-10-15; deferred 2026-10-16 until the browser tool is built
for football. Owner: the operator. Ships after 0.2.0, labelled
**experimental**. Branch: `feat/sleeper-basketball`, started from main when
the work begins.

PRD epic: "Sleeper basketball, first flight". This file holds the scope and
the design constraints. The facts about Sleeper's NBA data come from the
research task (`docs/sleeper-basketball-data.md`), not from here.

## 1. Scope (owner decision 2026-10-15)

| In | Refused, naming the reason |
|---|---|
| Sleeper NBA leagues, head-to-head **points** scoring | Categories leagues |
| Redraft and dynasty | Guillotine |
| `preview`, `recap`, `rankings` (weekly) | `trade-report`, `waiver-report` |
| `record`, `grade`, `check` | `tank-watch`, `future-stock`, `five-year-plan` |
| `init`, `doctor`, `fetch` | Preseason and postseason rankings, until the research says what an NBA preseason looks like |
| | ESPN basketball |

Everything refused can be added in a later flight. The refusals go through
the existing capability gates, so the wording follows the ESPN pattern.

## 2. Rules

- **Never invent a fact.** What isn't researched and cited is `unavailable`.
  That includes games per week: if no licensed NBA schedule source is found,
  games-this-week is `unavailable`, not guessed.
- **The invented cast only.** Fixtures get invented NBA-style players and
  teams. No real league data or response is saved in the repository. The
  live check is operator-run and saves nothing.
- **Football doesn't change.** Every football test passes unchanged. The NFL
  bye table, the NFL team aliases and nflverse are gated to football.
- **Core stays browser-safe,** and new options and editions go into
  `src/options.mjs`.

## 3. Design constraints

- **Sport is a league fact.** Sleeper's league has `sport` (`nfl` or `nba`).
  It is normalized to `league.sport` (`football` or `basketball`) and detected,
  never declared, so no new `.env` key is needed. A league file carries it
  through the league. ESPN leagues are always football.
- **Capabilities depend on sport as well as provider.**
  `providerOf(league).capabilities` becomes capabilities for this provider
  and sport, and the gates refuse an edition outside section 1's scope.
- **Player dictionary:** `/players/nba` is cached separately from
  `/players/nfl`. NBA players can be eligible at several positions, and the
  lineup solver's `eligiblePositions` becomes sport-aware (PG, SG, G, SF, PF,
  F, C, UTIL and the bench and IR slots, per the research).
- **Weeks:** the research must say what an NBA matchup period is on Sleeper
  (calendar week, multi-week periods around the All-Star break, playoffs). A
  period that isn't one week is refused, as ESPN's multi-week periods are,
  until it's understood.
- **Weights:** add `weights.basketball_dynasty` and
  `weights.basketball_redraft`, with no QB factor and no superflex or TE
  premium. Presets and the strength rating apply. A strength component that
  basketball can't supply (for example, a market with no NBA values) is
  `unavailable`.
- **Prompts:** basketball has its own prompt files for the three editions, or
  sport sections inside the shared ones; the run chooses, and states why.
  Football facts (bye weeks, superflex, TE premium, NFL teams) never reach a
  basketball context.
- **Market values:** FantasyCalc NBA is used only if the research cites that
  it exists and its terms allow it. Otherwise market value is `unavailable`
  for basketball.

## 4. Order

1. Research doc (Opus, review): `docs/sleeper-basketball-data.md`, from cited
   public sources, with open questions.
2. Live check (operator-run, blocked): the public `/players/nba` and
   `/state/nba`, and one NBA league the operator chooses. Nothing is saved.
3. The sport axis and capability gates.
4. NBA fixtures, the player dictionary, the lineup solver and week data.
5. Basketball context, prompts and weights.
6. `init`, `doctor` and the league file for basketball.
7. The editions end to end on fixtures, plus a coverage matrix in the data
   doc with a test that keeps it honest.
8. README and docs: a "Basketball (first flight, experimental)" section.

## 5. Risks

- **Sleeper's NBA data is less documented than its NFL data.** The research
  doc and the shape guards carry this: an unexpected shape throws, naming the
  field.
- **Schedule density matters more in the NBA than byes do in the NFL.**
  Without a games-per-week source, previews are weaker. That is accepted for
  the first flight and said in the edition.
- **Scope creep:** the refusals in section 1 are the scope. Lifting one is a
  new task.
