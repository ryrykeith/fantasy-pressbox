# Plan: ESPN football leagues

Written 2026-10-11 against `main` at `1250052` (fantasy-pressbox 0.1.0, 671
tests). Fantasy Pressbox covers only Sleeper today. This plan adds ESPN
fantasy football leagues without changing anything a Sleeper league does.

The tasks in Appendix A are run with `ndx work`. Nothing in this plan is
implemented yet.

## 1. Scope

**In v1**

- ESPN leagues for the current season only, public or private.
- `init`/setup and `doctor` for ESPN.
- The weekly editions: preview, recap, rankings (weekly and postseason),
  preseason rankings, transactions (trade and waiver reports), `record`,
  `grade` and `check`.
- Market values from FantasyCalc, joined on `espnId`.
- A coverage matrix in `docs/espn-data.md` saying, for every edition and every
  context fact, whether ESPN supports it, refuses it or marks it `unavailable`.

**Not in v1**

- Seasons before about 2018 (ESPN's separate `leagueHistory` endpoint).
- Guillotine editions on ESPN.
- Editions that depend on traded future picks: tank watch, future stock, and
  pick capital in rankings.
- Keeper designations.
- Matchup periods that span more than one NFL week.

All of these are refused or marked `unavailable`, with the reason. None of
them is guessed.

## 2. Decisions

All twelve were settled on 2026-10-11 by taking the recommendation.

| # | Question | Decision |
|---|---|---|
| 1 | History before about 2018 | Not in v1. Current season only; an older season is refused with the reason. |
| 2 | `.env` keys | `LEAGUE_PROVIDER=espn` (absent means `sleeper`), `ESPN_LEAGUE_ID`, `ESPN_S2`, `ESPN_SWID`, plus a generic `LEAGUE_SEASON`. `SLEEPER_LEAGUE_ID` and `SLEEPER_SEASON` keep working unchanged. Both league IDs set without `LEAGUE_PROVIDER` is refused, naming the fix. |
| 3 | Test league | **None for now.** League-view shapes are best guesses from cited sources (§4). |
| 4 | Live checks of public endpoints | Only when the operator asks. The task stays blocked until then (Appendix A, task 2.1). |
| 5 | Boundary as its own PR | Yes. It is a pure refactor with no ESPN code, merged first. Then `feat/espn-football` is cut fresh from `main`. Two branches, never stacked. |
| 6 | Layout | `src/sleeper/` and `src/espn/` side by side, the way `src/fantasycalc/` sits, plus `src/providers.mjs` as the only module that imports either. |
| 7 | Saved history | Raw provider responses are still saved, tagged with `provider`; an untagged bundle reads as Sleeper. They are normalized on read by the provider's `normalizeWeek`. |
| 8 | ESPN keeper and dynasty leagues | A declared `dynasty` is accepted. Editions that need traded future picks refuse on ESPN. A keeper league is `redraft` for weights and FantasyCalc, with an `unavailable` entry saying keeper designations are not covered. No `keeper` format type is added. |
| 9 | Guillotine on ESPN | Refused in v1, even when declared. |
| 10 | Where posts go | A generic `POST_MAX_LENGTH`; `SLEEPER_POST_MAX_LENGTH` is still read. Prompts say "league chat" rather than naming Sleeper. ESPN's message-board limit is unknown, so no ESPN-specific limit is invented. |
| 11 | Manager names | Only the ESPN member's `displayName`, never `firstName`/`lastName`. |
| 12 | Matchup periods over more than one NFL week | Preview and recap refuse such a week, with the reason, rather than splitting it. |

## 3. Working without a test league

There is no ESPN league to check against, so every league-view shape in this
plan is a **best guess**. That is acceptable only if a wrong guess fails
loudly instead of turning into a wrong fact. Four rules apply.

1. **Every ESPN fact is labelled.** `docs/espn-data.md` marks each endpoint,
   field and code table as one of:
   - *verified*: says when and how it was checked;
   - *operator-checked*: from §4's list, checked by the operator on 2026-10-11;
   - *assumed*: names the cited source it came from.

   A fact with no source is not written down.
2. **Shape guards.** `src/espn/shape.mjs` checks every field the normalizer
   reads.
   - A missing field or a wrong type throws `EspnShapeError`. The error names
     the view, the field path and `docs/espn-data.md`.
   - A missing number never defaults to 0. A missing list never defaults to
     empty, unless the doc says ESPN omits it when empty.
   - A numeric code the tables don't know (slot, position, pro team, stat) is
     refused, never skipped.
3. **ESPN support is labelled experimental.** README, `doctor` and setup say
   that ESPN support is built from public descriptions of an unofficial API
   and has not yet been checked against a live league.
4. **Fixtures say where their shape came from.** Each hand-built ESPN fixture
   opens with a comment naming the source of its shape and "unverified". It
   uses the invented cast from `tests/fixtures/mock-dynasty-league.mjs`.

When a test league exists, task 2.2 checks the guesses. Shapes that turn out
wrong are fixed in the shape guards, normalizer and fixtures. Nothing
downstream should need to change, because downstream reads only the
normalized shapes.

## 4. What is known about ESPN's API

**Operator-checked on 2026-10-11** (not re-checked in this session):

| Fact | How |
|---|---|
| Host `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/` | Requests made by the operator |
| `seasons/<year>` needs no login and carries `currentScoringPeriod` | Same |
| `seasons/<year>/players?view=players_wl` needs no login and takes an `x-fantasy-filter` header. Players have `id`, `defaultPositionId`, `eligibleSlots`, `proTeamId` | Same |
| A private league's `mSettings` returns 401 ("You are not authorized to view this League."); a public league works without cookies | Same |
| The API echoes the requesting origin, so a browser can read public leagues | Same |
| FantasyCalc entries carry `espnId` beside `sleeperId` | Same, on a known player |

**Assumed** (widely reported; to be cited in `docs/espn-data.md`, checked
by task 2.2):

- League views `mSettings`, `mTeam`, `mRoster`, `mMatchup`, `mMatchupScore`,
  `mBoxscore`, `mTransactions2`, `mDraftDetail`; `proTeamSchedules_wl` on the
  season endpoint. Several `view=` parameters combine in one request.
  `scoringPeriodId` selects a week.
- Lineup slots, positions, pro teams and scoring stats are numeric IDs.
- Private leagues need the `espn_s2` and `SWID` cookies.
- No trading of future draft picks. No taxi squad. No guillotine format.
  Keeper leagues exist.
- Waivers are FAAB or rolling order. What a transaction record holds in each
  case is unknown.
- Scoring periods (NFL weeks) and matchup periods can differ, especially in
  the playoffs.
- A "last completed week" equivalent to Sleeper's `last_scored_leg`, which the
  settled-snapshot rule needs. If none exists, a week counts as settled when
  ESPN's current scoring period is past it (assumed; see risk R6).

**Candidate sources for citations.** Community clients for this API, such as
the `espn-api` Python package and the `espn-fantasy-football-api` JavaScript
package. A task cites the specific file it took a fact or table from. If a
source cannot be read, the fact is recorded as open, never filled in from
memory.

**Public checks that need no league** (task 2.1, run only when the operator
asks; prints shapes and key names only):
- the season endpoint's keys;
- `players_wl` fields, including whether ESPN gives an age or a birth date;
- `proTeamSchedules_wl`, for the pro team ID → abbreviation table and bye
  weeks, cross-checked against `config/bye-weeks.<season>.yml`;
- what share of FantasyCalc's priced players carry an `espnId`;
- the CORS headers.

## 5. Sleeper coupling today

What has to move behind the boundary. Line numbers are at `1250052`.

**Direct imports of `src/sleeper/` from outside it**
- `src/analysis/week.mjs:9`: `normalizePlayer`, `pairMatchups`
- `src/analysis/faab.mjs:33`: `normalizePlayer`, `waiverBidsFor`
- `src/analysis/transactions.mjs:26`: `normalizePlayer`
- `src/cli.mjs:44`: `normalizeTransactions` (:653), `normalizeFutureDraftCapital` (:600)
- `setup.mjs:45-46`: `createClient`, `normalizeLeague` (:253, :259)
- `src/pipeline.mjs:8-16`: the client and six normalizer functions

**Raw Sleeper fields read outside `src/sleeper/`**
- **Saved weeks are raw Sleeper data and are parsed again as Sleeper.**
  - `captureWeek` saves them (`pipeline.mjs:432`; `store.mjs:10` calls them
    "exactly what Sleeper returned").
  - The readers: `readTransactions` (:186-207), `readRosterWindow` (:360),
    `readFaabMarket` (:169) and `readSettledWeek` (:404).
  - Through `readFaabMarket`: `releasedPool` (`faab.mjs:86, :99`) and
    `weekBids` (`faab.mjs:179-182`).
- **Matchup fields:** `week.mjs:18-20` (`players_points`, `starters`,
  `starters_points`), the empty-slot marker `'0'` (:28), `roster_id` (:130,
  :139).
- **The raw player dictionary**, passed everywhere as `players`
  (`pipeline.mjs:47`):
  - `promptContext.mjs:128` `describePlayer` duplicates `normalizePlayer`
    (used at :163, :440, :554, :691, :736);
  - `rosterWindow.mjs:95, :98`;
  - `byeExposure.mjs:170`, where `team` is a Sleeper abbreviation.
- **Raw traded picks** (`roster_id`, `owner_id`): from `openLeague` (:63) into
  `readDraftOrder` and `readPickCapital` (:311, :334, :343) and `cli.mjs:600`.
- **`league.status`** passes Sleeper's own `pre_draft`/`drafting` values
  through (`normalize.mjs:242, :372`).

**Sleeper vocabulary and assumptions**
- **Lineup slot names:** `lineup.mjs:9-24`, `BENCH_SLOTS`, and the superflex
  check at `normalize.mjs:183`. These names become the shared vocabulary.
- **Scoring:** `SLEEPER_DEFAULT_SCORING`. `nonDefault[].key` holds raw Sleeper
  keys, and `scoringReport.mjs:62` prints "Sleeper settings this tool does not
  use".
- **Playoff seeding** assumes Sleeper's default of wins, then points for
  (`standings.mjs:4`, `playoffField.mjs:6`).
- **Team identity:** an unnamed team falls back to the manager's username
  (`teamIdentity.mjs:43-46`).
- **Week lookup:** the `client.state()` fallback and "Sleeper (…)" source
  labels (`pipeline.mjs:85-94`); `lastScoredWeek` in `settled` and
  `isSettledSnapshot` (:391, :518).

**Config, setup and wording**
- `config.mjs:457, :476-477`
- `cli.mjs:217, :388, :419`
- `init.mjs:26` (`\d{6,}` league ID match), `init.mjs:78`
- `setup.mjs:380-402, :520-532`
- The player cache path, `client.mjs:82`
- FantasyCalc joins on `sleeperId` (`fantasycalc/client.mjs:129`)
- Posts described as going to "Sleeper": `validate.mjs`, `prompts/system.md:57, :66`

**Tests:** 21 test files import `src/sleeper/`, and there is one fake-fetch
harness, `tests/fixtures/fake-sleeper-fetch.mjs`.

**Existing alias tables:** `scripts/fetch-bye-weeks.mjs:35`
(`ESPN_TO_SLEEPER`, `WSH`→`WAS`) and `:45` (`STALE_ALIASES`, `OAK`→`LV`).

## 6. Provider boundary design

**Layout.**
- `src/sleeper/` and `src/espn/` each hold a client, a normalizer and a
  `provider.mjs`.
- `src/providers.mjs` is the registry, and the only module that imports
  either provider.
- Provider-neutral helpers that the normalizers now hold move to
  `src/league/`: pairing on a key, `isFuturePick`, `futurePickOwnership`, and
  the transaction `sides` builder.

**Interface.** Each provider's `provider.mjs` exports:

```
{
  name,                       // 'sleeper' | 'espn'
  displayName,                // 'Sleeper' | 'ESPN'
  experimental,               // true for ESPN until task 2.2
  capabilities: {
    futurePicks,              // traded future draft picks exist
    taxi,                     // a taxi squad exists
    guillotine,               // may be declared guillotine
    lastScoredWeek,           // reports the last fully scored week
  },
  playerIdSpace,              // 'sleeper' | 'espn' — the FantasyCalc join key
  fromConfig(config),         // → instance; refuses missing keys, naming the fix
  lookupLeague({ id, season, secrets }),  // → League, for setup's confirmation
  // instance methods:
  openLeague({ refreshPlayers }),  // → { league, teams, players, draftCapital }
  fetchWeek(week),            // → raw bundle, saved as is (tagged with provider)
  currentWeek(),              // → { week, source }, resolveWeek's fallback
  normalizeWeek(rawBundle, { league, teams, players }),  // → WeekData; pure
}
```

**The shared shapes.** Analysis, the prompt context and the CLI read only
these.

- **League:** today's `normalizeLeague` output, plus:
  - `provider`;
  - `draftStatus` (`pre_draft` | `drafting` | `complete`) in place of raw
    `status`;
  - `startingSlots` in the shared slot vocabulary;
  - `format.scoring` in today's shape. `nonDefault[]` gains a readable
    `label` beside the provider-specific `key`.
- **Team:** today's shape. `rosterId` holds the provider's team ID, and
  `manager` is a display name only.
- **Player:** `players[id] = { id, name, position, team, age, yearsExp,
  injuryStatus, status }`, built once per run.
  - `team` is in the bye-week table's abbreviations.
  - A field the provider does not supply is absent, not null.
  - The Sleeper output must match today's `normalizePlayer` exactly.
- **WeekData:**
  - `rosters`: `[{ rosterId, playerIds, starterIds (lined up with
    startingSlots; null for an empty slot), starterPoints, playerPoints,
    points, pairingKey }]`;
  - `transactions`: today's `normalizeTransactions` shape;
  - `bids`: `[{ playerId, rosterId, week, amount, outcome }]`.
- **DraftCapital:** `{ tradedPicks: [{ season, round, originalRosterId,
  ownerRosterId, previousOwnerRosterId }] }`, or `null` when the provider has
  no future picks.

**Saved history.** `fetchWeek` output is saved under `data/raw/` with
`provider` added. The four readers call `provider.normalizeWeek(bundle)`.
- An untagged bundle is read as Sleeper, so existing league folders need no
  migration.
- A bundle tagged with a different provider than the league's is refused,
  naming both.
- Settled snapshots are not rewritten, and `isSettledSnapshot` keeps its rule.

**Capability gates.** `src/format.mjs`'s `hasFutureDraftCapital` and
`hasEliminations` (and their siblings) take the provider's capabilities as
well as the format. An edition gated on them refuses with a reason that names
the provider. A context fact gated on them becomes an `unavailable` entry.

**Guard.** A test fails when:
- anything outside `src/sleeper/`, `src/espn/` and `src/providers.mjs` imports
  from either provider directory;
- any raw Sleeper field name (`roster_id`, `owner_id`, `players_points`,
  `starters_points`, `fpts_decimal`, `waiver_bid`, `matchup_id`, …) appears
  outside `src/sleeper/`;
- any `src/espn/` field name appears outside `src/espn/`.

## 7. `.env` and config

| Key | Meaning | Notes |
|---|---|---|
| `LEAGUE_PROVIDER` | `sleeper` or `espn` | Absent means `sleeper`. A misspelling is refused at load, listing the valid values. |
| `SLEEPER_LEAGUE_ID` | unchanged | |
| `ESPN_LEAGUE_ID` | the numeric ESPN league ID | Setup reads it out of a pasted URL's `leagueId=`. |
| `ESPN_S2`, `ESPN_SWID` | ESPN session cookies, private leagues only | Passwords: see below. |
| `LEAGUE_SEASON` | season override | `SLEEPER_SEASON` is still read; `LEAGUE_SEASON` wins when both are set. |
| `POST_MAX_LENGTH` | longest single post | `SLEEPER_POST_MAX_LENGTH` is still read; `POST_MAX_LENGTH` wins when both are set. |

Both league IDs set without `LEAGUE_PROVIDER` is refused, naming the key to
add.

`loadConfig` returns `config.league = { provider, id, season, secrets }`.
`config.leagueId` stays as an alias until every reader has moved.

**ESPN cookies are passwords.**
- They are read from `.env` into `config.league.secrets`, never into
  `process.env`.
- They are sent only as a `Cookie` header to the ESPN host.
- They are never printed, logged, put into an error message, saved in a raw
  bundle or written under `data/`.
- `doctor` and setup show them masked, using setup's existing `maskSecret`.
- A test runs a full ESPN capture and edition on fixtures with known cookie
  values, then searches `data/`, `output/`, stdout and stderr for those values.

## 8. Coverage matrix (draft)

The final version lives in `docs/espn-data.md` (task 5.3). Every row on ESPN
depends on the §4 assumptions until task 2.2 verifies them.

**Superseded (2026-10-13)** by the coverage matrix in `docs/espn-data.md`,
which `tests/espn-coverage-matrix.test.mjs` keeps matching the code. This
draft is kept as written. Where it differs from the code, the final matrix is
right:
- No command builds `postseason`: `rankings` builds the weekly edition.
- Market values are `unavailable` on ESPN until task 6.1 adds the `espnId` join.
- Manager names are `unavailable`, not `displayName` (open question 27).

**Editions and commands**

| Edition or command | ESPN |
|---|---|
| `preview` | Supported. Refused for a matchup period spanning more than one NFL week (decision 12). |
| `recap` | Supported. Same refusal. |
| `rankings` (weekly, postseason) | Supported. In a declared-dynasty ESPN league the `future_draft_capital` factor gets an `unavailable` entry (no traded picks). |
| `preseason-rankings` | Supported, if ESPN reports rosters before week 1 (assumed). |
| `transactions` (trade and waiver reports) | Supported. Picks in trades don't exist. Bid facts only in a FAAB league; under rolling waivers they are `unavailable`. |
| `record`, `grade`, `check` | Supported. They read saved files and are provider-neutral. |
| `fetch`, `doctor`, `init` | Supported. |
| `tank-watch`, `future-stock` | **Refused**: ESPN has no traded future picks (assumed). |
| `survival-preview`, `chop-recap`, `survival-rankings` | **Refused**: guillotine is not supported on ESPN in v1 (decision 9). |

**Context facts**

| Fact | ESPN |
|---|---|
| `teams` record, points for and against | Supported (assumed from `mTeam`) |
| `teams` season potential points | **`unavailable`**: Sleeper reports `ppts`; ESPN is not known to |
| `thisWeek`: scores, lineup efficiency, awards | Supported, if per-player points include the bench (assumed from `mBoxscore`) |
| `upcomingMatchups`, `unpairedTeams` | Supported (assumed from `mMatchup`) |
| `standings`, projected playoff field | Supported when the league uses wins-then-points-for seeding. Otherwise the projected field is `unavailable` (seeding setting assumed from `mSettings`) |
| Player injury status | Supported, if present (assumed) |
| Player age; `rosterWindow` | Age `unavailable` if ESPN gives neither age nor birth date (task 2.1 checks). `rosterWindow` is dynasty-only and needs age. |
| Taxi | `unavailable`: no taxi squad (assumed) |
| Reserve | From the IR slot (assumed) |
| `draftCapital`, `futureDraftCapital`, `draftProjection`, `tankWatch`, `prospectBoard` | `unavailable` or refused: no traded future picks |
| `marketValues` | Supported via `espnId`. An unmatched player is unpriced. |
| `trades`, `pickups`, `transactions` | Supported (assumed from `mTransactions2`) |
| `previousWeek`, `previousRankings`, `previousPredictions` | Supported (from the store, provider-neutral) |
| `byeExposure`, `dangerBoard`, `faabMarket`, `eliminationHistory`, `survivorCount` | Absent: guillotine only |
| Scoring profile | Supported through the stat-ID table. Unmapped stats are listed under `notModelled`. |
| Keeper designations | `unavailable` (decision 8) |
| Manager names | `displayName` only (decision 11) |

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Unofficial, undocumented API.** Hosts, views and fields can change without notice. | One client module; shape guards that fail loudly and name the field; `docs/espn-data.md` dates every fact; ESPN labelled experimental. |
| R2 | **Best-guess shapes are wrong** (no test league). | §3's rules. Wrong guesses become `EspnShapeError`, not wrong facts. Task 2.2 checks them once a league exists. |
| R3 | **Breaking changes mid-season.** | Raw responses are saved per week, so a normalizer fix applies to past weeks on read. Settled snapshots are never rewritten. |
| R4 | **Rate limits** (unknown). | Combine views per request; cache the player list daily as Sleeper's is; back off on 429 as the Sleeper client does; no request loops per player. |
| R5 | **Cookie expiry or revocation.** `espn_s2` expires and the lifetime is unknown. | A 401 on a league that worked before is explained by `doctor` and the CLI: refresh `ESPN_S2` and `ESPN_SWID`, with the setup instructions. |
| R6 | **No "last scored week".** Settling depends on it. | Use the reported equivalent if there is one. Otherwise a week is settled when ESPN's current scoring period is past it, and `docs/espn-data.md` says so. Never settle a week that is still being played. |
| R7 | **Cookie leakage** into logs, errors, `data/` or commits. | Config-only secrets; the leak test in §7; `.env` is already gitignored. |
| R8 | **Real league data entering the repo.** | Fixtures written by hand with the invented cast; never save a real response in the repo; live checks print shapes only. |
| R9 | **Team abbreviation drift** (`WSH`/`WAS`, `OAK`/`LV`, and any others). | One alias module with a test; an unknown code is refused, as `byeWeekFor` already does. |
| R10 | **Refactor regressions for Sleeper.** | The boundary is its own PR. The 671 tests pass with only import-path changes, and byte-identical prompt output on the fixtures is part of the acceptance. |

## 10. Delivery

1. **PR 1, `feat/provider-boundary`**, cut from a freshly pulled `main`.
   Feature 1 only. No ESPN code and no change in behaviour.
2. **PR 2, `feat/espn-football`**, cut from `main` after PR 1 merges.
   Features 3 to 7.
3. Feature 2's tasks are blocked until the operator asks, so `ndx work`
   doesn't pick them up.

Each PR description lists its user-facing changes for the release notes.
`CHANGELOG.md` is only touched at release time.

---

## Appendix A: proposed PRD epic

**Epic: ESPN football leagues.** Adds ESPN fantasy football leagues next to
Sleeper. A provider boundary lands first and changes nothing a Sleeper league
does. ESPN support is built from cited public descriptions of an unofficial
API, labelled experimental, and refuses loudly when a response doesn't match
its documented shape. Plan: `docs/plans/espn-football.md`.

Model key: **O** = `claude-opus-5-5`, **S** = `claude-sonnet-5-5`.

Every task inherits these rules. Each task description repeats them in
short, because a task must stand alone:
- never invent a fact;
- no real league data in code, tests, fixtures, docs or commits;
- ESPN cookies are passwords;
- the existing 671 tests pass with only import-path changes.

### Feature 1: Provider boundary (Sleeper only, PR 1)

#### 1.1 Normalized player dictionary (O)

Today the raw Sleeper player dictionary is passed through the pipeline as
`players` and read by raw field name outside `src/sleeper/`:
- `src/promptContext.mjs:128` `describePlayer` duplicates `normalizePlayer`;
- `src/analysis/rosterWindow.mjs:95, :98`;
- `src/analysis/byeExposure.mjs:170`;
- `src/analysis/week.mjs`, `faab.mjs` and `transactions.mjs`, through an
  imported `normalizePlayer`.

Change `openLeague` (`src/pipeline.mjs`) to build `players[id] = { id, name,
position, team, age, yearsExp, injuryStatus, status }` once, using
`normalizePlayer`. Every consumer reads that record. `describePlayer` takes a
normalized player. Analysis modules stop importing `normalizePlayer`. A field
the provider does not supply is absent, not null; for Sleeper every field is
present as today.

Acceptance:
- No module outside `src/sleeper/` reads `full_name`, `first_name`,
  `last_name`, `injury_status` or `years_exp`.
- `analysis/week.mjs`, `faab.mjs` and `transactions.mjs` no longer import
  `normalizePlayer`.
- Prompt context output for every edition is byte-identical on the existing
  fixtures. Add a test that pins one edition's context before and after.
- `describePlayer`'s output is unchanged, including the `FA` fallback and
  the injury suffix.
- The 671 existing tests pass, with only import-path changes.

#### 1.2 Normalized week data and the readers of saved weeks (O)

Analysis reads raw Sleeper matchup and transaction fields:
- `week.mjs:18-28, :130, :139`;
- `faab.mjs:86, :99, :179-182`;
- `pipeline.mjs` `readTransactions`, `readRosterWindow`, `readFaabMarket` and
  `readSettledWeek`, which re-parse the raw bundles saved under `data/raw/`.

Add `normalizeWeek(rawBundle, { league, teams, players })` to
`src/sleeper/normalize.mjs`, returning `WeekData`:
- `rosters`: `[{ rosterId, playerIds, starterIds (null for an empty slot),
  starterPoints, playerPoints, points, pairingKey }]`;
- `transactions`: today's `normalizeTransactions` shape;
- `bids`: `[{ playerId, rosterId, week, amount, outcome }]`.

Move pairing on `pairingKey` out of `src/sleeper/` into
`src/league/pairing.mjs`. `analyzeWeek`, `releasedPool`, `weekBids` and the
four readers consume `WeekData`.

Raw bundles are still saved exactly as fetched. Do not rewrite saved data or
settled snapshots.

Acceptance:
- No module outside `src/sleeper/` reads `roster_id`, `matchup_id`,
  `players_points`, `starters_points`, `waiver_bid`, `adds`, `drops` or the
  `'0'` empty-slot marker.
- `analyzeWeek` output is unchanged on the existing fixtures, including
  `unpairedRosterIds` and the guillotine no-pairing path.
- A league folder whose `data/raw/` was written before this change reads
  exactly as before. Test this with a fixture bundle that has no `provider`
  field.
- The 671 existing tests pass, with only import-path changes.

#### 1.3 Normalized draft capital and draft status (S)

Raw Sleeper traded picks (`roster_id`, `owner_id`, `previous_owner_id`) flow
from `openLeague` into:
- `readDraftOrder` and `readPickCapital` (`src/pipeline.mjs:311-343`);
- `src/cli.mjs:600`.

`isFuturePick` compares Sleeper's raw `league.status` values. Changes:
- Normalize traded picks in `src/sleeper/` to `{ season, round,
  originalRosterId, ownerRosterId, previousOwnerRosterId }`.
- `openLeague` returns `draftCapital: { tradedPicks }`.
- Add `league.draftStatus` (`pre_draft` | `drafting` | `complete`).
- Move `isFuturePick`, `currentSeasonDrafted`, `futurePickOwnership` and
  `normalizeFutureDraftCapital` to `src/league/draftCapital.mjs`, reading only
  normalized fields.

Acceptance:
- No module outside `src/sleeper/` reads `roster_id`, `owner_id` or
  `previous_owner_id` from a pick.
- Draft order, pick capital, tank watch, future stock and trade-report pick
  projections are unchanged on the existing fixtures.
- The 671 existing tests pass, with only import-path changes.

#### 1.4 Provider interface, registry and `LEAGUE_PROVIDER` (O)

Depends on 1.1 to 1.3.

Add `src/sleeper/provider.mjs`, implementing the interface in
`docs/plans/espn-football.md` §6. Add `src/providers.mjs`, a registry keyed by
name.

`loadConfig`:
- reads `LEAGUE_PROVIDER` (absent means `sleeper`; a misspelling is refused,
  listing the valid values);
- returns `config.league = { provider, id, season, secrets }`, keeping
  `config.leagueId` as an alias;
- reads `LEAGUE_SEASON` with `SLEEPER_SEASON` as a fallback;
- reads `POST_MAX_LENGTH` with `SLEEPER_POST_MAX_LENGTH` as a fallback;
- refuses both league IDs set without `LEAGUE_PROVIDER`, naming the fix.

Pipeline changes:
- `openLeague`, `captureWeek`, `resolveWeek` and `readSettledWeek` go through
  the provider.
- `resolveWeek`'s source labels come from `provider.displayName`.
- `captureWeek` saves `fetchWeek` output with `provider` added. An untagged
  bundle reads as Sleeper. A bundle tagged with another provider is refused,
  naming both.
- `hasFutureDraftCapital` and `hasEliminations` in `src/format.mjs` also take
  provider capabilities. All Sleeper capabilities are true, so nothing changes
  for Sleeper.

Acceptance:
- `src/pipeline.mjs` imports no `src/sleeper/` module.
- An existing league folder with only `SLEEPER_LEAGUE_ID` works unchanged.
- New tests cover each refusal: misspelled provider, two IDs without a
  provider, and a provider mismatch in a saved bundle. Each test asserts the
  message names the fix.
- The 671 existing tests pass, with only import-path changes.

#### 1.5 Setup, doctor and the CLI through the provider (S)

Depends on 1.4.

Today `setup.mjs:45-46` imports the Sleeper client and normalizer, and
`src/cli.mjs:44` imports `normalizeTransactions` and
`normalizeFutureDraftCapital`. Hard-coded Sleeper wording:
- `requireLeague` names `SLEEPER_LEAGUE_ID` (`cli.mjs:217`);
- doctor prints "League ID" and "Contacting Sleeper..." (`cli.mjs:388,
  :419`);
- the setup headings and "what Sleeper reports" (`init.mjs:78`).

Route all of these through the provider: `lookupLeague` for setup's check,
and `displayName` for wording. Setup still offers Sleeper only; ESPN is
added in task 4.2. Setup writes `POST_MAX_LENGTH` for new folders, and keeps
an existing `SLEEPER_POST_MAX_LENGTH` as it is.

Acceptance:
- `setup.mjs` and `src/cli.mjs` import no `src/sleeper/` module.
- Sleeper users see the same wording as before, except where it now comes
  from `displayName`.
- `tests/init.test.mjs` and the setup piping tests pass.
- The 671 existing tests pass, with only import-path changes.

#### 1.6 Boundary guard test and architecture docs (S)

Depends on 1.5.

Add `tests/provider-boundary.test.mjs`. It fails when:
- a file outside `src/sleeper/`, `src/espn/` and `src/providers.mjs` imports
  from either provider directory;
- a listed raw Sleeper field name appears in `src/` outside `src/sleeper/`.
  The list includes `roster_id`, `owner_id`, `matchup_id`, `players_points`,
  `starters_points`, `fpts_decimal`, `waiver_bid` and `last_scored_leg`.
  Comments that explain Sleeper are allowed.

Update `docs/architecture.md`:
- the pipeline diagram;
- the module map (`src/providers.mjs`, `src/league/`);
- "Domain concepts": the shared League, Team, Player, WeekData and
  DraftCapital shapes;
- "Adding another platform": the provider interface and the guard;
- the note in "Historical integrity" about provider-tagged raw bundles.

Acceptance:
- The guard test passes and fails on a deliberately planted leak; check this
  by hand, not in the committed test.
- `docs/architecture.md` no longer claims anything about Sleeper that the
  code no longer does.

### Feature 2: ESPN API facts

#### 2.1 Check the public ESPN endpoints (O) — **blocked until the operator asks**

Write `scripts/check-espn-shapes.mjs`. It requests the public endpoints in
`docs/plans/espn-football.md` §4 ("Public checks that need no league"). It
prints only key names, types, array lengths and counts, never values. It
saves nothing.

The operator runs it and the results go into `docs/espn-data.md` as
*verified* with the date. The output answers:
- whether ESPN players carry an age or a birth date;
- the pro team ID → abbreviation table from `proTeamSchedules_wl`, compared
  with `config/bye-weeks.<season>.yml` (codes only, which are public NFL
  abbreviations, not league data);
- FantasyCalc's `espnId` coverage, as a percentage.

Acceptance:
- The script prints no player names and no values, and saves nothing.
- It runs only by hand and is not part of `npm test`.
- `docs/espn-data.md` records each result with how it was checked.

#### 2.2 Check league views against a test league (O) — **blocked: no test league yet**

Once the operator has created a public (and ideally a private) ESPN test
league, extend the check script to request the league views and print shapes
only. Then:
- correct `docs/espn-data.md`, the shape guards, the fixtures and the
  normalizer wherever a guess was wrong;
- turn each *assumed* entry into *verified* or *corrected*;
- remove the experimental label only when every coverage-matrix row is
  verified.

Acceptance:
- No real response, value, name, ID or cookie is saved in the repo.
- Every corrected guess has a regression test using the invented cast.

#### 2.3 Write `docs/espn-data.md` from cited sources (O)

Modelled on `docs/sleeper-data.md`. Document:
- the host and the endpoints and views the client will use;
- authentication: public leagues, and the `espn_s2`/`SWID` cookies for
  private ones;
- how the week is worked out, including the "last scored week" question
  (plan risk R6);
- scoring period versus matchup period;
- lineups and slots, transactions and waivers (FAAB and rolling), and pro
  teams;
- the player list and its daily cache.

Label every fact as *operator-checked* (plan §4), *verified* or *assumed*.
An *assumed* fact names the source file it came from, for example a specific
file in a community ESPN client library.

Numeric code tables (lineup slot, position, pro team, scoring stat IDs) are
copied from a cited source, with the source named beside each table. If a
source can't be read, record the gap as open. **Never fill a table from
memory.**

Acceptance:
- Every table and claim has a label and a source.
- No real league data appears anywhere in the doc.
- An "Open questions" section lists every *assumed* fact that task 2.2 must
  check.

### Feature 3: ESPN client and normalizer (PR 2)

#### 3.1 One NFL team alias module (S)

Today the abbreviation aliases live in `scripts/fetch-bye-weeks.mjs:35`
(`WSH`→`WAS`) and `:45` (`OAK`→`LV`). Move them into `src/nflTeams.mjs`:
- the bye-week table's codes as the canonical set;
- ESPN-to-canonical aliases;
- stale codes.

`fetch-bye-weeks.mjs` and the ESPN normalizer both import it. An unknown
code is refused, never passed through.

Acceptance:
- One alias table, imported by both.
- A test covers `WSH`→`WAS` and `OAK`→`LV`, and an unknown code refused.
- With the network stubbed by a fixture schedule, the generator's output is
  unchanged from before the move. No live ESPN request runs in tests.

#### 3.2 ESPN code tables (S)

Depends on 2.3.

Add `src/espn/codes.mjs` with the lineup slot, position, pro team and
scoring stat ID tables, transcribed from the sources cited in
`docs/espn-data.md`.
- A comment names the source file of each table and marks it unverified.
- Slots map into the shared slot vocabulary (`QB`, `RB`, `WR`, `TE`, `FLEX`,
  `SUPER_FLEX`, `K`, `DEF`, `BN`, `IR`, …).
- Pro teams map through `src/nflTeams.mjs`.

An unknown ID throws, naming the table and the ID; it is never skipped.

Acceptance:
- Every entry traces to a cited source.
- Tests cover an unknown ID in each table.
- Nothing is filled in from memory; a gap is left out and listed in
  `docs/espn-data.md`'s open questions.

#### 3.3 ESPN fixtures and fake fetch (S)

Depends on 2.3 and 3.2.

Add `tests/fixtures/mock-espn-league.mjs`: hand-built ESPN-shaped responses
for a 12-team league, using the invented cast from
`tests/fixtures/mock-dynasty-league.mjs` (Taco Tuesday, Rebuild Szn and the
rest). It covers:
- `mSettings`, `mTeam`, `mRoster`, a week's `mMatchup` and `mBoxscore`, and
  `mTransactions2` (a trade, a FAAB claim, a free-agent add and a drop);
- the season endpoint and a small `players_wl`;
- both a public league and a private one.

Add `tests/fixtures/fake-espn-fetch.mjs`, modelled on
`fake-sleeper-fetch.mjs`. The private league answers 401 without the fixture
cookies.

Each fixture opens with a comment naming the source of its shape and
"unverified".

Acceptance:
- No real names, IDs, scores or cookies.
- Tests never touch the network.

#### 3.4 ESPN client and shape guards (S)

Depends on 1.4 and 3.3.

`src/espn/client.mjs` does HTTP only:
- the host from `docs/espn-data.md`;
- combined `view=` parameters and `scoringPeriodId`;
- the `x-fantasy-filter` header for players;
- retries and 429 backoff as in the Sleeper client;
- a daily player cache at `data/cache/players-espn-<season>.json`.

Cookies come only from config and are sent only as a `Cookie` header.
Refusals name the fix:
- 401: a private league; add `ESPN_S2` and `ESPN_SWID`, or refresh them if
  they were working before;
- 404: no such league or season.

`src/espn/shape.mjs` checks each field the normalizer reads and throws
`EspnShapeError`, naming the view, the field path and `docs/espn-data.md`.

Acceptance:
- Tests with the fake fetch cover 401, 404, 429 and a malformed response.
- Cookie values appear in no error message, log line or cached file. A test
  searches for the fixture values.
- A shape error names the field and never defaults it.

#### 3.5 ESPN league, team and player normalizer (O)

Depends on 3.4.

`src/espn/normalize.mjs` turns ESPN responses into the shared League, Team
and Player shapes from plan §6.
- **League:** `startingSlots` through the slot table, `draftStatus`, playoff
  settings, waiver type and budget, and `format`.
- **Format:**
  - `detectFormatType` reports keeper or redraft from settings, as `redraft`;
  - a declaration wins;
  - `guillotine` is refused on ESPN, naming the reason.
- **Scoring:** `format.scoring` in today's shape, from the scoring stat-ID
  table, against an ESPN defaults table copied from a cited source. Unmapped
  stats go to `notModelled`, and `nonDefault[].label` is readable.
- **Team:** `rosterId` is the ESPN team ID, `name` is the team name, and
  `manager` is the member's `displayName` only, never a first or last name.
- **Player:** canonical NFL team code. Age only if ESPN supplies it,
  otherwise absent.

Acceptance:
- Normalizing the fixtures gives the expected shared shapes.
- A test asserts no `firstName` or `lastName` value reaches a team or a
  prompt.
- A keeper league resolves to `redraft`, with a flag that task 5.1 turns into
  an `unavailable` entry.

#### 3.6 ESPN week normalizer and provider (O)

Depends on 3.5.

`normalizeWeek` turns a saved ESPN raw bundle into `WeekData`:
- rosters with starters lined up with `startingSlots`, using `null` for an
  empty slot;
- per-player and team points, and a `pairingKey` from the matchup;
- transactions in the shared `moves` and `sides` shape;
- bids only for FAAB claims.

A matchup period spanning more than one NFL week is marked so preview and
recap can refuse it (decision 12).

Implement `src/espn/provider.mjs`:
- capabilities: `futurePicks: false`, `taxi: false`, `guillotine: false`;
- `lastScoredWeek` per plan risk R6;
- `playerIdSpace: 'espn'`, `experimental: true`;
- register it in `src/providers.mjs`.

Acceptance:
- `analyzeWeek` on the ESPN fixtures produces correct games, lineup
  efficiency and awards.
- A FAAB claim, a trade and a drop come out as the Sleeper equivalents do.
- Rolling-waiver claims carry no bid.
- The boundary guard passes, with ESPN field names confined to `src/espn/`.

### Feature 4: Config, setup and doctor

#### 4.1 ESPN config keys and secrets (S)

Depends on 1.4.

`loadConfig` reads `ESPN_LEAGUE_ID`, `ESPN_S2` and `ESPN_SWID` into
`config.league` when `LEAGUE_PROVIDER=espn`. Secrets are never put in
`process.env`. An ESPN league with only one of the two cookies is refused,
naming the missing one. Add the keys to `.env.example` with comments,
including that the cookies are passwords.

Acceptance:
- Tests cover the refusals.
- The leak test (plan §7) runs a full capture and edition on fixtures and
  finds neither cookie value in `data/`, `output/`, stdout or stderr.

#### 4.2 Setup for ESPN (S)

Depends on 1.5, 3.5 and 4.1.

Setup asks Sleeper or ESPN first. For ESPN:
- accept a league URL (read `leagueId=`, plus `seasonId=` if present) or a
  bare ID, through a tested `extractEspnLeague` in `src/init.mjs`;
- ask whether the league is public or private;
- for a private league, explain how to copy `espn_s2` and `SWID` from the
  browser's cookies, and accept them through `askSecret`, shown masked;
- confirm the league against ESPN with `lookupLeague` before saving;
- show the league back, along with the experimental notice;
- offer redraft or dynasty (keeper explained as redraft); do not offer
  guillotine;
- write `LEAGUE_PROVIDER=espn` and the ESPN keys.

Re-running setup on an ESPN folder keeps the existing answers as defaults,
as it does for Sleeper.

Acceptance:
- `src/init.mjs` tests cover URL parsing.
- The setup piping test runs the public and private ESPN paths against the
  fake fetch.
- The finished folder loads with `loadConfig`.

#### 4.3 Doctor for ESPN (S)

Depends on 4.1 and 3.6.

Doctor shows:
- the provider, with the experimental notice;
- the league and season, format and scoring summary;
- cookie status, masked (present or missing, never the value).

A 401 prints: private league: add `ESPN_S2` and `ESPN_SWID` (or refresh them
if they worked before). An `EspnShapeError` prints the field and points at
`docs/espn-data.md`.

Acceptance:
- Tests cover a public league, a private league with cookies, a private
  league without cookies, and a shape error.
- No cookie value is printed.

### Feature 5: Editions and the coverage matrix

#### 5.1 Provider capability gates (O)

Depends on 3.6.

Editions refuse on ESPN, with the reason, through the capability-aware
helpers in `src/format.mjs`:
- `tank-watch` and `future-stock`: no traded future picks;
- the guillotine editions: guillotine is not supported on ESPN in v1;
- preview and recap: a matchup period spanning more than one NFL week.

The CLI runs the gate before contacting ESPN where it can, as it already does
for tank watch. Context facts the provider cannot supply become `unavailable`
entries, each telling the model what not to say:
- season potential points;
- taxi;
- keeper designations;
- bids under rolling waivers;
- the `future_draft_capital` ranking factor in a declared-dynasty ESPN
  league;
- player age when absent;
- the projected playoff field when seeding is not wins then points for.

Acceptance:
- One test per refusal and per `unavailable` entry, each asserting the
  wording names the reason.
- Sleeper output is unchanged.

#### 5.2 Weekly editions end to end on ESPN fixtures (O)

Depends on 5.1 and 4.1. Market values may be `unavailable` in these tests:
task 6.1 adds the `espnId` join.

Integration tests through the fake fetch for: `preview`, `recap`, `rankings`,
`preseason-rankings`, `transactions`, `record`, `grade` and `check` on the
ESPN fixture league.

Each test asserts the built context contains:
- no Sleeper-only fact;
- no raw ESPN field or numeric code;
- the expected `unavailable` entries.

Settled snapshots are not rewritten once the week is scored (plan risk R6).

Acceptance:
- All named editions build a prompt.
- The guard and leak tests pass.

#### 5.3 Coverage matrix in `docs/espn-data.md` (O)

Depends on 5.2.

Turn plan §8's draft into the final matrix. Every edition and every context
fact is marked supported, refused (with why) or `unavailable` (with the
instruction the model gets). Each row is labelled *verified* or *assumed*.

Add a test that lists every edition and every `unavailable` key the code can
emit for ESPN, and fails when one has no row in the matrix.

Acceptance:
- The matrix matches the code.
- The test keeps it from drifting.

### Feature 6: FantasyCalc on `espnId`

#### 6.1 Key market values by the provider's player-ID space (S)

Depends on 1.4 and 3.5.

`normalizeMarketValues` (`src/fantasycalc/client.mjs`) takes the provider's
`playerIdSpace` and keys players by `sleeperId` or `espnId`. Entries without
that ID are dropped, as today. A saved market snapshot records its
`idSpace`. A snapshot without one is read as `sleeper`, and one whose ID
space doesn't match the league is fetched again, not misread.

Acceptance:
- A test shows an ESPN player with no `espnId` entry is unpriced, never
  matched by name.
- Sleeper output and saved snapshots are unchanged.

### Feature 7: Docs and README

#### 7.1 README, `.env.example` and the final ESPN docs (S)

Depends on everything above.

- README: choosing a provider; ESPN setup, including the private-league
  cookies and that they are passwords; the experimental notice; and what ESPN
  leagues get and don't get, linking the coverage matrix.
- `.env.example`: the new keys.
- `docs/espn-data.md`: a final pass.
- `docs/architecture.md`: ESPN in the module map.
- The PR description lists the user-facing changes. No `CHANGELOG.md` edit.

Acceptance:
- A reader can set up a public or a private ESPN league from the README
  alone.
- No real league data anywhere.
