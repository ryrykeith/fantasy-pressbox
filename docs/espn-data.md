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
| **assumed** | Not checked against ESPN. The source is named: a file and line in one of the two clients below, or the plan where no client says. Each assumed fact the code depends on is also listed under [Open questions](#open-questions). |
| **Unknown** | Not a fact: a question no source read so far answers. Each one is listed under [Open questions](#open-questions). |
| **Unverified** | A claim the code's design relies on that only a test league can check (task 2.2). Treated as Unknown until then, and listed under [Open questions](#open-questions). |

Statements about what *this project* will do (cache paths, refusals,
slot mappings) are not ESPN facts. They are marked **decision**, with the plan
section they come from or the reason.

### Sources read

The two community clients the plan names were read on 2026-10-12, at these
commits. Citations below use the short names.

| Short name | Repository | Commit | Licence |
|---|---|---|---|
| **espn-api** | `cwendt94/espn-api` (Python) | `c356d1ade54760e50ac57e8f1fe30a64a560f7a0` (2026-10-09) | MIT |
| **JS client** | `mkreiser/ESPN-Fantasy-Football-API` (JavaScript) | `18b6bf2bc9344470e135102278d1b3ba7fdc36e8` (2025-01-04) | LGPL-3.0 |

A citation such as `espn-api football/league.py:360` means
`espn_api/football/league.py`, line 360, at the commit above. `JS
constants.js:7-34` means `src/constants.js` in the JS client. The code tables
below were generated from those files by reading their dict and object
literals, not retyped.

Both are third-party readings of the same unofficial API. Where they agree, an
entry is still **assumed**. Where they disagree, both readings are given and
the entry is treated as open.

**History of this file:** the first version (2026-10-12, run 95c5c76e) was
written without network access, so every table was empty. The second
(6a730ae) filled them from the sources above, but dropped the player-name
clause from espn-api's position rule, which made every team defense fail. The
review of task 3.2 caught it; [Positions](#positions) now has the full rule.

## Host

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/
```

**operator-checked** (plan §4). Both clients use it too: espn-api
`requests/constant.py:1` plus the `ffl` sport code (`:4`); JS
`client/client.js:13`.

## Endpoints used

| Request | What it gives | Label and source |
|---|---|---|
| `GET seasons/<year>` | Season info, including `currentScoringPeriod`. No login needed. | **operator-checked** (plan §4) |
| `GET seasons/<year>/players?view=players_wl`, header `x-fantasy-filter: {"filterActive":{"value":true}}` | The player list. No login needed. | Request and no login: **operator-checked**. Header value: **assumed**, espn-api `requests/espn_requests.py:163-168` |
| `GET seasons/<year>?view=proTeamSchedules_wl` | Pro teams and their games by scoring period | **assumed**: espn-api `requests/espn_requests.py:156-160`, `base_league.py:149-178` |
| `GET seasons/<year>/segments/0/leagues/<leagueId>?view=…` | A league, current seasons | **assumed**: espn-api `requests/espn_requests.py:50-53`; JS `client/client.js:76, 103, 199, 244` |
| `GET leagueHistory/<leagueId>?seasonId=<year>` | A league, seasons before 2018 | **assumed**: espn-api `requests/espn_requests.py:45-49`. Not used: plan decision 1 covers current seasons only. |

`view=` may be repeated to combine views in one request (**assumed**: espn-api
`requests/espn_requests.py:152`, five views in one request; JS
`client/client.js:77`, `view=mMatchup&view=mMatchupScore`).
`scoringPeriodId=<n>` selects a week (**assumed**: espn-api
`football/league.py:115, 359-362`; JS `client/client.js:77`).

Some requests also send an `x-fantasy-filter` header holding JSON, to narrow
a list (**assumed**: espn-api `football/league.py:364` filters the schedule to
one matchup period; `:536-537` filters transactions by type).

### League views

| View | What the clients read from it | Label and source |
|---|---|---|
| `mSettings` | `settings` (see [League settings](#league-settings)) | **assumed**: espn-api `requests/espn_requests.py:152`, `base_settings.py`, `football/settings.py` |
| `mTeam` | `teams[]`, `members[]` | **assumed**: espn-api `requests/espn_requests.py:152`, `base_league.py:106-134`, `football/team.py` |
| `mRoster` | `teams[].roster.entries[]`; with `scoringPeriodId`, that week's rosters | **assumed**: espn-api `football/league.py:113-120` |
| `mMatchup`, `mMatchupScore`, `mScoreboard` | `schedule[]`: matchups, scores and, with `scoringPeriodId`, each side's lineup for that week | **assumed**: espn-api `football/league.py:312-389`, `football/box_score.py` |
| `mStandings` | Requested alongside the others; nothing is read from it by name | **assumed**: espn-api `requests/espn_requests.py:152` |
| `mTransactions2` | `transactions[]` for one scoring period | **assumed**: espn-api `football/league.py:508-555`, `football/transaction.py` |
| `mDraftDetail` | `draftDetail` | **assumed**: espn-api `base_league.py:74-104` |
| `mBoxscore` | Not used by either client | The plan's §4 list named it; neither client requests it. Per-player weekly points come from `mMatchupScore` + `mScoreboard` instead. |

The league request also returns, at the top level, `seasonId`,
`scoringPeriodId` and `status` (**assumed**: espn-api `base_league.py:53-72`,
`:111`).

## Authentication

| Fact | Label and source |
|---|---|
| A public league works without cookies. | **operator-checked** (plan §4) |
| A private league's `mSettings` returns HTTP 401 with "You are not authorized to view this League." when no cookies are sent. | **operator-checked** (plan §4) |
| Private leagues are read with two cookies, named exactly `espn_s2` and `SWID`. | **assumed**: espn-api `base_league.py:36-38` (`{"espn_s2": …, "SWID": …}`); JS `client/client.js:38-52` |
| A 401 means the cookies are missing or wrong. espn-api first retries the other endpoint (`leagueHistory` ↔ `seasons`) once. | **assumed**: espn-api `requests/espn_requests.py:59-91` |
| A 404 means the league does not exist (for that season). | **assumed**: espn-api `requests/espn_requests.py:93-98` |
| How long `espn_s2` lasts, and how a request fails once it has expired. | **Unknown.** Open question 17. |
| The API echoes the requesting origin in its CORS headers, so a browser can read public leagues. | **operator-checked** (plan §4) |
| Username and password sign-in no longer works without a reCAPTCHA. | **assumed**: espn-api `requests/espn_requests.py`, comment above the commented-out `authentication` method. Not used: the cookies are the only way in. |

**decision** (plan §7): the cookies are passwords. They are read from `.env`
(`ESPN_S2`, `ESPN_SWID`) into `config.league.secrets`, never into
`process.env`. They are sent only as a `Cookie` header to the ESPN host, never
printed, logged, put in an error message, saved in a raw bundle or written
under `data/`. `doctor` and setup show them masked.

`doctor` on an ESPN league prints the provider (experimental), the route
(`ESPN_ROUTE`) and, on the fetch route only, whether each cookie is present or
missing. On the import route it makes no request: it reports from the saved
files, lists the addresses to save and the imported weeks, and omits the cookie
line. A 401 or an `EspnShapeError` is explained (the view and field, and that
ESPN may have changed its API) and doctor exits non-zero.

**decision** (plan Appendix A, 3.4): a 401 is explained as a private league
(add `ESPN_S2` and `ESPN_SWID`, or refresh them if they worked before). A 404
means no such league or season. The client does **not** copy espn-api's
retry against `leagueHistory`: seasons before 2018 are out of scope.

## Working out the week

| Fact | Label and source |
|---|---|
| The season endpoint carries `currentScoringPeriod`. | **operator-checked** (plan §4) |
| The league response carries a top-level `scoringPeriodId`, and `status.currentMatchupPeriod`, `status.firstScoringPeriod`, `status.finalScoringPeriod`, `status.latestScoringPeriod` and `status.previousSeasons`. | **assumed**: espn-api `base_league.py:55-61`, `football/league.py:58` |
| espn-api takes the current week as `scoringPeriodId`, capped at `status.finalScoringPeriod`. | **assumed**: espn-api `base_league.py:62-69` |
| The JS client reads `currentMatchupPeriodId` and `currentScoringPeriodId` instead. | **assumed**: JS `league/league.js` response map. Which object those sit on is not clear from the client. |
| What `status.latestScoringPeriod` means, and how it differs from `scoringPeriodId`. | **Unknown.** espn-api stores it as `nfl_week` without saying. Open question 18. |
| ESPN reports a "last fully scored week" equivalent to Sleeper's `last_scored_leg`. | **Unknown.** Neither client reads one. Open question 18. |
| When the current scoring period advances (after Monday night, after stat corrections, or at another time). | **Unknown.** Open question 18. |

**decision** (plan §9, R6): no source shows a last fully scored week, so a
week counts as settled only when the league's current scoring period is past
it (`scoringPeriodId > week`). A week still being played is never settled. If
a reported equivalent is found, it replaces this rule.

## Scoring period versus matchup period

| Fact | Label and source |
|---|---|
| A *scoring period* is one NFL week. | **assumed**: plan §4; consistent with both clients using `scoringPeriodId` per week |
| A *matchup period* is a head-to-head round. `settings.scheduleSettings.matchupPeriods` maps each matchup period ID to the list of scoring periods it covers. | **assumed**: espn-api `base_settings.py:9`, used at `football/league.py:350-356` |
| `scheduleSettings.matchupPeriodCount` is the number of regular-season matchup periods; `matchupPeriodLength` and `playoffMatchupPeriodLength` are their lengths in scoring periods. | **assumed**: espn-api `base_settings.py:8, 21-23`; JS `league/league.js` (`scheduleSettings` parse) |
| Each `schedule[]` entry carries its `matchupPeriodId`. | **assumed**: espn-api `football/league.py:326` |

**decision** (plan §2, decision 12): preview and recap refuse a matchup period
whose `matchupPeriods` list has more than one scoring period, naming the
reason, rather than splitting it.

## League settings

All **assumed**, read from `settings` in the `mSettings` view.

| Field | Meaning | Source |
|---|---|---|
| `name`, `size` | League name, team count | espn-api `base_settings.py:11, 18` |
| `scheduleSettings.playoffTeamCount` | Playoff teams | espn-api `base_settings.py:12` |
| `scheduleSettings.playoffSeedingRule` | How playoff seeds are decided. Values listed by the JS client: `UNKNOWN`, `H2H_RECORD`, `TOTAL_POINTS_SCORED`, `INTRA_DIVISION_RECORD`, `TOTAL_POINTS_AGAINST`, `RAW_STAT` | espn-api `base_settings.py:24`; JS `constants.js` `PLAYOFF_SEEDING_RULES` |
| `scheduleSettings.divisions[]` | `id`, `name` | espn-api `base_settings.py:57-59` |
| `tradeSettings.deadlineDate` | Trade deadline (absent when there is none) | espn-api `base_settings.py:14-17` |
| `draftSettings.keeperCount` | Keepers per team | espn-api `base_settings.py:13` |
| `draftSettings.isTradingEnabled` | Read by the JS client as "whether draft picks can be traded". See [Draft picks](#draft-picks). | JS `league/league.js:26, 85` |
| `draftSettings.type` | Draft type. Values listed by the JS client: `OFFLINE`, `SNAKE`, `AUTOPICK`, `SNAIL`, `AUCTION` | JS `league/league.js:83`; `constants.js` `DRAFT_TYPE` |
| `acquisitionSettings.isUsingAcquisitionBudget` | FAAB (`true`) or not | espn-api `base_settings.py:34` |
| `acquisitionSettings.acquisitionBudget`, `minimumBid` | FAAB budget and minimum bid | espn-api `base_settings.py:35-37, 47` |
| `rosterSettings.lineupSlotCounts` | Starting and bench slot counts, keyed by lineup slot ID | espn-api `football/settings.py:10-14`; JS `league/league.js` (`rosterSettings` parse) |
| `rosterSettings.positionLimits`, `rosterLocktimeType` | Per-position roster limits, lineup lock rule | JS `league/league.js` (`rosterSettings` parse) |
| `scoringSettings.scoringItems[]` | `{ statId, points, pointsOverrides }`: see [Scoring](#scoring) | espn-api `football/settings.py:9, 16-24` |
| `scoringSettings.matchupTieRule`, `playoffMatchupTieRule`, `scoringType`, `scoringEnhancementType` | Tie rules; scoring type; `WIN_BONUS_TOP_HALF` means an extra win for a top-half score | espn-api `base_settings.py:19-31` |
| `isPublic` | Whether the league is public | JS `league/league.js:60, 74`. Which object it sits on is not clear from the client. |

**decisions** (task 3.5, `src/espn/normalize.mjs`), for fields the League
reads:
- `startingSlots` lists each slot with a count above 0, except `BE` (20) and
  `IR` (21), in ascending slot ID order, one entry per count. A slot missing
  from `lineupSlotCounts` counts as 0, for bench and IR as well.
- `playoffWeekStart` is the first scoring period of matchup period
  `matchupPeriodCount + 1`, when `matchupPeriods` lists one. Otherwise it is
  null: no field reports it directly, and it is not inferred from the regular
  season's end.
- `tradeDeadline` (a week, on Sleeper) is null. `deadlineDate` is a date, so it
  goes into its own `tradeDeadlineDate`, read as epoch milliseconds (the type
  is assumed), and null when absent.
- `playoffSeeding` is the seeding rule in lower case (`H2H_RECORD` becomes
  `head_to_head_record`); `UNKNOWN` and an absent rule are null.
- `currentWeek` is `scoringPeriodId`, capped at `status.finalScoringPeriod`,
  as espn-api does. `lastScoredWeek` is the week before it, also capped (plan
  §9, R6; see [Working out the week](#working-out-the-week)).
- `seasonType`, `status`, `draftRounds`, `draftId` and `previousLeagueId` are
  null: no documented field reports them. `taxiSlots` is 0 (no taxi squad,
  above).

The meaning of `lineupSlotCounts` keys as slot IDs is an inference: espn-api
zips the counts with the slot names in key order (`football/settings.py:11-14`),
and the JS client maps each key through the slot table
(`league/league.js`, `rosterSettings` parse). The JS reading is the more
direct, and this file follows it.

## Teams and members

All **assumed**, from `teams[]` and `members[]` in `mTeam`.

| Field | Meaning | Source |
|---|---|---|
| `teams[].id` | Team ID: becomes `rosterId` | espn-api `football/team.py:9` |
| `teams[].name` | Team name. When absent, espn-api builds it from `location` + `nickname` (older seasons). | espn-api `football/team.py:11-16` |
| `teams[].abbrev`, `divisionId`, `logo` | Abbreviation, division, logo URL | espn-api `football/team.py:10, 17, 40-43` |
| `teams[].record.overall.wins`, `losses`, `ties`, `pointsFor`, `pointsAgainst`, `percentage`, `streakLength`, `streakType` | Season record | espn-api `football/team.py:19-23, 35-36`; JS `team/team.js` response map |
| `teams[].points` | Total points scored | JS `team/team.js` response map |
| `teams[].playoffSeed`, `rankCalculatedFinal`, `rankFinal` | Current seed, final rank | espn-api `football/team.py:37-38` |
| `teams[].waiverRank` | Rolling waiver position. The JS client spells it `wavierRank`; one of the two is a typo. | espn-api `football/team.py:39`; JS `team/team.js` response map |
| `teams[].transactionCounter.acquisitionBudgetSpent` | FAAB spent | espn-api `football/team.py:25-27` |
| `teams[].owners[]` | Member IDs that own the team; matched to `members[].id` | espn-api `base_league.py:120-124` |
| `teams[].roster.entries[]` | Current roster: see [Rosters and lineups](#rosters-and-lineups) | espn-api `football/team.py:60-66` |
| `members[].id` | Member ID | espn-api `base_league.py:123` |
| `teams[].owner.firstName`, `owner.lastName` | Read by the JS client as the owner's real name | JS `team/team.js:90-92` |

**Neither client reads `members[].displayName`.** The plan's decision 11
(manager names from `displayName` only) rests on a field no source shows. It is
open question 27. Until it is answered, the manager name is **unavailable**,
never built from `firstName`/`lastName`.

**decision** (plan §2, decision 11): no first or last name ever reaches a team,
a snapshot or a prompt, whichever object carries it.

**decision** (task 3.5): a Team's `manager` is the `displayName` of the
member named first in `owners[]`, when that member has one, and absent
otherwise. Member IDs are not carried into the Team (no `ownerId` or
`coOwnerIds`): they are written in the same braced form as the `SWID` cookie,
and may be one. Season potential points are null: no source shows them.
`waiverBudgetUsed` is null in a rolling-waiver league.

## Rosters and lineups

| Fact | Label and source |
|---|---|
| A roster entry (`roster.entries[]`, or a matchup side's `rosterForCurrentScoringPeriod.entries[]`) has `lineupSlotId` and `playerPoolEntry.player`. | **assumed**: espn-api `football/player.py:25, 52-56`, `football/box_player.py:25-32`; JS `team/team.js` (`roster` parse) |
| Bench players are in the same list, in lineup slot 20 (`BE`); injured reserve is slot 21 (`IR`). | **assumed**: espn-api `football/box_score.py:59` skips `BE` and `IR` when summing a projected lineup; slot table below |
| ESPN has no taxi squad. | **assumed**: plan §4. No taxi slot appears in either client's slot table. |
| `rosterSettings.lineupSlotCounts` gives the starting slots. | **assumed**: see [League settings](#league-settings) |

**decision** (operator, 2026-10-13): a player in the IR slot (21) is not a
lineup candidate, because a manager cannot start him. The week's rosters carry
`reserveIds`, and `src/analysis/week.mjs` leaves those players out of the
optimal lineup, so an IR player with no points entry (open question 32) does
not make his team's lineup efficiency unavailable, and one with points is
never put in the optimal lineup. ESPN only: Sleeper's WeekData carries no
`reserveIds` and its output is unchanged. Whether Sleeper should do the same
is answered in `docs/sleeper-data.md`: it should not.

The providers differ on purpose. ESPN IR players are left out because ESPN
publishes no potential-points figure to match. Sleeper keeps its reserve and
taxi players, because Sleeper's own `ppts` counts them and the solver matches
that figure (checked 2026-10-13).

**decision** (plan Appendix A, 3.2): lineup slots map into the shared slot
vocabulary in `src/analysis/lineup.mjs`. A slot with no mapping is refused,
naming the table and the ID. A league that starts one refuses with that
message rather than dropping the slot.

### Lineup slot IDs

**assumed**, two sources that agree on every ID (they differ only in how slot
20 and 22 are spelled): espn-api `football/constant.py:1-27` (`POSITION_MAP`,
integer keys) and JS `constants.js:7-34` (`slotCategoryIdToPositionMap`).

The shared-slot column is a **decision**, not an ESPN fact. Slots whose
meaning the sources don't spell out (`TQB`, `ER`, `Rookie`, slot 22) and
defensive slots with no counterpart in `lineup.mjs` (`DT`, `DE`, `CB`, `S`),
plus `P` and `HC`, are refused as *starting* slots rather than guessed. (A
player's position is a different question: see [Positions](#positions).)

| Slot ID | espn-api name | JS client name | Shared slot (decision) |
|---|---|---|---|
| 0 | `QB` | `QB` | `QB` |
| 1 | `TQB` | `TQB` | not mapped: refused |
| 2 | `RB` | `RB` | `RB` |
| 3 | `RB/WR` | `RB/WR` | `WRRB_FLEX` |
| 4 | `WR` | `WR` | `WR` |
| 5 | `WR/TE` | `WR/TE` | `REC_FLEX` |
| 6 | `TE` | `TE` | `TE` |
| 7 | `OP` | `OP` | `SUPER_FLEX` |
| 8 | `DT` | `DT` | not mapped: refused |
| 9 | `DE` | `DE` | not mapped: refused |
| 10 | `LB` | `LB` | `LB` |
| 11 | `DL` | `DL` | `DL` |
| 12 | `CB` | `CB` | not mapped: refused |
| 13 | `S` | `S` | not mapped: refused |
| 14 | `DB` | `DB` | `DB` |
| 15 | `DP` | `DP` | `IDP_FLEX` |
| 16 | `D/ST` | `D/ST` | `DEF` |
| 17 | `K` | `K` | `K` |
| 18 | `P` | `P` | not mapped: refused |
| 19 | `HC` | `HC` | not mapped: refused |
| 20 | `BE` | `Bench` | `BN` |
| 21 | `IR` | `IR` | `IR` |
| 22 | `(empty string)` | `INVALID_CODE` | not mapped: refused |
| 23 | `RB/WR/TE` | `RB/WR/TE` | `FLEX` |
| 24 | `ER` | `ER` | not mapped: refused |
| 25 | `Rookie` | `Rookie` | not mapped: refused |

### Positions

| Fact | Label and source |
|---|---|
| Players carry `defaultPositionId` and `eligibleSlots`. | **operator-checked** (plan §4) |
| `eligibleSlots` holds lineup slot IDs (the table above). | **assumed**: espn-api `football/player.py:17-19`; JS `player/player.js:107-112` |
| A player's position is the espn-api name of the first entry of `eligibleSlots` for which either: the slot is not 25 (`Rookie`) and its name contains no `/`; **or the player's own name contains `/`**. The second clause is what gives a team defense (named like "… D/ST") the position `D/ST`: its first eligible slot, 16, is named `D/ST`, which the first clause would skip. | **assumed**: espn-api `football/player.py:30-34`, condition `(pos != 25 and "/" not in POSITION_MAP[pos]) or "/" in self.name` |
| What `defaultPositionId` values mean. | **Unknown: the sources disagree.** The JS client decodes it through the *slot* table (`player/player.js:103-106`). espn-api never decodes it, deriving the position from `eligibleSlots` instead, and uses it only as a lookup key (`football/box_player.py:70`). Open question 2. |

**decision**: the position comes from `eligibleSlots`, by espn-api's rule
above, both clauses. It needs the player's `fullName` as well as the
slots. `defaultPositionId` is not used until open question 2 is answered.

**decision**: a position is the espn-api **slot name**, never the shared
lineup slot. The "not mapped: refused" column above is about *starting* a
slot in a league's lineup, and does not apply to positions: a player whose
position is `DT`, `CB`, `P` or `HC` is still a player with that position.
One name changes, to match the position names Sleeper and
`src/analysis/lineup.mjs` use: `D/ST` becomes `DEF`, and no other name is
rewritten. A first eligible slot that is `BE`, `IR` or the empty slot 22 means
no position was found, and is refused, naming the player ID.

**decision**: individual defensive players (IDP) are not covered in v1. A
league whose starting slots include any of `DT`, `DE`, `LB`, `DL`, `CB`, `S`,
`DB` or `DP` is refused, naming the slots. The sources don't show which IDP
positions ESPN lets fill its `DL`, `DB` and `DP` slots, so lineup efficiency
in such a league could not be computed honestly (open question 31). An IDP
player in the player list of a league that starts no IDP slot is harmless:
his position is simply his slot name.

## Scoring

| Fact | Label and source |
|---|---|
| A league's scoring rules are `settings.scoringSettings.scoringItems[]`, each `{ statId, points, pointsOverrides }`. | **assumed**: espn-api `football/settings.py:9, 16-24`; JS `league/league.js` (`scoringSettings` parse) |
| `pointsOverrides` is a map from a key to points that replace `points`. | **assumed**: both clients read it |
| What the keys of `pointsOverrides` are. | **Unknown: the sources disagree.** espn-api reads only key `"16"` (`football/settings.py:18`), which is the D/ST slot ID. The JS client takes the first value whatever its key (`league/league.js`, `scoringSettings` parse). If the keys are lineup slot IDs, a TE premium would be an override on stat 53 under key `"6"`. Open question 5. |
| A stat appears in `scoringItems` only when the league scores it. | **Unknown.** Open question 5. |
| ESPN's default points per stat. | **Unknown.** Neither client carries a defaults table. Open question 5. |

**decision** (plan Appendix A, 3.5): `format.scoring` is built from
`scoringItems`:
- reception base rate: stat 53 (`REC`, "Each reception");
- passing touchdown: stat 4 (`PTD`);
- passing yards: stat 3 (`PY`) as points per yard. A league that scores
  passing yards in steps (stats 5-10, every 5 to 100 yards) is converted to
  points per yard only if exactly one of them is set; otherwise the passing
  yard rate is `null` and the item goes to `notModelled`;
- interceptions thrown: stat 20 (`INTT`);
- a positional reception bonus only from a `pointsOverrides` entry, and only
  once open question 5 says what its keys are. Until then `premiumPositions` is
  empty and an override on stat 53 goes to `notModelled`, so `doctor` lists it.

With no ESPN defaults table, `nonDefault` cannot be computed. It lists every
scored item, and `isDefault` is `false`, with a note saying so: the safe
direction described in `docs/architecture.md` ("Scoring profile").

**decisions** (task 3.5, `deriveEspnScoringProfile`):
- each `nonDefault` entry is `{ key, label, value, default: null, note }`;
  `key` is the stat's abbreviation below (`REC`) and `label` its label;
- a stat the league does not list is `null` in the profile, never 0 (whether
  an unlisted stat is unscored is open question 5); a reception base of `null`
  has the tier `unknown`;
- a stat ID missing from the table below is listed in `notModelled` as
  `STAT_<id>`, not dropped;
- every `pointsOverrides` entry, on any stat, is listed in `nonDefault` and
  `notModelled` as `<abbr>[override <key>]`;
- a stat listed twice in `scoringItems` is refused.

### Scoring stat IDs

**assumed**: espn-api `football/constant.py:255-491`
(`SETTINGS_SCORING_FORMAT_MAP`), which labels the IDs as they appear in a
league's scoring settings. The JS key column is the JS client's
`constants.js:461-661` (`scoringItemToId`), shown as a cross-check.

They disagree at 56 and 57. espn-api says 100-199 and 200+ yard receiving
games; the JS client says 40+ and 50+ yard receiving touchdowns, but its object
also gives that key to 45 and 46 (`constants.js:517, 531`), so the JS entry is
a duplicate key and this file follows espn-api. espn-api's separate
`PLAYER_STATS_MAP` (`football/constant.py:94-253`) names the stats in a
player's weekly breakdown and is not needed here.

| Stat ID | Abbr | Label (espn-api) | JS client key |
|---|---|---|---|
| 0 | `PA` | Each Pass Attempted | `passingAttempts` |
| 1 | `PC` | Each Pass Completed | `passingCompletions` |
| 2 | `INC` | Each Incomplete Pass | `passingIncompletions` |
| 3 | `PY` | Passing Yards | `passingYards` |
| 4 | `PTD` | TD Pass | `passingTouchdowns` |
| 5 | `PY5` | Every 5 passing yards | `passingYardsPer5Yards` |
| 6 | `PY10` | Every 10 passing yards | `passingYardsPer10Yards` |
| 7 | `PY20` | Every 20 passing yards | `passingYardsPer20Yards` |
| 8 | `PY25` | Every 25 passing yards | `passingYardsPer25Yards` |
| 9 | `PY50` | Every 50 passing yards | `passingYardsPer50Yards` |
| 10 | `PY100` | Every 100 passing yards | `passingYardsPer100Yards` |
| 11 | `PC5` | Every 5 pass completions | `passingCompletionsPer5Completions` |
| 12 | `PC10` | Every 10 pass completions | `passingCompletionsPer10Completions` |
| 13 | `IP5` | Every 5 pass incompletions | `passingIncompletionsPer5Incompletions` |
| 14 | `IP10` | Every 10 pass incompletions | `passingIncompletionsPer10Incompletions` |
| 15 | `PTD40` | 40+ yard TD pass bonus | `passingTouchdowns40Plus` |
| 16 | `PTD50` | 50+ yard TD pass bonus | `passingTouchdowns50Plus` |
| 17 | `P300` | 300-399 yard passing game | `passingYards300To399` |
| 18 | `P400` | 400+ yard passing game | `passingYards400Plus` |
| 19 | `2PC` | 2pt Passing Conversion | `passing2PtConversions` |
| 20 | `INTT` | Interceptions Thrown | `passingInterceptions` |
| 21 | `CPCT` | Passing Completion Pct | `passingCompletionPercentage` |
| 22 | `PYPG` | Passing Yards Per Game | — |
| 23 | `RA` | Rushing Attempts | `rushingAttempts` |
| 24 | `RY` | Rushing Yards | `rushingYards` |
| 25 | `RTD` | TD Rush | `rushingTouchdowns` |
| 26 | `2PR` | 2pt Rushing Conversion | `rushing2PtConversions` |
| 27 | `RY5` | Every 5 rushing yards | `rushingYardsPer5Yards` |
| 28 | `RY10` | Every 10 rushing yards | `rushingYardsPer10Yards` |
| 29 | `RY20` | Every 20 rushing yards | `rushingYardsPer20Yards` |
| 30 | `RY25` | Every 25 rushing yards | `rushingYardsPer25Yards` |
| 31 | `RY50` | Every 50 rushing yards | `rushingYardsPer50Yards` |
| 32 | `R100` | Every 100 rushing yards | `rushingYardsPer100Yards` |
| 33 | `RA5` | Every 5 rush attempts | `rushingAttemptsPer5Attempts` |
| 34 | `RA10` | Every 10 rush attempts | `rushingAttemptsPer10Attempts` |
| 35 | `RTD40` | 40+ yard TD rush bonus | `rushingTouchdowns40Plus` |
| 36 | `RTD50` | 50+ yard TD rush bonus | `rushingTouchdowns50Plus` |
| 37 | `RY100` | 100-199 yard rushing game | `rushingGame100To199Yards` |
| 38 | `RY200` | 200+ yard rushing game | `rushingGame200PlusYards` |
| 39 | `RYPA` | Rushing Yards Per Attempt | `rushingYardsPerAttempt` |
| 40 | `RYPG` | Rushing Yards Per Game | — |
| 41 | `RECS` | Receptions | — |
| 42 | `REY` | Receiving Yards | `receivingYards` |
| 43 | `RETD` | TD Reception | `receivingTouchdowns` |
| 44 | `2PRE` | 2pt Receiving Conversion | `receiving2PtConversions` |
| 45 | `RETD40` | 40+ yard TD rec bonus | — |
| 46 | `RETD50` | 50+ yard TD rec bonus | — |
| 47 | `REY5` | Every 5 receiving yards | `receivingYardsPer5Yards` |
| 48 | `REY10` | Every 10 receiving yards | `receivingYardsPer10Yards` |
| 49 | `REY20` | Every 20 receiving yards | `receivingYardsPer20Yards` |
| 50 | `REY25` | Every 25 receiving yards | `receivingYardsPer25Yards` |
| 51 | `REY50` | Every 50 receiving yards | `receivingYardsPer50Yards` |
| 52 | `RE100` | Every 100 receiving yards | `receivingYardsPer100Yards` |
| 53 | `REC` | Each reception | `receivingReceptions` |
| 54 | `REC5` | Every 5 receptions | `receptionsPer5Receptions` |
| 55 | `REC10` | Every 10 receptions | `receptionsPer10Receptions` |
| 56 | `REY100` | 100-199 yard receiving game | `receivingTouchdowns40Plus` |
| 57 | `REY200` | 200+ yard receiving game | `receivingTouchdowns50Plus` |
| 58 | `RET` | Receiving Target | `receivingTargets` |
| 59 | `YAC` | Receiving Yards After Catch | `receivingYardsAfterCatch` |
| 60 | `YPC` | Receiving Yards Per Catch | `receivingYardsPerReception` |
| 61 | `REYPG` | Receiving Yards Per Game | — |
| 62 | `PTL` | Total 2pt Conversions | — |
| 63 | `FTD` | Fumble Recovered for TD | — |
| 64 | `SKD` | Sacked | — |
| 65 | `PFUM` | Passing Fumbles | — |
| 66 | `RFUM` | Rushing Fumbles | — |
| 67 | `REFUM` | Receiving Fumbles | — |
| 68 | `FUM` | Total Fumbles | `fumbles` |
| 69 | `PFUML` | Passing Fumbles Lost | — |
| 70 | `RFUML` | Rushing Fumbles Lost | — |
| 71 | `REFUML` | Receiving Fumbles Lost | — |
| 72 | `FUML` | Total Fumbles Lost | `lostFumbles` |
| 73 | `TT` | Total Turnovers | `totalTurnovers` |
| 74 | `FG50P` | FG Made (50+ yards) | `madeFieldGoalsFrom50Plus` |
| 75 | `FGA50P` | FG Attempted (50+ yards) | `attemptedFieldGoalsFrom50Plus` |
| 76 | `FGM50P` | FG Missed (50+ yards) | `missedFieldGoalsFrom50Plus` |
| 77 | `FG40` | FG Made (40-49 yards) | `madeFieldGoalsFrom40To49` |
| 78 | `FGA40` | FG Attempted (40-49 yards) | `attemptedFieldGoalsFrom40To49` |
| 79 | `FGM40` | FG Missed (40-49 yards) | `missedFieldGoalsFrom40To49` |
| 80 | `FG0` | FG Made (0-39 yards) | `madeFieldGoalsFromUnder40` |
| 81 | `FGA0` | FG Attempted (0-39 yards) | `attemptFieldGoalsFromUnder40` |
| 82 | `FGM0` | FG Missed (0-39 yards) | `missedFieldGoalsFromUnder40` |
| 83 | `FG` | Total FG Made | `madeFieldGoals` |
| 84 | `FGA` | Total FG Attempted | `attemptedFieldGoals` |
| 85 | `FGM` | Total FG Missed | `missedFieldGoals` |
| 86 | `PAT` | Each PAT Made | `madeExtraPoints` |
| 87 | `PATA` | Each PAT Attempted | `attemptedExtraPoints` |
| 88 | `PATM` | Each PAT Missed | `missedExtraPoints` |
| 89 | `PA0` | 0 points allowed | `defensive0PointsAllowed` |
| 90 | `PA1` | 1-6 points allowed | `defensive1To6PointsAllowed` |
| 91 | `PA7` | 7-13 points allowed | `defensive7To13PointsAllowed` |
| 92 | `PA14` | 14-17 points allowed | `defensive14To17PointsAllowed` |
| 93 | `BLKKRTD` | Blocked Punt or FG return for TD | `defensiveBlockedKickForTouchdowns` |
| 94 | `DEFRETTD` | Fumble or INT Return for TD | — |
| 95 | `INT` | Each Interception | `defensiveInterceptions` |
| 96 | `FR` | Each Fumble Recovered | `defensiveFumbles` |
| 97 | `BLKK` | Blocked Punt, PAT or FG | `defensiveBlockedKicks` |
| 98 | `SF` | Each Safety | `defensiveSafeties` |
| 99 | `SK` | Each Sack | `defensiveSacks` |
| 100 | `HALFSK` | 1/2 Sack | `defensiveHalfSacks` |
| 101 | `KRTD` | Kickoff Return TD | `kickoffReturnTouchdown` |
| 102 | `PRTD` | Punt Return TD | `puntReturnTouchdown` |
| 103 | `INTTD` | Interception Return TD | `fumbleReturnTouchdown` |
| 104 | `FRTD` | Fumble Return TD | `interceptionReturnTouchdown` |
| 105 | `TRTD` | Total Return TD | `totalReturnTouchdowns` |
| 106 | `FF` | Each Fumble Forced | `defensiveForcedFumbles` |
| 107 | `TKA` | Assisted Tackles | `defensiveAssistedTackles` |
| 108 | `TKS` | Solo Tackles | `defensiveSoloTackles` |
| 109 | `TK` | Total Tackles | `defensiveTotalTackles` |
| 110 | `TK3` | Every 3 Total Tackles | `defensiveTacklesPer3Tackles` |
| 111 | `TK5` | Every 5 Total Tackles | `defensiveTacklesPer5Tackles` |
| 112 | `STF` | Stuffs | `defensiveStuffs` |
| 113 | `PD` | Passes Defensed | — |
| 114 | `KR` | Kickoff Return Yards | `kickoffReturnYards` |
| 115 | `PR` | Punt Return Yards | `puntReturnYards` |
| 116 | `KR10` | Every 10 kickoff return yards | — |
| 117 | `KR25` | Every 25 kickoff return yards | — |
| 118 | `PR10` | Every 10 punt return yards | — |
| 119 | `PR25` | Every 25 punt return yards | — |
| 120 | `PTSA` | Points Allowed | `defensivePointsAllowed` |
| 121 | `PA18` | 18-21 points allowed | `defensive18To21PointsAllowed` |
| 122 | `PA22` | 22-27 points allowed | `defensive22To27PointsAllowed` |
| 123 | `PA28` | 28-34 points allowed | `defensive28To34PointsAllowed` |
| 124 | `PA35` | 35-45 points allowed | `defensive35To45PointsAllowed` |
| 125 | `PA46` | 46+ points allowed | `defensiveOver45PointsAllowed` |
| 126 | `PAPG` | Points Allowed Per Game | — |
| 127 | `YA` | Yards Allowed | `defensiveYardsAllowed` |
| 128 | `YA100` | Less than 100 total yards allowed | `defensiveLessThan100YardsAllowed` |
| 129 | `YA199` | 100-199 total yards allowed | `defensive100To199YardsAllowed` |
| 130 | `YA299` | 200-299 total yards allowed | `defensive200To299YardsAllowed` |
| 131 | `YA349` | 300-349 total yards allowed | — |
| 132 | `YA399` | 350-399 total yards allowed | `defensive350To399YardsAllowed` |
| 133 | `YA449` | 400-449 total yards allowed | `defensive400To449YardsAllowed` |
| 134 | `YA499` | 450-499 total yards allowed | `defensive450To499YardsAllowed` |
| 135 | `YA549` | 500-549 total yards allowed | `defensive500To549YardsAllowed` |
| 136 | `YA550` | 550+ total yards allowed | `defensiveOver550YardsAllowed` |
| 137 | `YAPG` | Yards Allowed Per Game | — |
| 138 | `PT` | Net Punts | `netPunts` |
| 139 | `PTY` | Punt Yards | `puntYards` |
| 140 | `PT10` | Punts Inside the 10 | `puntsInsideThe10` |
| 141 | `PT20` | Punts Inside the 20 | `puntsInsideThe20` |
| 142 | `PTB` | Blocked Punts | — |
| 143 | `PTR` | Punts Returned | — |
| 144 | `PTRY` | Punt Return Yards | — |
| 145 | `PTTB` | Touchbacks | — |
| 146 | `PTFC` | Fair Catches | `fairCatches` |
| 147 | `PTAVG` | Punt Average | — |
| 148 | `PTA44` | Punt Average 44.0+ | — |
| 149 | `PTA42` | Punt Average 42.0-43.9 | — |
| 150 | `PTA40` | Punt Average 40.0-41.9 | — |
| 151 | `PTA38` | Punt Average 38.0-39.9 | — |
| 152 | `PTA36` | Punt Average 36.0-37.9 | — |
| 153 | `PTA34` | Punt Average 34.0-35.9 | — |
| 154 | `PTA33` | Punt Average 33.9 or less | — |
| 155 | `TW` | Team Win | `teamWin` |
| 156 | `TL` | Team Loss | `teamLoss` |
| 157 | `TIE` | Team Tie | `teamTie` |
| 158 | `PTS` | Points Scored | `teamPointsScored` |
| 159 | `PPG` | Points Scored Per Game | — |
| 160 | `MGN` | Margin of Victory | — |
| 161 | `WM25` | 25+ point Win Margin | `teamWinMargin25Plus` |
| 162 | `WM20` | 20-24 point Win Margin | `teamWinMargin20To24` |
| 163 | `WM15` | 15-19 point Win Margin | `teamWinMargin15To19` |
| 164 | `WM10` | 10-14 point Win Margin | `teamWinMargin10To14` |
| 165 | `WM5` | 5-9 point Win Margin | `teamWinMargin5To9` |
| 166 | `WM1` | 1-4 point Win Margin | `teamWinMargin1To4` |
| 167 | `LM1` | 1-4 point Loss Margin | `teamLossMargin1To4` |
| 168 | `LM5` | 5-9 point Loss Margin | `teamLossMargin5To9` |
| 169 | `LM10` | 10-14 point Loss Margin | `teamLossMargin10To14` |
| 170 | `LM15` | 15-19 point Loss Margin | `teamLossMargin15To19` |
| 171 | `LM20` | 20-24 point Loss Margin | `teamLossMargin20To24` |
| 172 | `LM25` | 25+ point Loss Margin | `teamLossMargin25Plus` |
| 173 | `MGNPG` | Margin of Victory Per Game | — |
| 174 | `WINPCT` | Winning Pct | — |
| 175 | `PTD0` | 0-9 yd TD pass bonus | — |
| 176 | `PTD10` | 10-19 yd TD pass bonus | — |
| 177 | `PTD20` | 20-29 yd TD pass bonus | — |
| 178 | `PTD30` | 30-39 yd TD pass bonus | — |
| 179 | `RTD0` | 0-9 yd TD rush bonus | — |
| 180 | `RTD10` | 10-19 yd TD rush bonus | — |
| 181 | `RTD20` | 20-29 yd TD rush bonus | — |
| 182 | `RTD30` | 30-39 yd TD rush bonus | — |
| 183 | `RETD0` | 0-9 yd TD rec bonus | — |
| 184 | `RETD10` | 10-19 yd TD rec bonus | — |
| 185 | `RETD20` | 20-29 yd TD rec bonus | — |
| 186 | `RETD30` | 30-39 yd TD rec bonus | — |
| 187 | `DPTSA` | D/ST Points Allowed | — |
| 188 | `DPA0` | D/ST 0 points allowed | — |
| 189 | `DPA1` | D/ST 1-6 points allowed | — |
| 190 | `DPA7` | D/ST 7-13 points allowed | — |
| 191 | `DPA14` | D/ST 14-17 points allowed | — |
| 192 | `DPA18` | D/ST 18-21 points allowed | — |
| 193 | `DPA22` | D/ST 22-27 points allowed | — |
| 194 | `DPA28` | D/ST 28-34 points allowed | — |
| 195 | `DPA35` | D/ST 35-45 points allowed | — |
| 196 | `DPA46` | D/ST 46+ points allowed | — |
| 197 | `DPAPG` | D/ST Points Allowed Per Game | — |
| 198 | `FG50` | FG Made (50-59 yards) | `madeFieldGoalsFrom50To59` |
| 199 | `FGA50` | FG Attempted (50-59 yards) | `attemptedFieldGoalsFrom50To59` |
| 200 | `FGM50` | FG Missed (50-59 yards) | `missedFieldGoalsFrom50To59` |
| 201 | `FG60` | FG Made (60+ yards) | `madeFieldGoalsFrom60Plus` |
| 202 | `FGA60` | FG Attempted (60+ yards) | `attemptedFieldGoalsFrom60Plus` |
| 203 | `FGM60` | FG Missed (60+ yards) | `missedFieldGoalsFrom60Plus` |
| 204 | `O2PRET` | Offensive 2pt Return | — |
| 205 | `D2PRET` | Defensive 2pt Return | — |
| 206 | `2PRET` | 2pt Return | — |
| 207 | `O1PSF` | Offensive 1pt Safety | — |
| 208 | `D1PSF` | Defensive 1pt Safety | — |
| 209 | `1PSF` | 1pt Safety | — |
| 210 | `GP` | Games Played | — |
| 211 | `PFD` | Passing First Down | — |
| 212 | `RFD` | Rushing First Down | — |
| 213 | `REFD` | Receiving First Down | — |
| 214 | `FGY` | FG Made Yards | `fieldGoalMadeYards` |
| 215 | `FGMY` | FG Missed Yards | `fieldGoalMissedYards` |
| 216 | `FGAY` | FG Attempt Yards | `fieldGoalAttemptedYards` |
| 217 | `FGY5` | Every 5 FG Made yards | `fieldGoalMadeYardsPer5Yards` |
| 218 | `FGY10` | Every 10 FG Made yards | `fieldGoalMadeYardsPer10Yards` |
| 219 | `FGY20` | Every 20 FG Made yards | `fieldGoalMadeYardsPer20Yards` |
| 220 | `FGY25` | Every 25 FG Made yards | `fieldGoalMadeYardsPer25Yards` |
| 221 | `FGY50` | Every 50 FG Made yards | `fieldGoalMadeYardsPer50Yards` |
| 222 | `FGY100` | Every 100 FG Made yards | `fieldGoalMadeYardsPer100Yards` |
| 223 | `FGMY5` | Every 5 FG Missed yards | `fieldGoalMissedYardsPer5Yards` |
| 224 | `FGMY10` | Every 10 FG Missed yards | `fieldGoalMissedYardsPer10Yards` |
| 225 | `FGMY20` | Every 20 FG Missed yards | `fieldGoalMissedYardsPer20Yards` |
| 226 | `FGMY25` | Every 25 FG Missed yards | `fieldGoalMissedYardsPer25Yards` |
| 227 | `FGMY50` | Every 50 FG Missed yards | `fieldGoalMissedYardsPer50Yards` |
| 228 | `FGMY100` | Every 100 FG Missed yards | `fieldGoalMissedYardsPer100Yards` |
| 229 | `FGAY5` | Every 5 FG Attempt yards | `fieldGoalAttemptedYardsPer5Yards` |
| 230 | `FGAY10` | Every 10 FG Attempt yards | `fieldGoalAttemptedYardsPer10Yards` |
| 231 | `FGAY20` | Every 20 FG Attempt yards | `fieldGoalAttemptedYardsPer20Yards` |
| 232 | `FGAY25` | Every 25 FG Attempt yards | `fieldGoalAttemptedYardsPer25Yards` |
| 233 | `FGAY50` | Every 50 FG Attempt yards | `fieldGoalAttemptedYardsPer50Yards` |
| 234 | `FGAY100` | Every 100 FG Attempt yards | `fieldGoalAttemptedYardsPer100Yards` |

## Matchups and weekly scores

All **assumed**.

| Fact | Source |
|---|---|
| `schedule[]` lists every matchup of the season, each with `matchupPeriodId`, `home` and `away`, `winner` and `playoffTierType`. | espn-api `football/league.py:322-327`, `football/team.py:68-91`, `football/matchup.py` |
| A side has `teamId` and `totalPoints`. While games are live it also has `totalPointsLive` and `totalProjectedPointsLive`. | espn-api `football/box_score.py:76-82`, `football/matchup.py:21-28` |
| A matchup with no `away` side is a bye. | espn-api `football/box_score.py:73-74`, `football/team.py:72-86` |
| `winner` is `HOME`, `AWAY`, `TIE` or `UNDECIDED`. | espn-api `football/team.py:93-101`; JS `constants.js` `WINNING_TEAM` |
| `playoffTierType` is `NONE` for a regular-season matchup. | espn-api `football/box_score.py:16-17` |
| With `view=mMatchupScore&view=mScoreboard&scoringPeriodId=<n>`, each side carries `rosterForCurrentScoringPeriod.entries[]`: that week's lineup, bench included, with `lineupSlotId` per entry. | espn-api `football/league.py:359-368`, `football/box_score.py:83-89` |
| A player's points for the week are in `playerPoolEntry.player.stats[]`: the entry with that `scoringPeriodId` and `statSourceId` 0 (actual; 1 is projected) has `appliedTotal`. | espn-api `football/player.py:67-108`, `football/box_player.py:40-51, 81-82` |
| A player's top-level `proTeamId` is his team *now*. The team he played for that week is the `proTeamId` on that week's `statSourceId` 0 stats entry. | espn-api `football/box_player.py:34-51` |

**decision**: lineup efficiency and the bench report use the per-week entries
above. A player's NFL team for a past week comes from that week's stats entry,
not from the current player list, so a traded player's bye is counted for the
team he played for.

## Transactions and waivers

| Fact | Label and source |
|---|---|
| Transactions come from `view=mTransactions2&scoringPeriodId=<n>`, optionally filtered by type with `x-fantasy-filter: {"transactions":{"filterType":{"value":[…]}}}`. | **assumed**: espn-api `football/league.py:531-539`, `requests/espn_requests.py:194-203` |
| A transaction has `id`, `teamId`, `type`, `status`, `scoringPeriodId`, `processDate` / `acceptedDate` / `proposedDate`, `bidAmount`, `relatedTransactionId`, `memberId` and `items[]`. | **assumed**: espn-api `football/transaction.py:1-19` |
| An item has `type`, `playerId`, `fromTeamId` and `toTeamId`. | **assumed**: espn-api `football/transaction.py:27-33` |
| Transaction types: `DRAFT`, `TRADE_ACCEPT`, `WAIVER`, `TRADE_VETO`, `FUTURE_ROSTER`, `ROSTER`, `RETRO_ROSTER`, `TRADE_PROPOSAL`, `TRADE_UPHOLD`, `FREEAGENT`, `TRADE_DECLINE`, `WAIVER_ERROR`, `TRADE_ERROR`. | **assumed**: espn-api `football/constant.py:493-507`; JS `constants.js` `TRANSACTION_TYPES` (same thirteen) |
| Item (player move) types: `NONE`, `LINEUP`, `ADD`, `DROP`, `DRAFT`, `UNDRAFT`, `DRAFT_TRADE`. | **assumed**: JS `constants.js` `PLAYER_MOVE_TYPES` |
| A failed waiver claim is type `WAIVER_ERROR`. | **assumed**: inferred from espn-api fetching `WAIVER` and `WAIVER_ERROR` together for its offers report (`requests/espn_requests.py:194-203`) |
| **`TRADE_ACCEPT` rows often have empty `items`, except for trades made by the account whose cookies were sent.** espn-api refills them from a separate player-card request. | **assumed**: espn-api `football/league.py:518-520` (docstring) |
| What values `status` takes. | **Unknown.** Neither client lists them. Open question 6. |
| The FAAB/rolling switch is `acquisitionSettings.isUsingAcquisitionBudget`; the budget is `acquisitionBudget`; FAAB spent per team is `transactionCounter.acquisitionBudgetSpent`; a claim's bid is `bidAmount`. | **assumed**: espn-api `base_settings.py:34-37`, `football/team.py:25-27`, `football/transaction.py:14` |
| Acquisition types: `FREEAGENCY`, `WAIVERS_TRADITIONAL`, `WAIVERS_CONTINUOUS`. | **assumed**: JS `constants.js` `ACQUISITION_TYPES` |

**decisions** (plan Appendix A, 3.6 and 5.1):
- Bids are produced only for FAAB claims. Rolling-waiver claims carry no bid,
  and bid facts in a rolling league are `unavailable`.
- **A trade whose `items` are empty is not reported as a trade with nothing in
  it.** It is listed as a trade between the two teams whose contents are
  `unavailable`, and the model is told not to describe them. Refilling trades
  from player cards, as espn-api does, is not in v1 (open question 6). The
  trade report on ESPN is therefore expected to be incomplete in a league the
  operator doesn't manage trades in. The coverage matrix says so.
- Picks never appear in an ESPN trade (see [Draft picks](#draft-picks)).

**How the week normalizer reads them** (`src/espn/normalize.mjs`). These are
readings, not facts from a source; each is **assumed** until task 2.2:
- Moves are `TRADE_ACCEPT` (a trade), `WAIVER` (a claim), `FREEAGENT` and
  `ROSTER` (a manager's own adds and drops). `WAIVER_ERROR` is a lost bid,
  not a move. The other types (proposals, vetoes, declines, draft and lineup
  rows) are not moves. Only `ADD` and `DROP` items move a player.
- An item names both ends of a move: `toTeamId` received the player and
  `fromTeamId` gave him up. A team ID of 0 or below is the player pool, not a
  team (the fixture uses 0; neither client says).
- `processDate`, in epoch milliseconds, is when a move cleared
  (`completedAt`). It is null when absent.
- A week's matchups are the `schedule[]` entries whose `matchupPeriodId` is
  the matchup period that `scheduleSettings.matchupPeriods` lists the week
  under, so the bundle is fetched with `mSettings` alongside
  `mMatchupScore` and `mScoreboard`.

## Draft picks

| Fact | Label and source |
|---|---|
| `draftDetail.drafted` is `true` once the league has drafted; `draftDetail.picks[]` has `teamId`, `playerId`, `roundId`, `roundPickNumber`, `bidAmount`, `keeper`, `nominatingTeamId`. | **assumed**: espn-api `base_league.py:74-104` |
| `draftSettings.isTradingEnabled` exists, and the JS client reads it as "whether draft picks can be traded". | **assumed**: JS `league/league.js:26, 85` |
| ESPN has no trading of **future** draft picks. | **assumed**: plan §4, uncited. **Weakened** by the field above: it suggests some pick trading exists, though not whether it reaches future seasons. Neither client reads a traded-picks list. Open question 25. |
| Other draft states (in progress, not started) and where they are. | **Unknown.** Open question 28. |

**decision** (task 3.5): the League's `draftStatus` is `complete` when
`draftDetail.drafted` is `true` and `pre_draft` when it is `false`. It is never
`drafting`, because nothing documented says a draft is under way.

**decision** (plan §2, decision 8): v1 still treats ESPN as having no traded
future picks, so tank watch, future stock and pick capital refuse on ESPN. If
open question 25 shows future picks can be traded, those editions get
`unavailable` entries saying the picks exist but are not read, and this
decision is revisited.

## Pro teams

| Fact | Label and source |
|---|---|
| Players carry a numeric `proTeamId`. | **operator-checked** (plan §4) |
| `proTeamSchedules_wl` returns `settings.proTeams[]`, each with `id` and `proGamesByScoringPeriod`: a map from scoring period to a list of games with `homeProTeamId`, `awayProTeamId` and `date`. A team with no entry for a period has no game that week. | **assumed**: espn-api `base_league.py:149-178` |
| ESPN's NFL **scoreboard** (`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`, a different API from the fantasy host) spells Washington `WSH`. | **assumed**: this is what the bye-week generator used to map, before it moved to nflverse's schedule (no longer read from ESPN's scoreboard). Not verified. `src/nflTeams.mjs` keeps the `WSH` alias for the fantasy API (next row). |
| The fantasy API's pro team ID 28 is spelled `WSH` too. | **assumed**: espn-api `football/constant.py:75`; JS `constants.js:109`. Both clients agree. |

**decision** (plan Appendix A, 3.1-3.2): pro teams map through
`src/nflTeams.mjs` to the bye-week table's codes. An unknown code is refused,
never passed through.

### Pro team IDs

**assumed**, two sources that agree on every ID: espn-api
`football/constant.py:46-80` (`PRO_TEAM_MAP`) and JS `constants.js:80-114`
(`nflTeamIdToNFLTeamAbbreviation`). There are no IDs 31 or 32. All 32 codes in
`config/bye-weeks.2026.yml` have exactly one ESPN ID, and `WSH` is the only
one that needs the alias.

The canonical-code column is a **decision**, through `src/nflTeams.mjs`.

| Pro team ID | espn-api | JS client | Canonical code (bye table) |
|---|---|---|---|
| 0 | `None` | `—` | none: free agent (no team) |
| 1 | `ATL` | `ATL` | `ATL` |
| 2 | `BUF` | `BUF` | `BUF` |
| 3 | `CHI` | `CHI` | `CHI` |
| 4 | `CIN` | `CIN` | `CIN` |
| 5 | `CLE` | `CLE` | `CLE` |
| 6 | `DAL` | `DAL` | `DAL` |
| 7 | `DEN` | `DEN` | `DEN` |
| 8 | `DET` | `DET` | `DET` |
| 9 | `GB` | `GB` | `GB` |
| 10 | `TEN` | `TEN` | `TEN` |
| 11 | `IND` | `IND` | `IND` |
| 12 | `KC` | `KC` | `KC` |
| 13 | `LV` | `LV` | `LV` |
| 14 | `LAR` | `LAR` | `LAR` |
| 15 | `MIA` | `MIA` | `MIA` |
| 16 | `MIN` | `MIN` | `MIN` |
| 17 | `NE` | `NE` | `NE` |
| 18 | `NO` | `NO` | `NO` |
| 19 | `NYG` | `NYG` | `NYG` |
| 20 | `NYJ` | `NYJ` | `NYJ` |
| 21 | `PHI` | `PHI` | `PHI` |
| 22 | `ARI` | `ARI` | `ARI` |
| 23 | `PIT` | `PIT` | `PIT` |
| 24 | `LAC` | `LAC` | `LAC` |
| 25 | `SF` | `SF` | `SF` |
| 26 | `SEA` | `SEA` | `SEA` |
| 27 | `TB` | `TB` | `TB` |
| 28 | `WSH` | `WSH` | `WAS` (alias) |
| 29 | `CAR` | `CAR` | `CAR` |
| 30 | `JAX` | `JAX` | `JAX` |
| 33 | `BAL` | `BAL` | `BAL` |
| 34 | `HOU` | `HOU` | `HOU` |
| -1 | — | `Bye` | not a team (JS only) |

## Players

| Fact | Label and source |
|---|---|
| `seasons/<year>/players?view=players_wl` needs no login and takes an `x-fantasy-filter` header. | **operator-checked** (plan §4) |
| Each player has `id`, `defaultPositionId`, `eligibleSlots` and `proTeamId`. | **operator-checked** (plan §4) |
| Each player has `fullName`. | **assumed**: espn-api `base_league.py:142-147`; JS `player/player.js` response map (`fullName`, `firstName`, `lastName`) |
| `x-fantasy-filter: {"filterActive":{"value":true}}` returns the active players. | **assumed**: espn-api `requests/espn_requests.py:163-168` |
| Whether that list includes every rostered player, and whether it is paged or capped. | **Unknown.** espn-api pages its league player-pool request 500 at a time (`requests/espn_requests.py`, `get_player_pool_ids`) but not this one. Open question 9. |
| Players carry `injuryStatus` (and an `injured` flag). | **assumed**: espn-api `football/player.py:23, 57-58`; JS `player/player.js` response map |
| Injury status values listed by the JS client: `ACTIVE`, `BEREAVEMENT`, `DAY_TO_DAY`, `DOUBTFUL`, `FIFTEEN_DAY_DL`, `INJURY_RESERVE`, `OUT`, `PATERNITY`, `PROBABLE`, `QUESTIONABLE`, `SEVEN_DAY_DL`, `SIXTY_DAY_DL`, `SUSPENSION`, `TEN_DAY_DL`. | **assumed**: JS `constants.js` `INJURY_STATUSES`. Several are baseball statuses, since the type is shared. |
| Players carry an age or a birth date. | **Unknown.** Neither client reads one. Task 2.1 checks. |
| ESPN's rate limits, and whether it asks for the list to be fetched at most daily. | **Unknown.** Neither client says. Open question 12. |

**decision** (plan Appendix A, 3.4; plan §9, R4; plan §6 `openLeague({
refreshPlayers })`): the player list is cached daily at
`data/cache/players-espn-<season>.json`, as Sleeper's is, and can be
refreshed on demand. No request is made per player. A player field ESPN does
not supply (age, for example) is absent from the shared Player record, not
null. On the import route there is no player list: names come from the saved
rosters and lineups ([Importing saved files](#importing-saved-files)).

**decision** (2026-10-13, task 5.2; open question 9): on the fetch route,
every rostered player the player list leaves out is added from his
`playerPoolEntry.player` record in `mRoster` (`withRosteredPlayers` in
`src/espn/normalize.mjs`). A player in both keeps the list's record. Without
this, a rostered player missing from the list would have no position, so no
slot could take him in the optimal lineup. His team's lineup efficiency could
then come out above 100%, and he would print as his ESPN ID.

Whatever the dictionary holds, a player whose position is not on file leaves
his team's potential points and lineup efficiency out of the week's analysis
(`src/analysis/week.mjs`). They are not computed without him. This rule is
provider-neutral and applies to Sleeper too.

As with Sleeper, **a raw ESPN player ID or numeric code must never reach a
prompt.**

**decision** (task 3.5): `injuryStatus` is printed as a label
(`src/espn/codes.mjs`). `ACTIVE` means no injury and leaves the field absent,
as Sleeper's healthy `null` prints nothing. `INJURY_RESERVE` and `SUSPENSION`
take Sleeper's spellings `IR` and `Sus`; the rest are spelled out
(`Questionable`, `Day to day`, `7-day DL`). A value outside the list above is
refused.

### Player IDs and FantasyCalc

| Fact | Label and source |
|---|---|
| FantasyCalc entries carry `espnId` beside `sleeperId`. | **operator-checked** (plan §4), on a known player |
| The share of FantasyCalc's priced players that carry an `espnId`. | **Unknown.** Task 2.1 checks. |

**decision** (plan Appendix A, 6.1): market values join on `espnId` only. A
player with no `espnId` is unpriced, never matched by name.

## League formats

| Fact | Label and source |
|---|---|
| Keeper leagues exist on ESPN; `draftSettings.keeperCount` is the number kept, and a draft pick can carry `keeper`. | **assumed**: espn-api `base_settings.py:13`, `base_league.py:91`; JS `constants.js` `KEEPER_ORDER_TYPES` |
| ESPN has no guillotine format. | **assumed**: plan §4, uncited. Neither client mentions one. |
| ESPN has no dynasty format as such: a league that keeps every player is a keeper league with a high `keeperCount`. | **Unknown.** Open question 25. |

**decisions** (plan §2): keeper is treated as redraft, and keeper designations
are `unavailable` (8); guillotine is refused on ESPN (9); manager names come
from `displayName` only, and are `unavailable` until that field is confirmed
(11, open question 27); seasons before 2018 are not covered (1).

## Importing saved files

**decision** (owner, 2026-10-12; ESPN_ROUTE in plan §7): an ESPN league's data
arrives one of two ways. `ESPN_ROUTE=import`, the default (also when the line
is absent), is a manual route: the operator opens ESPN's own JSON addresses in
their own signed-in browser, saves each page into the league folder, and runs
`import-espn`. Fantasy Pressbox then never contacts ESPN and never reads the
cookies. `ESPN_ROUTE=fetch` is an opt-in: the client asks ESPN's servers
itself, with the cookies for a private league.

Why: the Disney Terms of Use, which cover ESPN (disneytermsofuse.com/english/,
last updated May 24, 2024), bar accessing or extracting the products "using a
robot, spider, script, or other automated means" (§2.B(x)) and limit use to
personal, noncommercial use (§2.A). The cookie fetch is automated access. On
the import route a person opens and saves each page. Copying is still a grey
area (§2.B(ii) bars copying unless expressly permitted): **this is the
operator's own manual, personal use, and nothing here says ESPN permits it.**

What to save (`src/espn/urls.mjs`, `espnImportLinks`). These are exactly the
requests the fetch route makes, built by the same code:

| Page | Address | What the import reads from it |
|---|---|---|
| The league | `seasons/<year>/segments/0/leagues/<id>?view=mSettings&view=mTeam&view=mRoster&view=mDraftDetail` | settings, teams, members, rosters, draft status |
| A week's matchups | `…?view=mMatchupScore&view=mScoreboard&view=mSettings&scoringPeriodId=<week>` | that week's lineups and scores |
| A week's transactions | `…?view=mTransactions2&scoringPeriodId=<week>` | that week's moves |

| Fact | Label and source |
|---|---|
| A public league's pages open in a browser with no sign-in. | **assumed**: follows from "a public league works without cookies" ([Authentication](#authentication)), which is operator-checked for requests, not for a browser visit. |
| A browser signed in to fantasy.espn.com shows a private league's JSON on a plain visit to these addresses. | **Unverified.** It depends on the browser sending ESPN's cookies to `lm-api-reads.fantasy.espn.com`, which no source shows. Until a test league exists (task 2.2) the import route for a private league is untested. |
| The player list (`players_wl`) can be saved the same way. | **No.** Its request needs an `x-fantasy-filter` header ([Players](#players)), and a browser visit cannot send one, so the saved page would not be the same request. |
| A saved page's top-level `scoringPeriodId` is the league's current period, not the week asked for. | **assumed**: [Working out the week](#working-out-the-week). |
| The league response carries the league ID as a top-level `id`. | **Unknown.** Neither client reads it. Open question 34. |

**decision** (task 3ab1ae1e): how the import reads saved pages
(`src/espn/import.mjs`, node-free so the browser core can reuse it):

- **Untrusted input.** A page is refused, naming the file, when it is over
  20 MB, is not JSON, does not hold a JSON object, holds a key named
  `__proto__`, `constructor` or `prototype`, names no league ID or another
  league than `ESPN_LEAGUE_ID` (open question 34), is for another season than
  `LEAGUE_SEASON`, or fails its shape guard. No value from a page is echoed
  in a refusal. A path inside the installed package is refused before it is
  read: a saved page is the league's own data and belongs in its league
  folder. Its contents are kept only in the league folder's `data/`
  (`import/<season>/league.json` and the week's raw bundle).
- **The week comes from the operator** (`import-espn --week <n>`), because the
  page does not say which week was asked for. The page must agree: the week
  is in `scheduleSettings.matchupPeriods`, and the lineups carry stats for that
  scoring period.
- **Two pages per week.** A week imported without its transactions page has
  its transactions marked unavailable for that week, never empty, and the
  transactions edition refuses it. Importing the page later fills them in.
- **Player names** come from the `playerPoolEntry.player` records in the
  league page's rosters and every saved week's lineups, the newest save
  winning. A player who appears only in a transaction is in no roster, so his
  name is unavailable: he is printed as "Name unavailable", never as his ESPN
  ID.
- **Settling.** A week is settled only once the latest scoring period any
  saved page shows is past it (plan §9, R6, as above). A week saved while it
  is still being played stays unsettled until a later save shows the period
  has moved on. The furthest period seen is kept, so importing an older page
  never moves the season backwards.

**decision** (owner, 2026-10-13; task 3cc90608): **a stale league page is
refused, never computed around.** The league page holds the standings,
records, points-for, rosters, settings and draft; a week's pages hold only
that week. When the saved league page's own `scoringPeriodId` is behind the
latest period any saved page shows (a week page, or an earlier save of the
league page), every edition on the import route refuses
(`EspnStaleLeagueError`, `src/espn/import.mjs`, `leaguePageFreshness`). The
refusal names both periods, the league address to save again and the import
command. Without it, a league page saved at period 3 beside a week-5 page
saved at period 6 would put week 5's scores next to week-2 standings, and
nothing would say so.

- `import-espn` says so after an import that leaves the league page behind.
  It prints the week's whole routine together, the league page plus that
  week's two pages, and captures nothing from the stale page.
- `doctor` shows the period each saved page is from, flags a stale league
  page, and exits non-zero.
- Saving and importing the league page again clears it.
- The fetch route is unaffected: it reads the league live on every run.

## Open questions

Each must be answered by task 2.1 (public endpoints) or task 2.2 (a test
league). Until then every **assumed** entry is a guess the shape guards must
treat as unverified.

**Answered from the sources on 2026-10-12, still to verify**

These are now **assumed** with a cited source, no longer unknown. Task 2.2
confirms them against a real league.

1. Lineup slot ID table: [above](#lineup-slot-ids).
3. Pro team ID → abbreviation table: [above](#pro-team-ids). Task 2.1 also
   cross-checks it against `proTeamSchedules_wl`.
4. Scoring stat ID table: [above](#scoring-stat-ids).
7. The league URL path: `seasons/<year>/segments/0/leagues/<leagueId>`.
8. `proTeamSchedules_wl`'s shape.
14. What `mSettings`, `mTeam`, `mRoster`, `mMatchup`/`mMatchupScore`/`mScoreboard`,
    `mTransactions2` and `mDraftDetail` return. `mBoxscore` is not used.
15. That several `view=` parameters combine in one request.
16. That `scoringPeriodId` selects a week.
20. How a matchup period maps to scoring periods: `scheduleSettings.matchupPeriods`.
21. Where starting slot counts live (`rosterSettings.lineupSlotCounts`), how a
    roster entry names its slot (`lineupSlotId`), and bench and IR (slots 20
    and 21).
22. Per-player points include the bench: `rosterForCurrentScoringPeriod.entries[]`
    lists it.
23. Team records and points for and against: `record.overall`. No season
    potential points figure appears in either client.
24. FAAB versus rolling (`isUsingAcquisitionBudget`), the budget, and where a
    bid appears (`bidAmount`).
26. The playoff seeding rule: `scheduleSettings.playoffSeedingRule`, and its
    values.
30. Player injury status: `injuryStatus`, and its values.

**Still open**

2. What `defaultPositionId` values mean. The clients disagree; the position
   comes from `eligibleSlots` meanwhile.
5. `scoringItems`: whether every scored stat is listed; what the keys of
   `pointsOverrides` are (and so how a TE premium is expressed); and ESPN's
   default points per stat, for `nonDefault`.
6. Transaction `status` values, and how an executed move is told apart from a
   pending or failed one. Whether trades can be read in full without the
   player-card refill espn-api uses.
9. Whether `players_wl` with `filterActive` includes every rostered player,
   and whether it is paged or capped.
10. Whether players carry an age or a birth date.
11. Whether the fantasy API spells any pro team differently from
    `config/bye-weeks.<season>.yml` beyond `WSH` (task 2.1).
12. Rate limits, and whether ESPN asks for the player list to be cached.
13. FantasyCalc's `espnId` coverage, as a percentage.
17. How long `espn_s2` lasts, and how a request fails when the cookies have
    expired.
18. Whether ESPN reports a last fully scored week; what
    `status.latestScoringPeriod` means; and when the current scoring period
    advances relative to Monday night and stat corrections (risk R6).
19. Which object `currentScoringPeriodId` and `isPublic` sit on, as read by the
    JS client, and whether the league's `scoringPeriodId` can differ from the
    season endpoint's `currentScoringPeriod`.
25. Whether future draft picks can be traded (`draftSettings.isTradingEnabled`),
    and if so where traded picks are reported; whether ESPN has anything like a
    dynasty format beyond keepers; whether there is a taxi squad.
27. Member fields: whether `members[]` carries `displayName`, and what else.
28. Draft status values beyond `draftDetail.drafted`.
29. Whether rosters are reported before week 1 (needed by
    `preseason-rankings`).
31. Which positions may fill ESPN's IDP slots (`DL`, `DB`, `DP`): for
    example, whether a `DT` or `DE` fills a `DL` slot. Until answered,
    leagues that start an IDP slot are refused.
32. Whether ESPN writes a `statSourceId` 0 (actual points) entry in
    `stats[]` for a player who did not play that week (bye, inactive, IR).
    **Unknown.** `guardSchedule` allows the entry to be absent and leaves it
    absent. **decision** (operator, 2026-10-12): unavailable, not refused, and
    never 0 by default. Team points are always the side's `totalPoints`. A
    player with no entry has no points value. If the bye table says his
    current NFL team had no game that week he is flagged `onBye` and counts 0
    for the optimal lineup. Any other player without an entry, starter or
    bench, makes his team's lineup efficiency and optimal lineup unavailable
    for the week (`src/espn/normalize.mjs`, `src/analysis/week.mjs`).
    **Exception, decision** (operator, 2026-10-13): a player in the IR slot
    (21) is not a lineup candidate, so he is left out of the optimal lineup
    whether or not he has an entry; see [Rosters and lineups](#rosters-and-lineups).
33. Whether ESPN sends `waiverRank` or `wavierRank` on `teams[]` (espn-api and
    the JS client disagree; one is a typo). **Unknown.** `guardTeams` requires
    `waiverRank` only in a rolling-waiver league (`{ faab: false }`); a FAAB
    league does not read it. If ESPN sends `wavierRank`, rolling-waiver leagues
    refuse until this is answered.
34. Whether a league response carries the league ID as a top-level `id`.
    **Unknown.** Neither client reads one. The import route needs it to check
    a saved page against `ESPN_LEAGUE_ID`, so a page without it is refused
    rather than accepted unchecked ([Importing saved files](#importing-saved-files)).
    If ESPN does not send it, the import refuses every page until this is
    answered. The fixture's `id` is a placeholder.
35. Whether a browser signed in to ESPN shows a private league's JSON on a
    plain visit to the league address. **Unverified** until a test league
    exists.
