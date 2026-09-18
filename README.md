# Fantasy Pressbox

**AI-powered fantasy football league coverage from Sleeper data: power
rankings, previews, recaps, awards, and trash talk.**

Fantasy Pressbox reads your Sleeper league, works out what actually happened,
and writes the weekly content you post in your league chat — in a consistent
voice, with real numbers, week after week.

It is not a chatbot that guesses. Every score, roster and record it prints
comes from your league's real data.

---

## Contents

- [What you get](#what-you-get)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation-step-by-step)
- [Setup](#setup)
- [Your weekly routine](#your-weekly-routine)
- [Commands](#commands)
- [Two ways to write the posts](#two-ways-to-write-the-posts)
- [Configuration](#configuration)
- [Where files go](#where-files-go)
- [Troubleshooting](#troubleshooting)
- [What it costs](#what-it-costs)
- [For developers](#for-developers)

---

## What you get

Four kinds of content, all built from your league's real data:

| Edition | What it is |
|---|---|
| **Preseason power rankings** | A ranking of every team before a snap is played. Deliberately blind to results, so it can be held against you later. |
| **Weekly previews** | One post per matchup, with a called shot on the winner and the score. |
| **Weekly recaps** | The autopsy: who won, who left points on the bench, who got exposed. Plus awards. |
| **Weekly power rankings** | A fresh 1-to-N with movement arrows against last week. |

Here is the kind of thing it produces — this is real output from a real
league, and every number in it came out of Sleeper:

```
WEEK 1 RECAP • 5/8

😤 CERTIFIED LOVER BOYS 111.32
🔥 APOLOGIES IN ADVANCE 85.98

Sometimes you win because you were excellent.

Sometimes your opponent scores 85.98.

Apologies managed the lowest score of Week 1 and set only 73% of its
optimal lineup.

VERDICT: Certified Lover Boys escaped with the win. Apologies in Advance
finally delivered on the name.
```

It also keeps receipts. Because it records what it predicted, next week's
recap can open by admitting it went 2-4.

---

## How it works

```
Your Sleeper league
        ↓  read (public data, no password needed)
   Fetch and normalize        player IDs become player names
        ↓
   Snapshot to disk           this week is written down before the next one
        ↓
   Analyze                    scores, potential points, lineup efficiency, awards
        ↓
   Build a prompt             the facts, plus the house style rules
        ↓
   Write the posts            you paste it into ChatGPT, or it calls an API
        ↓
   Check the length           Sleeper rejects long messages, so posts are checked
        ↓
   Your league chat
```

Two ideas do most of the work:

**The data is the source of truth.** The AI is handed a block of verified
facts and told, in strong terms, that it may not invent a single one. It
decides what is *interesting*; it never decides what is *true*.

**The publication remembers.** Every week is saved before the next one
happens. That is what makes movement arrows, graded predictions and
"we ranked you 12th and you led the league in scoring" possible.

---

## Requirements

**One thing: Node.js, version 18 or newer.** That's it.

There are no other packages to install. No Python, no database, no account to
create, and no Sleeper password — Sleeper's data is public and read-only.

You only need an AI API key if you want the posts written automatically. See
[Two ways to write the posts](#two-ways-to-write-the-posts).

---

## Installation, step by step

If you have never done this before, follow all four steps. It takes about ten
minutes, and you only do it once.

### Step 1 — Install Node.js

1. Go to **<https://nodejs.org>**
2. Download the button that says **LTS** (it means "the stable one")
3. Open the downloaded file and click through the installer, accepting the
   defaults

### Step 2 — Open a terminal

The terminal is where you type commands. It looks intimidating and is not.

- **On a Mac:** press `Cmd + Space`, type `Terminal`, press Enter.
- **On Windows:** press the Start button, type `PowerShell`, press Enter.

Check that step 1 worked by typing this and pressing Enter:

```bash
node --version
```

You should see something like `v22.14.0`. Any number 18 or higher is fine.

> **If you get "command not found"**, Node did not install correctly, or this
> window was open before you installed it. Close the window, open a new one,
> and try again.

### Step 3 — Get the project onto your computer

If you have `git`, this is one command:

```bash
git clone https://github.com/YOUR-USERNAME/fantasy-pressbox.git
```

If you don't, go to the project page on GitHub, click the green **Code**
button, choose **Download ZIP**, and unzip it wherever you like.

Then move into the folder — this tells the terminal which project you mean:

```bash
cd fantasy-pressbox
```

> **Tip:** you can type `cd ` (with a space) and then drag the folder from
> Finder or File Explorer onto the terminal window, which fills in the path
> for you.

### Step 4 — Run setup

```bash
npm run setup
```

That's the install finished. The next section covers what setup asks you.

---

## Setup

`npm run setup` is an interactive questionnaire. It checks your computer,
asks a handful of questions in plain language, and writes your settings file
for you. Press Enter to accept any answer shown in brackets.

It asks for:

**1. Your Sleeper league ID.** Open your league at
[sleeper.com](https://sleeper.com) in a web browser and look at the address
bar. You'll see something like:

```
https://sleeper.com/leagues/1234567890123456789/team
                            └──── this bit ────┘
```

You can paste the entire address — setup pulls the ID out of it. It then
checks the ID against Sleeper and shows you the league name, so you know
immediately if you grabbed the wrong number.

**2. Whether you want the posts written for you.** Choose "paste it myself"
to use Fantasy Pressbox for free. You can change this later.

**3. How it should sound.** Humorous, analytical, or unhinged.

**4. Your Sleeper post length limit.** 900 characters is a safe default.

Your answers are saved to a file called `.env` in the project folder. That
file stays on your computer and is never committed to git. You can re-run
`npm run setup` any time to change your answers — your previous settings are
backed up first.

When it finishes, check everything works:

```bash
node src/cli.mjs doctor
```

You should see your league name, your team count, and your league format.

---

## Your weekly routine

Once a week, in the project folder:

### Thursday — before the games

```bash
node src/cli.mjs preview
```

This writes a file into the `output` folder. Open it, copy **all** of it, and
paste it into [ChatGPT](https://chatgpt.com) or
[Claude](https://claude.ai). You'll get back a set of previews, one per
matchup, each short enough to post in Sleeper.

Copy the reply into a file and record it, so next week can grade the picks:

```bash
node src/cli.mjs record output/my-previews.txt --task preview
```

### Tuesday — after the games

```bash
node src/cli.mjs recap
```

Same routine. This one grades last week's predictions automatically, so the
recap can open by admitting what it got wrong.

Then the rankings:

```bash
node src/cli.mjs rankings
```

And record them, so next week's edition can show movement arrows:

```bash
node src/cli.mjs record output/my-rankings.txt --task rankings
```

### Posting it

The output is split into separate posts, divided by a line containing `%%%`.
Post each chunk separately in Sleeper — the chat there does not render
formatting and rejects very long messages, which is why the content is
already broken up and length-checked for you.

For your iMessage group chat, add `--format imessage` to get one longer
consolidated message instead:

```bash
node src/cli.mjs rankings --format imessage
```

---

## Commands

Run them all from inside the project folder.

| Command | What it does |
|---|---|
| `npm run setup` | Interactive setup. Run this first. |
| `node src/cli.mjs doctor` | Checks your settings and connection. Run this when something is wrong. |
| `node src/cli.mjs preview` | Build this week's matchup previews. |
| `node src/cli.mjs recap` | Build last week's recap and awards. |
| `node src/cli.mjs rankings` | Build the power rankings. |
| `node src/cli.mjs preseason-rankings` | Build preseason rankings, ignoring all results. |
| `node src/cli.mjs fetch` | Just download and save a week of league data. |
| `node src/cli.mjs record <file> --task <name>` | File a finished edition you pasted back from a chat. |
| `node src/cli.mjs check <file>` | Check a file of posts against the Sleeper length limit. |
| `node src/cli.mjs grade` | Show how last week's predictions actually did. |

Useful options:

| Option | What it does |
|---|---|
| `--week 3` | Work on a specific week instead of the current one. |
| `--format imessage` | One long message instead of Sleeper-sized posts. |
| `--generate` | Call the AI for you and write finished posts. |
| `--refresh-players` | Re-download the NFL player list instead of using the cached copy. |

---

## Two ways to write the posts

### Paste it yourself (free)

The default. Fantasy Pressbox writes a prompt file; you paste it into ChatGPT
or Claude in your browser and copy the answer back. Costs nothing beyond
whatever chat account you already have.

The trade-off is two copy-and-paste steps each week, and you need to run
`record` afterwards for the project to remember what was published.

### Let it write (paid API)

Add an API key to your `.env` — or re-run `npm run setup` and choose Claude or
ChatGPT — then add `--generate` to any command:

```bash
node src/cli.mjs recap --generate
```

The finished posts are written straight into the `output` folder, predictions
and rankings are recorded automatically, and every post is length-checked.

An API key is **not** the same as a ChatGPT Plus or Claude Pro subscription.
It's a separate developer account that bills per use. See
[what it costs](#what-it-costs).

---

## Configuration

### `.env` — your league and your keys

Created by `npm run setup`. Holds your league ID, any API keys, and a few
overrides. Never commit this file; `.gitignore` already prevents it.

`.env.example` documents every available setting.

### `config/editorial.yml` — how it sounds

Plain text you can edit in any text editor. Change a value, save, run again.

- `tone` and `roast_intensity` — the voice
- `output.sleeper_max_chars` — the per-post character limit
- `ranking_emoji` — the emoji next to each rank; **edit this to match your
  league size**
- `awards` — which weekly awards can be handed out
- `banned_phrases` — filler you never want to see printed

### `config/rankings.yml` — how teams are judged

- `weights` — how much starting lineup, dynasty value, depth, quarterback
  play, draft capital, flexibility and contender status each count. They
  should add up to `1.0`.
- `weekly.max_normal_movement` — how far a team normally moves in one week.
  One Sunday is a small sample, and the rankings should act like it.

### `prompts/` — what it writes

One Markdown file per edition, plus `system.md`, which defines the voice and
the rules the AI is not allowed to break. If you want a different structure,
a different number of posts, or a different house style, edit these — they are
just instructions, in English.

---

## Where files go

```
fantasy-pressbox/
├── config/          settings you edit
├── prompts/         the instructions given to the AI
├── src/             the code
├── data/            your league's saved history — stays on your computer
│   ├── raw/           exactly what Sleeper returned
│   ├── snapshots/     each week, analyzed and frozen
│   ├── rankings/      every ranking you've published
│   └── predictions/   every pick you've made
├── output/          the files you paste into a chat, and the finished posts
├── docs/            how the project is designed
└── .env             your settings (never committed)
```

`data/` is the project's memory. Deleting it loses your movement arrows and
prediction history, so leave it alone.

---

## Troubleshooting

**`command not found: node`**
Node isn't installed, or this terminal window was opened before you installed
it. Close the window, open a new one, try again. If it still fails, reinstall
from <https://nodejs.org>.

**`No SLEEPER_LEAGUE_ID found`**
You haven't run setup yet. Run `npm run setup`.

**`Sleeper has no league with ID ...`**
The ID is wrong. Open your league in a web browser and copy the long number
out of the address bar. Make sure it's your *league* ID, not your user ID.

**`Could not reach Sleeper`**
Check your internet connection. Sleeper may also be briefly down — wait a
minute and try again.

**Week 1 works but this week is empty**
The games haven't been scored yet. Sleeper fills scores in as they happen. The
tool warns you when a week has no scores rather than inventing them.

**The posts are too long for Sleeper**
The tool tells you which ones and by how much — it never silently cuts a post
in half. Trim them by hand, or lower `sleeper_max_chars` in
`config/editorial.yml` so the AI aims smaller next time.

**The AI made something up**
Report it. That's the one bug this project treats as serious. Check the prompt
file in `output/` and confirm whether the fact was in the JSON block — if it
wasn't, the prompt rules need tightening.

**Something else**
Run `node src/cli.mjs doctor`. It checks each piece and tells you which one is
unhappy. For full error details, set `DEBUG=true` in `.env`.

---

## What it costs

**Sleeper data: free.** The API is public and requires no account.

**Paste-it-yourself: free.** Any ChatGPT or Claude account, including the free
tiers, can take the prompt.

**`--generate`: paid per run.** You are billed by Anthropic or OpenAI for the
tokens used. A weekly edition for a 12-team league sends roughly 15,000–25,000
tokens and gets a few thousand back, which at current prices lands in the
region of a few cents to a few tens of cents per edition, depending on the
model you choose. Check your provider's current pricing, and set a spending
limit in their dashboard if you want a hard ceiling.

---

## For developers

The design rules live in [`AGENTS.md`](AGENTS.md) and [`docs/`](docs/):

- [`docs/architecture.md`](docs/architecture.md) — the pipeline and why the
  stages are separate
- [`docs/editorial-model.md`](docs/editorial-model.md) — ranking philosophy,
  voice, awards, receipts
- [`docs/prompt-design.md`](docs/prompt-design.md) — how a prompt is assembled
- [`docs/sleeper-data.md`](docs/sleeper-data.md) — endpoints and data shapes

The short version:

- Zero runtime dependencies, on purpose. The install story for a non-developer
  is the product.
- `fetch → normalize → snapshot → analyze → prompt → generate → validate →
  render`, each in its own module. Sleeper's field names stop at
  `src/sleeper/`.
- No league-specific value is ever hard-coded. Not a team, not a player, not a
  league ID.
- History is append-only. A ranking published in week 2 is never recomputed
  with week 5's information.

Adding another fantasy platform means writing a new client and normalizer that
produce the same shapes; nothing downstream should need to change.

## License

MIT. See [LICENSE](LICENSE).
