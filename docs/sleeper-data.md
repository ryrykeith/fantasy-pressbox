# Sleeper Data

Sleeper's read API is public: no key, no account, no authentication. Base URL:

```
https://api.sleeper.app/v1
```

## Endpoints used

```
GET /league/{league_id}                     settings, scoring, roster slots
GET /league/{league_id}/users               managers and team names
GET /league/{league_id}/rosters             rosters, records, season totals
GET /league/{league_id}/matchups/{week}     weekly scores and lineups
GET /league/{league_id}/transactions/{week} trades, waivers, free agents
GET /league/{league_id}/traded_picks        future draft capital
GET /league/{league_id}/drafts              draft metadata
GET /draft/{draft_id}/picks                 draft results
GET /state/nfl                              the current NFL week
GET /players/nfl                            every NFL player (~15 MB)
```

## Field notes

### Working out the week

`league.settings.leg` is the league's current week. `/state/nfl` is the
fallback. Neither is ever hard-coded, and both can be overridden with `--week`.

### Scores are split in two

Sleeper stores points as an integer plus a separate hundredths field:

```json
{ "fpts": 161, "fpts_decimal": 68 }   // 161.68
{ "ppts": 180, "ppts_decimal": 14 }   // 180.14 potential points
```

`normalize.mjs` recombines them. Nothing downstream should see the halves.

### Matchup pairing

**Two matchup objects with the same `matchup_id` are opponents.** That is the
whole pairing rule. A null `matchup_id` means the team has no opponent that
week; those are reported as unpaired rather than dropped.

### Lineups

- `starters` — an array of player IDs, **positionally aligned with the
  league's `roster_positions`**. Index 0 is the first starting slot. An empty
  slot is the string `"0"`.
- `starters_points` — the same order, as numbers.
- `players` — every player on the roster.
- `players_points` — points for all of them, keyed by ID.

Bench is `players` minus `starters`.

### Roster positions

`league.roster_positions` lists starting slots followed by bench slots:

```json
["QB","RB","RB","WR","WR","WR","TE","FLEX","FLEX","SUPER_FLEX","BN","BN", ...]
```

Filtering out `BN`, `IR` and `TAXI` leaves the starting lineup. Format is
derived from this, never assumed: `SUPER_FLEX` present (or more than one `QB`)
means Superflex.

### Scoring

`league.scoring_settings` — `rec` is points per reception (`0.5` is half PPR),
`bonus_rec_te` is the tight end premium.

### Players

`/players/nfl` is roughly 15 MB and Sleeper asks that it be fetched at most
once a day. It is cached at `data/cache/players-nfl.json` and refreshed after
24 hours, or on demand with `--refresh-players`.

Player IDs are resolved to names in the normalizer. **A raw player ID must
never reach a prompt** — the model cannot know who `9228` is, and will guess.

### Transactions

Raw transactions are roster IDs pointing at player IDs, which is both
unreadable and large. `normalizeTransactions` turns them into readable lines
and keeps only completed moves.

### Taxi and reserve

`roster.taxi` and `roster.reserve` hold IDs also present in `roster.players`.
They are separated in the roster view so a taxi stash is not mistaken for
active depth.

## Verifying changes

Sleeper publishes `ppts` (season potential points), which is an independent
check on the optimal-lineup solver: summing the solver's weekly optimums must
reproduce it. That check was used to validate `analysis/lineup.mjs` and is the
first thing to re-run if lineup logic changes.
