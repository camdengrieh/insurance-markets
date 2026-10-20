"""Per-leg microstructure diagnostics on the 5-minute grid (mid prices), plus Kalshi trade-price vs mid comparison
(bid-ask bounce).  Writes out/leg_diag.json."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
import run_study as rs

def ac1(d):
    xs = [v for v in d if v is not None]
    if len(xs) < 50: return None
    pairs = [(d[i], d[i+1]) for i in range(len(d)-1) if d[i] is not None and d[i+1] is not None]
    return lib.pearson([a for a, b in pairs], [b for a, b in pairs])

out = {}
for name, L in rs.LEGS.items():
    g = "5m_pm" if L["venue"] == "PM" else "5m_k"
    v = rs.grid_values(name, g, alpha=rs.PA)
    d = lib.diffs(v)
    dv = [x for x in d if x is not None]
    if not dv: continue
    nz = [x for x in dv if x != 0.0]
    row = {"venue": L["venue"], "grid": g, "n_bins": len(dv), "share_zero_change": 1 - len(nz) / len(dv), "n_changes": len(nz),
           "median_abs_change": lib.quantile([abs(x) for x in nz], 0.5) if nz else None, "ac1_mid_diff": ac1(d)}
    if L["venue"] == "K":
        # trade-price series (last trade close) vs mid
        start, step, n = rs.GRIDS[g]
        obs = [(r[0], r[3]) for r in rs.load(name)["1m"] if r[3] is not None]
        tv = lib.locf(sorted(obs), start, step, n)
        td = lib.diffs(tv)
        row["ac1_trade_price_diff"] = ac1(td)
        row["share_zero_change_trade"] = (sum(1 for x in td if x == 0.0) / max(1, sum(1 for x in td if x is not None)))
        bid = rs.grid_values(name, g, which="bid"); ask = rs.grid_values(name, g, which="ask")
        sp = [a - b for a, b in zip(ask, bid) if a is not None and b is not None]
        row["mean_spread"] = lib.mean(sp) if sp else None
        row["median_spread"] = lib.quantile(sp, 0.5) if sp else None
    else:
        try:
            b_, a_ = float(L["snap_bid"]), float(L["snap_ask"])
            row["snapshot_spread"] = a_ - b_
        except Exception:
            row["snapshot_spread"] = None
    out[name] = row
json.dump(rs.jsonable(out), open("out/leg_diag.json", "w"), indent=0)
for k, r in out.items():
    print("%-16s %-3s n=%5d zero=%.3f chg=%4d ac1=%s ac1_trade=%s spread=%s" % (k, r["venue"], r["n_bins"], r["share_zero_change"], r["n_changes"],
          None if r["ac1_mid_diff"] is None else round(r["ac1_mid_diff"], 3), None if r.get("ac1_trade_price_diff") is None else round(r["ac1_trade_price_diff"], 3),
          r.get("mean_spread") if r.get("mean_spread") is None else round(r["mean_spread"], 4) if r["venue"] == "K" else r.get("snapshot_spread")))
