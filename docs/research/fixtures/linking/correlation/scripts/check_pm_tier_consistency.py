"""Which 1-minute value does a Polymarket 5-minute (and 30-minute) bucket value equal?  Compare bucket (label t, width W) with the 1-minute series at
t + j*60 for j = 0..W/60-1 (and one bucket later).  The offset with the highest exact-match rate shows how the server aggregates a bucket
(open = j 0, close = last minute, other = in between).  Only buckets where the 1-minute value changes inside the bucket are informative, so
matches are reported separately for such 'informative' buckets.   usage: python3 -I src/check_pm_tier_consistency.py -> out/check_pm_tier.json"""
import json, os, sys
OUT = os.environ.get("PM_OUT_DIR", "out")
reg = json.load(open(os.path.join(OUT, "registry.json")))["legs"]
res = {}
tot = {}
for leg, L in reg.items():
    if L["venue"] != "PM": continue
    d = json.load(open(os.path.join(OUT, "series", leg + ".json")))
    m1 = {t: p for (t, p, r) in d["1m"] if r == 60}
    for tier, W in (("5m", 300),):
        info = 0; cnt = {j: 0 for j in range(-1, 6)}
        for (t, p, r) in d[tier]:
            if r != W: continue
            vals = [m1.get(t + 60 * j) for j in range(0, W // 60)]
            if any(v is None for v in vals): continue
            if len(set(vals)) == 1: continue          # uninformative: price constant inside the bucket
            info += 1
            for j in range(0, W // 60):
                if abs(vals[j] - p) < 1e-9: cnt[j] += 1
            nxt = m1.get(t + W)
            if nxt is not None and abs(nxt - p) < 1e-9: cnt[5] += 1
            prv = m1.get(t - 60)
            if prv is not None and abs(prv - p) < 1e-9: cnt[-1] += 1
        res[leg] = {"informative_buckets": info, "match_by_offset_min": {str(j): cnt[j] for j in cnt}}
        for j in cnt: tot.setdefault(str(j), 0); tot[str(j)] += cnt[j]
        tot["informative"] = tot.get("informative", 0) + info
print("total informative 5-min buckets:", tot["informative"])
for j in range(-1, 6):
    print("1-min value at label%+d min (j=%d; 5 = value at label+5min, -1 = label-1min): exact match %d / %d = %.3f" % (j, j, tot[str(j)], tot["informative"], tot[str(j)] / max(1, tot["informative"])))
json.dump({"total": tot, "by_leg": res}, open(os.path.join(OUT, "check_pm_tier.json"), "w"), indent=1)
