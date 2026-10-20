"""Sensitivity of the edge-attrition result to the two assumptions that are NOT first-hand: the Polymarket historical half-spread
(historic bid/ask is not published; we use the T0 snapshot) and the Kalshi taker-fee coefficient (0.07, secondary source).
Scenarios: base | PM spread 0 (mid fills) | Kalshi fee x0.5 | both | zero fees and zero PM spread (pure Kalshi-spread friction).
usage: python3 -I src/sensitivity_frictions.py -> out/sensitivity_frictions.json"""
import json, os, sys, statistics as st
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_study as rs

SC = {"base": (0.07, None), "pm_spread_0": (0.07, 0.0), "kalshi_fee_x0.5": (0.035, None), "both": (0.035, 0.0), "no_fees_no_pm_spread": (0.0, 0.0)}
orig_hs, orig_pf = rs.pm_halfspread, rs.pm_fee_rate
out = {}
for name, (kfee, hs) in SC.items():
    rs.KFEE = kfee
    rs.pm_halfspread = (lambda leg, hs=hs: hs) if hs is not None else orig_hs
    if name == "no_fees_no_pm_spread":
        rs.pm_fee_rate = lambda leg: 0.0
    else:
        rs.pm_fee_rate = orig_pf
    rows = {}
    for cl in rs.CL:
        if cl["kind"] != "XV": continue
        rs._valid_from[0] = 0; rs._valid_to[0] = rs.res_ts(cl["valid_to"]) if cl.get("valid_to") else None
        r = rs.spread_analysis(cl)
        w = r.get("waterfall_1h")
        if w and "attrition" in w:
            rows[cl["id"]] = {k: w["attrition"][k] for k in ("survives_after_spread", "survives_after_fees", "survives_after_5pct_ann_hurdle", "survives_after_20pct_ann_hurdle", "survives_closeout_trade")}
            rows[cl["id"]]["hours_net_gt0"] = w["frac_net_after_fees_gt0"]
            rows[cl["id"]]["hours_net_ann_gt5"] = w["frac_net_ann_gt_5pct"]
    keys = ["survives_after_spread", "survives_after_fees", "survives_after_5pct_ann_hurdle", "survives_after_20pct_ann_hurdle", "survives_closeout_trade", "hours_net_gt0", "hours_net_ann_gt5"]
    out[name] = {"mean": {k: st.mean(v[k] for v in rows.values()) for k in keys}, "median": {k: st.median(v[k] for v in rows.values()) for k in keys}, "n_pairs": len(rows)}
    print(name, {k: round(v, 3) for k, v in out[name]["mean"].items()})
json.dump(rs.jsonable(out), open("out/sensitivity_frictions.json", "w"), indent=1)
