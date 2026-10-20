"""Consistency check: last-observation-carried-forward of Kalshi 1-minute candle bid/ask closes must equal the 60-minute candle bid/ask closes.
If sparse 1-minute candles missed quote-only updates, LOCF would disagree.  usage: python3 -I src/check_kalshi_locf.py -> out/check_kalshi_locf.json"""
import bisect, json, os, sys
OUT = os.environ.get("PM_OUT_DIR", "out")
reg = json.load(open(os.path.join(OUT, "registry.json")))["legs"]
res = {}
for leg, L in reg.items():
    if L["venue"] != "K" or L.get("resolved"): continue
    d = json.load(open(os.path.join(OUT, "series", leg + ".json")))
    r1 = [(r[0], r[1], r[2]) for r in d["1m"] if r[1] is not None and r[2] is not None]
    r60 = [(r[0], r[1], r[2]) for r in d["60m"] if r[1] is not None and r[2] is not None]
    if not r1 or not r60: continue
    t1 = [r[0] for r in r1]
    n = ab = aa = 0
    for (e, b, a) in r60:
        if e < r1[0][0] + 3600: continue
        i = bisect.bisect_right(t1, e) - 1
        if i < 0: continue
        n += 1; ab += abs(r1[i][1] - b) < 1e-9; aa += abs(r1[i][2] - a) < 1e-9
    res[leg] = {"hours_compared": n, "bid_agree": ab / n if n else None, "ask_agree": aa / n if n else None}
tot = sum(v["hours_compared"] for v in res.values())
print({k: (v["hours_compared"], round(v["bid_agree"], 4), round(v["ask_agree"], 4)) for k, v in res.items()}, "total", tot)
json.dump({"by_leg": res, "total_hours_compared": tot}, open(os.path.join(OUT, "check_kalshi_locf.json"), "w"), indent=1)
