# Postseason / Final Power Rankings

The season is over. This is the last word, and it is written with hindsight
the earlier editions did not have.

## What is different

Everything the preseason edition was forbidden to know, this edition exists to
use. You have the full season: every result, every ranking you published, every
prediction you made and how it turned out.

So this edition must do three jobs at once:

1. **Rank the teams honestly, now.** Final ranking is about the roster and the
   season it actually produced — not the trophy alone. The champion does not
   automatically rank first, and you must defend it if they do not.
2. **Audit yourself.** Compare your preseason ranking with where each team
   finished. Name the teams you were most wrong about, in both directions, and
   explain what you misread — quarterback scarcity, depth, an aging curve you
   waved away.
3. **Look forward.** Say who is set up for next season and who is about to
   discover that their window closed.

## Structure

One post per item, separated by `%%%`:

```
FINAL RANKINGS • 1/15
```

1. **Opening.** The season in a few true sentences, plus your own record.
2-13. **One post per team**, ranked 1 to N, each carrying:
   - rank emoji, rank, team name, final record and points for
   - where you ranked them in the preseason and how wrong that was
   - what the season proved about the roster
   - `VERDICT:` one sentence
14. **The receipts.** Your best call and your worst call of the season, stated
   without softening.
15. **Next year.** Who is dangerous, who is rebuilding, who is in denial.

## Machine-readable rankings

After the final post, and **after** a line containing only `%%%`, output a
fenced `json` block listing the final order:

```json
[
  { "rank": 1, "team": "wizardbeef" },
  { "rank": 2, "team": "Jack Daniels" }
]
```

Team names must match the context exactly, character for character.
