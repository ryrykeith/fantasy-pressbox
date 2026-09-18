import json
import requests

LEAGUE_ID = "YOUR_SLEEPER_LEAGUE_ID"
BASE = "https://api.sleeper.app/v1"

data = {
    "league": requests.get(f"{BASE}/league/{LEAGUE_ID}").json(),
    "users": requests.get(f"{BASE}/league/{LEAGUE_ID}/users").json(),
    "rosters": requests.get(f"{BASE}/league/{LEAGUE_ID}/rosters").json(),
    "week_2_matchups": requests.get(
        f"{BASE}/league/{LEAGUE_ID}/matchups/2"
    ).json(),
    "week_2_transactions": requests.get(
        f"{BASE}/league/{LEAGUE_ID}/transactions/2"
    ).json(),
}

with open("league_week2_bundle.json", "w") as f:
    json.dump(data, f, indent=2)

print("Created league_week2_bundle.json")