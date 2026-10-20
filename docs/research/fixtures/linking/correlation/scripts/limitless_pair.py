"""Limitless vs Polymarket clone markets: 'What price will Ethereum hit October 12-18?' (same title, same week on both venues).
Limitless GET /markets/{slug}/historical-price?interval=1w gives ~30-min points over the market's 6.6-day life (public, no auth).
Polymarket: Data API v2 5-minute buckets.  Pairs analysed on a 30-min grid: dip-to-$2,300 and dip-to-$2,200 rungs.
usage: python3 -I src/limitless_pair.py -> out/limitless_pair.json"""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pmhttp as h
import lib
D = "https://data-api.polymarket.com/v2"
L = "https://api.limitless.exchange"
T0 = int(open("out/t0.txt").read())
ev = json.load(open("out/poly_open_events.json"))
lim = json.load(open("out/limitless_active.json"))
subs = {s["title"]: s for s in lim[0]["markets"]}
pm_rows = {}
for e in ev:
    if e["slug"].startswith("what-price-will-ethereum-hit-october-12-18"):
        for m in e["markets"]:
            if not m.get("closed"):
                pm_rows[m["question"]] = m
out = {}
for (ltitle, pq) in (("↓ 2,300", "Will Ethereum dip to $2,300 October 12-18?"), ("↓ 2,200", "Will Ethereum dip to $2,200 October 12-18?"),
                     ("↑ 2,600", "Will Ethereum reach $2,600 October 12-18?")):
    m = pm_rows[pq]
    tok = json.loads(m["clobTokenIds"])[0]
    pts = []
    d = h.get_json(D + "/prices-history", {"token_id": tok, "start": T0 - 8 * 86400, "end": T0, "bucket_seconds": 300, "limit": 10000})
    pts = [(p["timestamp"], p["price"]) for p in d["data"] if p["resolution_seconds"] > 0]
    ld = h.get_json(L + "/markets/%s/historical-price" % subs[ltitle]["slug"], {"interval": "1w"})
    lpts = sorted((int(p["timestamp"]) // 1000, p["price"]) for p in ld["prices"])
    variants = {}
    for vname, shift in (("labels_as_known_time", 0), ("limitless_known_at_label_plus_30m", 1800)):
        lp2 = [(t + shift, p) for t, p in lpts]
        start = (lp2[0][0] + 1799) // 1800 * 1800
        n = (T0 - start) // 1800 - 2
        pmv = lib.locf(sorted(pts), start, 1800, n)           # PM: bucket label time = known time (alpha 0, as in main study)
        lv = lib.locf(lp2, start, 1800, n)
        s = [None if a is None or b is None else a - b for a, b in zip(pmv, lv)]
        sc = [v for v in s if v is not None]
        dpm, dl = lib.diffs(pmv), lib.diffs(lv)
        xs, ys, _ = lib.pair_clean(dpm, dl)
        row = {"n_bins_30m": len(sc), "mean_spread_pm_minus_lim": lib.mean(sc), "sd_spread": lib.sd(sc), "min": min(sc), "max": max(sc),
               "corr_diff_30m": lib.pearson(xs, ys) if len(xs) > 30 else None,
               "n_nonzero_pm": sum(1 for v in xs if v != 0), "n_nonzero_lim": sum(1 for v in ys if v != 0),
               "level_corr": lib.pearson([a for a, b in zip(pmv, lv) if a is not None and b is not None], [b for a, b in zip(pmv, lv) if a is not None and b is not None])}
        phi, se, c, sig = lib.ar1(sc)
        row.update({"ar1_phi": phi, "ar1_se": se, "half_life_h": lib.half_life(phi, 0.5), "df_t": lib.df_tstat(sc)})
        if row["n_nonzero_pm"] >= 20 and row["n_nonzero_lim"] >= 20:
            bb = lib.block_bootstrap_ccf(xs, ys, 3, 8, B=500, seed=5)
            if bb:
                row["ccf"] = {str(k): round(bb["rho"][k], 3) for k in bb["rho"]}
                row["lam"] = bb["lam"]; row["lam_ci"] = list(bb["lam_ci"]); row["lam_sgn"] = bb["sgn"]
        row["frac_abs_gt"] = {str(t): sum(1 for v in sc if abs(v) > t) / len(sc) for t in (0.01, 0.02, 0.05)}
        variants[vname] = row
    row = {"limitless_slug": subs[ltitle]["slug"], "pm_question": pq, "limitless_points": len(lpts),
           "lim_distinct_prices": len(set(p for t, p in lpts)), "pm_distinct_prices": len(set(p for t, p in pts)), "variants": variants}
    out[ltitle] = row
    for vn, v in variants.items():
        print(ltitle, vn, {k: (round(x, 4) if isinstance(x, float) else x) for k, x in v.items() if k not in ("ccf", "lam_ci")}, v.get("ccf"))
json.dump(out, open("out/limitless_pair.json", "w"), indent=1)
