import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phttp as H
BASE = H.BASE
out = []
cursor = None
t0 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
for page in range(int(sys.argv[1]) if len(sys.argv) > 1 else 8):
    url = "https://gamma-api.polymarket.com/events/keyset?closed=false&limit=100&order=volume24hr&ascending=false"
    if cursor:
        url += "&after_cursor=" + cursor
    s, j = H.get_json(url)
    if s != 200 or not j:
        print("page", page, "status", s)
        break
    evs = j.get("events", [])
    out.extend(evs)
    cursor = j.get("next_cursor")
    print("page", page, len(evs), "cursor", bool(cursor))
    if not cursor:
        break
json.dump({"fetched_at": t0, "events": out}, open(os.path.join(BASE, "raw", "poly_events.json"), "w"))
print("total events", len(out), "markets", sum(len(e.get("markets", [])) for e in out))
