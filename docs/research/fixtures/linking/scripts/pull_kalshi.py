import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phttp as H
BASE = H.BASE
out = []
cursor = None
t0 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
npages = int(sys.argv[1]) if len(sys.argv) > 1 else 10
for page in range(npages):
    url = "https://external-api.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200"
    if cursor:
        url += "&cursor=" + cursor
    s, j = H.get_json(url)
    if s != 200 or not j:
        print("page", page, "status", s, (j or "")[:200] if isinstance(j, str) else "")
        break
    evs = j.get("events", [])
    out.extend(evs)
    cursor = j.get("cursor")
    print("page", page, len(evs), "cursor", bool(cursor))
    if not cursor:
        break
json.dump({"fetched_at": t0, "events": out}, open(os.path.join(BASE, "raw", "kalshi_events.json"), "w"))
print("total events", len(out), "markets", sum(len(e.get("markets", []) or []) for e in out))
