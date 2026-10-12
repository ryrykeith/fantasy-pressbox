# ESPN Data

ESPN's fantasy football API is **unofficial and undocumented**. This file is
the ESPN counterpart of `docs/sleeper-data.md`, and every later ESPN task
builds against it. ESPN support is **experimental**: nothing below has been
checked against a live league, because no test league exists yet
(`docs/plans/espn-football.md` §2, decision 3).

When a response doesn't match what this file says, the client must refuse
with `EspnShapeError`, naming the view, the field path and this file. It must
never guess (plan §3).

## How to read this file

Every fact about ESPN carries one label and a source.

| Label | Meaning |
|---|---|
| **operator-checked** | Listed in `docs/plans/espn-football.md` §4 and checked by the operator on 2026-10-11 with requests they made. Not re-checked when this file was written. |
| **verified** | Checked by this project, with the date and how. |
| **assumed** | Not checked. The source is named. Each assumed fact is also listed under [Open questions](#open-questions). |
| **Unknown** | Not a fact: a question no source read so far answers. Each one is listed under [Open questions](#open-questions). |

Statements about what *this project* will do (cache paths, refusals,
fallbacks) are not ESPN facts. They are marked **decision**, with the plan
section they come from.

### What could not be read when this file was written

The plan names two community clients as citation sources: the `espn-api`
Python package and the `espn-fantasy-football-api` JavaScript package. **This
file was written (2026-10-12) in a session with no network access to either
one**: fetching their source files and web search were both unavailable. So:

- no fact here is cited to a file in either library;
- facts the plan lists as "assumed (widely reported)" are cited to the plan
  itself (`docs/plans/espn-football.md` §4), which names no source file for
  them. They are the weakest entries in this file;
- **every numeric code table is empty.** None of them has been filled from
  memory. The gaps are recorded under [Open questions](#open-questions).

Task 3.2 (`src/espn/codes.mjs`) cannot start until those tables are filled
from a source that has actually been read.

## Host

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/
```

**operator-checked** (plan §4): requests made by the operator, 2026-10-11.

## Endpoints used

| Request | What it gives | Label and source |
|---|---|---|
| `GET seasons/<year>` | Season info, including `currentScoringPeriod`. No login needed. | **operator-checked** (plan §4) |
| `GET seasons/<year>/players?view=players_wl` with an `x-fantasy-filter` header | The player list. No login needed. | **operator-checked** (plan §4) |
| `GET seasons/<year>?view=proTeamSchedules_wl` | Pro team schedules (abbreviations and byes) | **assumed**: plan §4, uncited |
| League request, `view=` one or more of the views below | League data | **assumed**: plan §4, uncited. The league URL path is **not** written down anywhere this file can cite (see Open questions). |

The operator-checked note in plan §4 says that a private league's `mSettings`
request returns 401 and a public league's works. So a league request taking
`view=mSettings` exists, but its exact path is not recorded.

### League views

All **assumed**, source: plan §4 (uncited):

| View | Expected use |
|---|---|
| `mSettings` | League settings: roster slots, scoring, playoffs, waivers |
| `mTeam` | Teams, members, records |
| `mRoster` | Rosters and lineup slots |
| `mMatchup` | Schedule and matchups |
| `mMatchupScore` | Matchup scores |
| `mBoxscore` | Per-player points for a scoring period |
| `mTransactions2` | Transactions |
| `mDraftDetail` | Draft status and picks |

Also **assumed** (plan §4, uncited):
- several `view=` parameters can be combined in one request;
- `scoringPeriodId=<n>` selects a week.

The expected use column is the plan's reading of each view's name. No field
inside any league view is documented here: none has been read from a source.

## Authentication

| Fact | Label and source |
|---|---|
| A public league works without cookies. | **operator-checked** (plan §4) |
| A private league's `mSettings` returns HTTP 401 with the message "You are not authorized to view this League." when no cookies are sent. | **operator-checked** (plan §4) |
| Private leagues are read with two cookies, `espn_s2` and `SWID`. | **assumed**: plan §4, uncited |
| How long `espn_s2` lasts before it expires is unknown. | **assumed**: plan §9, risk R5 |
| The API echoes the requesting origin in its CORS headers, so a browser can read public leagues. | **operator-checked** (plan §4) |

**decision** (plan §7): the cookies are passwords. They are read from `.env`
(`ESPN_S2`, `ESPN_SWID`) into `config.league.secrets`, never into
`process.env`. They are sent only as a `Cookie` header to the ESPN host, never
printed, logged, put in an error message, saved in a raw bundle or written
under `data/`. `doctor` and setup show them masked.

**decision** (plan Appendix A, 3.4): a 401 is explained as a private league
(add `ESPN_S2` and `ESPN_SWID`, or refresh them if they worked before). A 404
means no such league or season.

## Working out the week

| Fact | Label and source |
|---|---|
| The season endpoint carries `currentScoringPeriod`. | **operator-checked** (plan §4) |
| When `currentScoringPeriod` advances (after Monday night, after stat corrections, or at another time). | **Unknown.** No source read. Open question 18. |
| ESPN reports a "last fully scored week" equivalent to Sleeper's `last_scored_leg`. | **Unknown.** No source read says it does. Plan §4 lists it as assumed, uncited. |

**ESPN is not known to report a last fully scored week.** Until a source or
task 2.2 shows one, the rule from plan risk R6 applies:

**decision** (plan §9, R6): a week counts as settled only when ESPN's current
scoring period is past it (`currentScoringPeriod > week`). A week that is
still being played is never settled. If a reported equivalent is found, it
replaces this rule.

Whether a league view also reports a current scoring period (which could
differ from the season endpoint's) is not known. See Open questions.

## Scoring period versus matchup period

| Fact | Label and source |
|---|---|
| A *scoring period* is one NFL week. | **assumed**: plan §4, uncited |
| A *matchup period* is a fantasy head-to-head round. It can cover more than one scoring period, especially in the playoffs. | **assumed**: plan §4, uncited |

Where the mapping from matchup period to scoring periods is reported is not
known.

**decision** (plan §2, decision 12): preview and recap refuse a matchup
period that spans more than one NFL week, naming the reason, rather than
splitting it.

## Lineups and slots

| Fact | Label and source |
|---|---|
| Lineup slots are numeric IDs. | **assumed**: plan §4, uncited |
| Positions are numeric IDs. | **assumed**: plan §4, uncited |
| Players carry `defaultPositionId` and `eligibleSlots`. | **operator-checked** (plan §4), on `players_wl` |
| ESPN has no taxi squad. | **assumed**: plan §4, uncited |
| A reserve (IR) slot exists. | **assumed**: plan §8 ("Reserve: from the IR slot"), uncited |

Where a league's starting slot counts live, how a roster entry names its
slot, and how bench and IR are told apart are all **unknown**: no source
read.

**decision** (plan Appendix A, 3.2): slots map into the shared slot
vocabulary (`QB`, `RB`, `WR`, `TE`, `FLEX`, `SUPER_FLEX`, `K`, `DEF`, `BN`,
`IR`, …). An unknown ID is refused, naming the table and the ID.

### Lineup slot IDs

**Not filled.** Source to read: the `espn-api` Python package's football
constants file, or the `espn-fantasy-football-api` JavaScript package's
constants. Neither could be read on 2026-10-12. See Open questions.

| Slot ID | ESPN name | Shared slot | Source |
|---|---|---|---|
| — | — | — | not read |

### Position IDs

**Not filled.** Same sources, same gap.

| Position ID | Position | Source |
|---|---|---|
| — | — | not read |

## Scoring

| Fact | Label and source |
|---|---|
| Scoring stats are numeric IDs. | **assumed**: plan §4, uncited |

Where the league's scoring rules sit in `mSettings`, and ESPN's default
points per stat, are **unknown**: no source read.

**decision** (plan Appendix A, 3.5): `format.scoring` is built through the
stat-ID table against an ESPN defaults table copied from a cited source.
Unmapped stats go to `notModelled`.

### Scoring stat IDs

**Not filled.** Same sources, same gap.

| Stat ID | Stat | Source |
|---|---|---|
| — | — | not read |

### Default scoring

**Not filled.** No source for ESPN's default points per stat has been read.

## Transactions and waivers

| Fact | Label and source |
|---|---|
| Transactions come from the `mTransactions2` view. | **assumed**: plan §4, uncited |
| A league's waivers are either FAAB (blind bids from a budget) or a rolling waiver order. | **assumed**: plan §4, uncited |
| What a transaction record holds under FAAB, and under rolling waivers, is unknown. | **assumed**: plan §4 says so explicitly |
| ESPN has no trading of future draft picks. | **assumed**: plan §4, uncited |

None of the following is known: the transaction types and their codes, how a
pending or failed claim is told apart from an executed one, where a bid amount
appears, or where the waiver type and FAAB budget sit in `mSettings`.

**decision** (plan Appendix A, 3.6): bids are produced only for FAAB claims.
Rolling-waiver claims carry no bid, and bid facts in a rolling league are
`unavailable`. Picks never appear in an ESPN trade.

## Pro teams

| Fact | Label and source |
|---|---|
| Players carry a numeric `proTeamId`. | **operator-checked** (plan §4) |
| `proTeamSchedules_wl` on the season endpoint gives the pro team list and schedules, from which byes can be read. | **assumed**: plan §4, uncited |
| ESPN's NFL **scoreboard** (`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`, a different API from the fantasy host) spells Washington `WSH`, where this project's table uses `WAS`. | **assumed**: `scripts/fetch-bye-weeks.mjs:29-35` (comment and `ESPN_TO_SLEEPER` map) and `docs/architecture.md:690`. Not verified: that script generated `config/bye-weeks.2026.yml` (commit `e44f144`, 2026-09-23), but its map turns `WSH` into `WAS` and leaves `WAS` alone, so the committed table reads the same whichever spelling ESPN sent. |
| The fantasy API uses the same abbreviations as the scoreboard. | **Unknown.** Not checked; task 2.1 compares `proTeamSchedules_wl` with `config/bye-weeks.<season>.yml`. |

**decision** (plan Appendix A, 3.1–3.2): pro teams map through one alias
module, `src/nflTeams.mjs`, to the bye-week table's codes. An unknown code is
refused, never passed through.

### Pro team IDs

**Not filled.** Sources: the community library constants (not read on
2026-10-12), or `proTeamSchedules_wl` once task 2.1 runs. See Open
questions.

| Pro team ID | ESPN abbreviation | Canonical code | Source |
|---|---|---|---|
| — | — | — | not read |

## Players

| Fact | Label and source |
|---|---|
| `seasons/<year>/players?view=players_wl` needs no login. | **operator-checked** (plan §4) |
| It takes an `x-fantasy-filter` header. | **operator-checked** (plan §4) |
| Each player has `id`, `defaultPositionId`, `eligibleSlots` and `proTeamId`. | **operator-checked** (plan §4) |
| Players carry an injury status. | **assumed**: plan §8, uncited |
| Players carry an age or a birth date. | **Unknown.** Task 2.1 checks. |
| What `x-fantasy-filter` must contain, and whether the list is paged or capped. | **Unknown.** No source read. Open question 9. |
| ESPN's rate limits, and whether it asks for the list to be fetched at most daily, are unknown. | **assumed**: plan §9, risk R4 |

**decision** (plan Appendix A, 3.4; plan §9, R4; plan §6 `openLeague({
refreshPlayers })`): the player list is cached daily at
`data/cache/players-espn-<season>.json`, as Sleeper's is, and can be
refreshed on demand. No request is made per player.
A player field ESPN does not supply (age, for example) is absent from the
shared Player record, not null.

As with Sleeper, **a raw ESPN player ID or numeric code must never reach a
prompt.**

### Player IDs and FantasyCalc

| Fact | Label and source |
|---|---|
| FantasyCalc entries carry `espnId` beside `sleeperId`. | **operator-checked** (plan §4), on a known player |
| The share of FantasyCalc's priced players that carry an `espnId` is unknown. | Task 2.1 checks. |

**decision** (plan Appendix A, 6.1): market values join on `espnId` only. A
player with no `espnId` is unpriced, never matched by name.

## League formats

| Fact | Label and source |
|---|---|
| Keeper leagues exist on ESPN. | **assumed**: plan §4, uncited |
| ESPN has no guillotine format. | **assumed**: plan §4, uncited |
| Members have a `displayName`, plus `firstName` and `lastName`. | **assumed**: plan §2 decision 11, uncited |

**decisions** (plan §2): keeper is treated as redraft, and keeper designations
are `unavailable` (8); guillotine is refused on ESPN (9); manager names use
`displayName` only (11); seasons before about 2018 are not covered (1).

## Open questions

Each must be answered from a source that has actually been read (a named
file in a community client), or by task 2.1 (public endpoints) or task 2.2
(a test league). Until then every one is a guess the shape guards must treat
as unverified.

**Unread sources: fill before task 3.2**
1. Lineup slot ID table. Read the `espn-api` package's football constants
   file, or the `espn-fantasy-football-api` package's constants, and cite the
   file and commit.
2. Position ID table. Same.
3. Pro team ID → abbreviation table. Same, then cross-check against
   `proTeamSchedules_wl` in task 2.1.
4. Scoring stat ID table. Same.
5. ESPN's default points per stat, for the `nonDefault` comparison.
6. Transaction type codes (for example add, drop, trade, waiver claim) and
   how a record marks executed versus pending or failed.

**Endpoints (task 2.1 or a read source)**
7. The exact league URL path under the host.
8. `proTeamSchedules_wl`: that it exists on the season endpoint, and its
   shape.
9. What `x-fantasy-filter` must contain to get every rostered player, and
   whether the player list is paged or capped.
10. Whether players carry an age or a birth date.
11. Whether the fantasy API spells pro teams as the scoreboard does
    (`WSH`), and any other codes that differ from `config/bye-weeks.<season>.yml`.
12. Rate limits, and whether ESPN asks for the player list to be cached.
13. FantasyCalc's `espnId` coverage, as a percentage.

**League views (task 2.2)**
14. That `mSettings`, `mTeam`, `mRoster`, `mMatchup`, `mMatchupScore`,
    `mBoxscore`, `mTransactions2` and `mDraftDetail` exist, and what each
    returns.
15. That several `view=` parameters combine in one request.
16. That `scoringPeriodId` selects a week.
17. That private leagues are read with `espn_s2` and `SWID`, how long
    `espn_s2` lasts, and how a request fails when the cookies have expired.
18. Whether ESPN reports a last fully scored week. If not, when
    `currentScoringPeriod` advances relative to Monday night and stat
    corrections (risk R6).
19. Whether a league view reports its own current scoring period, and
    whether it can differ from the season endpoint's.
20. How a matchup period maps to scoring periods, and where that is
    reported.
21. Where starting slot counts live, how a roster entry names its slot, and
    how bench and IR are told apart.
22. Whether per-player points include the bench (needed for lineup
    efficiency).
23. Where team records and points for and against live, and whether any
    season potential points figure exists.
24. Where the waiver type (FAAB or rolling) and the FAAB budget sit, and what
    a transaction record holds under each, including where a bid appears.
25. That there is no trading of future draft picks, no taxi squad and no
    guillotine format; and how a keeper league is marked.
26. Where the playoff seeding rule sits, and its values.
27. Member fields: `displayName`, `firstName`, `lastName`, and how a team
    links to its member.
28. Draft status values in `mDraftDetail`.
29. Whether rosters are reported before week 1 (needed by
    `preseason-rankings`).
30. Player injury status: present, and its values.
