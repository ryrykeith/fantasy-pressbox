# Legacy

`fetch-sleeper-data.py` is the original script this project grew out of. It
fetched one week of Sleeper data into a JSON file, which was then pasted into
ChatGPT by hand.

It is kept here for reference only. Nothing in the project uses it, and it is
no longer maintained.

It was replaced because:

- it required Python plus the third-party `requests` package, which many
  people do not have; the Node version needs nothing but Node itself
- the league ID was hard-coded, so it only worked for one league
- it fetched a single hard-coded week
- it did no normalization, so player IDs never became player names, and
  nothing computed potential points, lineup efficiency or awards

Everything it did is now `node src/cli.mjs fetch`.
