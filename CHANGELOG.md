# Changelog

Every published version of `fantasy-pressbox`, newest first. Each release is
also tagged `v<version>` with a GitHub release.

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
