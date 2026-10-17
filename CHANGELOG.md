# Changelog

Every published version of `fantasy-pressbox`, newest first. Each release is
also tagged `v<version>` with a GitHub release.

## 0.2.0

- **ESPN football leagues (experimental)**: set `LEAGUE_PROVIDER=espn` and
  `ESPN_LEAGUE_ID`, and `init` sets the league up. By default you save the
  league's pages from ESPN in your own browser and `import-espn` reads them,
  so nothing is requested from ESPN for you. `ESPN_ROUTE=fetch` is opt-in
  automated access, with `ESPN_S2` and `ESPN_SWID` for a private league. ESPN
  leagues get the preview, recap, weekly, preseason and postseason rankings,
  the trade report, `record`, `grade` and `check`. Tank watch, future stock,
  the five-year plan, guillotine and matchup periods longer than one week are
  refused, saying why. ESPN's API is unofficial, and this support is built
  from public descriptions of it and has not yet been checked against a live
  league. `doctor` explains an ESPN league's route, masked cookies and errors.
- **Ranking presets**: one line in your league's `config/rankings.yml`,
  `preset: win-now`, `balanced` or `rebuild`, changes what the rankings
  reward. Dynasty has all three, redraft has `balanced` and `win-now`, and
  guillotine `balanced` only. Leaving it out is `balanced`, which is the
  0.1.0 weights exactly. `doctor` names the preset in use.
- **Team strength rating**: a 0-100 number the code works out for every team
  from the league's own data: best possible lineup, bench depth, market
  value and, in dynasty, age and future picks. The weekly, preseason and
  postseason rankings, the future stock and the five-year plan cite it as
  evidence. Anything the league cannot supply is left out and named, never
  counted as zero.
- **Rivalries**: declare rival pairs in `config/rivalries.yml`, with an
  optional name and one line of backstory. The preview and the recap write a
  rivals' matchup one step hotter than `roast_intensity` and quote the pair's
  head-to-head record from the weeks you saved; the trade report marks a
  trade between rivals. `doctor` checks every rivalry still finds its teams.
  The package ships none.
- **Five-year plan**: `five-year-plan --team <name or roster id>` writes an
  outlook for one dynasty team: its contention window, who to sell before
  the age cliff, and which picks to spend or keep. Each point is tied to a
  fact, with no projected points, records or titles. The age curves it uses
  are in `config/rankings.yml`, where you can change them.
- **League files**: `export-league` saves a league's history and settings as
  one JSON file, and `import-league` turns one back into a league folder.
  API keys and ESPN cookies are never written into it.
- **Rank emoji**: one setting with three modes, `default`, `custom` (your own
  `ranking_emoji` table) or `none`, shown by `doctor`. `--emoji none` (or
  `default`) changes it for a single run without touching your settings.
- **Copying replies**: `record` and `check` warn when a reply has lost its
  blank lines, which usually means it was highlighted and copied rather than
  taken with the chat's copy button. `record` also keeps the whole reply
  under `data/editions/`.
- **FantasyCalc credit**: a post that quotes a trade value now ends with
  `Values: FantasyCalc (fantasycalc.com)`, as FantasyCalc's terms ask, and the
  line counts toward the post limit. `check` reports a post that quotes a
  value without it.
- **For developers**: `fantasy-pressbox/core` is a browser-safe entry (no
  `node:` imports, no AI call) for league files, settings, edition
  preparation, prompt building and reply checks.

**Changes for 0.1.0 users**

- `LEAGUE_SEASON` and `POST_MAX_LENGTH` replace `SLEEPER_SEASON` and
  `SLEEPER_POST_MAX_LENGTH` in `.env`. The old names still work.
- A misspelt `LEAGUE_PROVIDER` is refused, and so is a `.env` with both a
  Sleeper and an ESPN league ID but no `LEAGUE_PROVIDER`.
- A custom `ranking_emoji` entry that is not exactly one emoji is refused,
  naming the rank. `include_emoji: false` (or `INCLUDE_EMOJI=false`) now
  tells the writer plainly to print no rank emoji anywhere.
- `preview` refuses a week with no matchups instead of writing a prompt.
- Config and league files are read with size and nesting limits, and a key
  named `__proto__`, `constructor` or `prototype` is refused, naming the file.
- If your league folder overrides a prompt file, compare it with the shipped
  one. The rank emoji now arrive as `editorial.rankEmoji` (they were
  `editorial.rankingEmoji` and `includeEmoji`), and an overridden prompt
  gets none of the new instructions for presets, the strength rating or
  rivalries.
- `package.json` now has an `exports` field: only `fantasy-pressbox/core` can
  be imported, and importing `fantasy-pressbox/src/...` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. The `fantasy-pressbox` command is
  unaffected.
- `DEBUG=true` in `.env` never printed error details; put it in front of the
  command instead (`DEBUG=true fantasy-pressbox recap`).
- Data saved by 0.1.0 is read as it is; nothing needs migrating.

## 0.1.0

The first public release.

- **Editions**: preseason and weekly power rankings, weekly matchup previews,
  weekly recaps with awards, and a trade report grading each completed trade
  against the trade market's values.
- **League formats**: dynasty and redraft, detected from Sleeper, and
  guillotine, declared in `.env` because Sleeper's data cannot show it.
  Guillotine leagues get their own survival preview, chop recap and survival
  rankings in place of the head-to-head editions, which refuse to run there.
- **Dynasty extras**: tank watch (the race for next season's top rookie picks
  and who owns them) and future stock (every team ranked on the next three
  seasons), both built on a declared rookie-draft order rule and an optional
  prospect board.
- **League folders**: `fantasy-pressbox init` sets up a folder per league
  holding its `.env`, config, data and output, anywhere on disk. A folder can
  override the house style, ranking weights and individual prompts without
  copying the package. `migrate` moves an existing league into a new folder.
- **Two ways to write**: by default each command writes a prompt file to paste
  into a chat and `record` files the answer; with an Anthropic or OpenAI API
  key, `--generate` writes the finished posts directly.
- **Receipts**: predictions and rankings are recorded so later editions can
  show movement and `grade` can report how last week's calls did. A week's
  snapshot is never rewritten once Sleeper has scored it.
- **Checks**: `doctor` reports the settings, league format and connection in
  use; `check` holds a file of posts to Sleeper's length limit.
- Requires Node.js 22 or newer. No other dependencies.
