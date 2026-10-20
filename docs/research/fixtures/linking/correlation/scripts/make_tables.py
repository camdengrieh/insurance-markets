"""Assemble markdown tables + multiple-testing summary from out/res/*.json etc.  usage: python3 -I src/make_tables.py > out/tables.md"""
import builtins, glob, json, math, os, sys

_print = builtins.print
def print(*a, **k):
    _print(*[x.replace("%%", "%") if isinstance(x, str) else x for x in a], **k)
OUT = os.environ.get("PM_OUT_DIR", "out")
R = {}
for f in sorted(glob.glob(os.path.join(OUT, "res", "*.json"))):
    r = json.load(open(f)); R[r["id"]] = r
REG = json.load(open(os.path.join(OUT, "registry.json")))
ORDER = [c["id"] for c in REG["clusters"]]
KIND = {"XV": "same-event", "LAD": "ladder", "PC": "parent/child", "IDENT": "identity", "FAC": "factor"}

def f(x, nd=3, pct=False, cents=False):
    if x is None: return "n/a"
    if isinstance(x, str): return x
    if x != x: return "n/a"
    if cents: return ("%+.2f" % (x * 100))
    if pct: return ("%.1f%%" % (x * 100))
    return ("%." + str(nd) + "f") % x

def ci(c, nd=2):
    return "[%s, %s]" % (f(c[0], nd), f(c[1], nd)) if c else "n/a"

def bh(pvals, q=0.10):
    m = len(pvals)
    idx = sorted(range(m), key=lambda i: pvals[i])
    thr = -1
    for rank, i in enumerate(idx, 1):
        if pvals[i] <= q * rank / m: thr = rank
    ok = set(idx[:thr]) if thr > 0 else set()
    return ok

print("## T1. Panel (%d relationships, %d legs; snapshot %s)\n" % (len(R), len(REG["legs"]), json.load(open(os.path.join(OUT, "meta.json")))["t0_iso"]))
print("| id | type | x (first leg) | y (second leg) | venues | note |\n|---|---|---|---|---|---|")
for k in ORDER:
    r = R[k]
    print("| %s | %s | %s | %s | %s | %s |" % (k, KIND[r["kind"]], r["x"], r["y"], "+".join(r["venues"]), (r.get("note") or "")[:260]))

print("\n## T2. Return correlation of mid-price changes (probability points), 95%% block-bootstrap CI\n")
print("| id | 5m rho [CI] (n) | share bins with x/y change | 10m non-overlap rho | 1h rho [CI] (n) | 1d rho [CI] (n) |\n|---|---|---|---|---|---|")
for k in ORDER:
    r = R[k]; c = r["corr"]
    def cell(d, nd=2):
        if not d or d.get("n", 0) < 30 or d.get("rho") is None: return "n/a (n=%s)" % (d or {}).get("n")
        return "%s %s (%d)" % (f(d["rho"], nd), ci(d.get("ci"), nd), d["n"])
    d5 = c.get("5m", {})
    nz = "%s / %s" % (f(d5.get("frac_nonzero_x"), 3), f(d5.get("frac_nonzero_y"), 3)) if d5.get("n") else "n/a"
    print("| %s | %s | %s | %s | %s | %s |" % (k, cell(c.get("5m")), nz, f((c.get("10m_nonoverlap") or {}).get("rho"), 2), cell(c.get("1h")), cell(c.get("1d"))))

print("\n## T3. Lead-lag: sign-aware asymmetry LAM (>0: x leads y), PRIMARY alignment; sensitivity alignment in last column\n")
print("LAM = sgn * sum_k=1..K [rho(+k) - rho(-k)]; 95%% CI by 2-hour block bootstrap (1m, 5m) / 1-day (1h); p = circular-shift permutation test; * = BH-significant (q=0.10) across all tests in this table.\n")
tests = []
for k in ORDER:
    r = R[k]
    for key in ("1m_primary", "5m_primary", "1h"):
        c = r["ccf"].get(key)
        if c and not c.get("insufficient") and c.get("lam_p_shift") is not None:
            tests.append((k, key, c))
pv = [t[2]["lam_p_shift"] for t in tests]
sig = bh(pv, 0.10)
sigset = {(tests[i][0], tests[i][1]) for i in sig}
print("| id | grid | events x/y | rho0 | LAM [CI] | p_shift | BH | peak lag (bins; unit) | sens. alignment LAM [CI] |\n|---|---|---|---|---|---|---|---|---|")
unit = {"1m_primary": "1 min", "5m_primary": "5 min", "1h": "1 h"}
for k in ORDER:
    r = R[k]
    for key in ("1m_primary", "5m_primary", "1h"):
        c = r["ccf"].get(key)
        if not c: continue
        if c.get("insufficient"):
            print("| %s | %s | %s/%s | insufficient events (<20) | | | | | |" % (k, key.split("_")[0], c.get("n_events_x"), c.get("n_events_y"))); continue
        sk = r["ccf"].get(key.replace("primary", "sens"))
        sens = "%s %s" % (f(sk["lam"], 2), ci(sk["lam_ci"], 2)) if sk and not sk.get("insufficient") else "-"
        print("| %s | %s | %d/%d | %s | %s %s | %s | %s | %+d (%s) | %s |" % (k, key.split("_")[0], c["n_events_x"], c["n_events_y"], f(c["rho0"], 2), f(c["lam"], 3), ci(c["lam_ci"], 2), f(c["lam_p_shift"], 3), "*" if (k, key) in sigset else "", c["peak_lag_bins"], unit[key], sens))
print("\nTests in family: %d; raw p<0.05: %d; BH(q=0.10) significant: %d.\n" % (len(tests), sum(1 for p in pv if p < 0.05), len(sig)))
for i in sorted(sig, key=lambda i: pv[i]):
    k, key, c = tests[i]
    print("- BH-significant: %s %s LAM=%s %s p=%s (x=%s -> y=%s) %s" % (k, key, f(c["lam"], 3), ci(c["lam_ci"], 2), f(c["lam_p_shift"], 3), R[k]["x"], R[k]["y"], "x leads" if c["lam"] > 0 else "y leads"))

print("\n## T3b. Event-response lead-lag (sparse mid moves). S>0: x leads y. PRIMARY alignment.\n")
print("| id | window | x events | x followed/preceded by y | y events | y followed/preceded by x | S | p_shift | BH |\n|---|---|---|---|---|---|---|---|---|")
etests = []
for k in ORDER:
    for key, e in (R[k].get("event") or {}).items():
        if key.endswith("primary") and not e.get("insufficient") and e.get("n_events_x", 0) >= 20 and e.get("n_events_y", 0) >= 20:
            etests.append((k, key, e))
ep = [t[2]["p_shift"] for t in etests]
esig = bh(ep, 0.10)
esigset = {(etests[i][0], etests[i][1]) for i in esig}
for k, key, e in etests:
    print("| %s | %s | %d | %s / %s | %d | %s / %s | %s | %s | %s |" % (k, key.replace("_primary", ""), e["n_events_x"], f(e["x_followed"], 2), f(e["x_preceded"], 2), e["n_events_y"], f(e["y_followed"], 2), f(e["y_preceded"], 2), f(e["S"], 2), f(e["p_shift"], 3), "*" if (k, key) in esigset else ""))
print("\nEvent tests in family: %d; raw p<0.05: %d; BH significant: %d.\n" % (len(etests), sum(1 for p in ep if p < 0.05), len(esig)))

print("\n## T4. Same-event pairs: spread = Polymarket mid - Kalshi mid (probability points)\n")
print("| id | hourly n | mean (c) | sd (c) | 5-95% (c) | AR(1) phi hourly [95%% CI] | half-life 1h-grid (h) | phi 5m (30d) | half-life 5m-grid (h) | DF t (1h) | frac hours gap>entry fees | gap>2x fees | gap>all round-trip costs |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for k in ORDER:
    r = R[k]
    if "spread" not in r: continue
    S = r["spread"]; h1 = S.get("1h", {}); h5 = S.get("5m_k", {}); w = S.get("waterfall_1h", {})
    print("| %s | %s | %s | %s | %s..%s | %s %s | %s | %s | %s | %s | %s | %s | %s |" % (k, h1.get("n"), f(h1.get("mean"), cents=True), f((h1.get("sd") or 0) * 100, 2), f((h1.get("p05") or 0) * 100, 1), f((h1.get("p95") or 0) * 100, 1), f(h1.get("phi"), 3), ci(h1.get("phi_ci"), 3), f(h1.get("half_life_h"), 1), f(h5.get("phi"), 3) if h5.get("n", 0) > 100 else "n/a", f(h5.get("half_life_h"), 1) if h5.get("n", 0) > 100 else "n/a", f(h1.get("df_t"), 1), f(w.get("frac_mid_gap_gt_entry_fees"), 2), f(w.get("frac_mid_gap_gt_2x_fees_roundtrip_fees_only"), 2), f(w.get("frac_mid_gap_gt_roundtrip_all_costs"), 2)))

print("\n## T5. Edge attrition (hourly, dollar-weighted): share of the apparent mid gap that survives each friction\n")
print("| id | mean gap (c) | median days to resolution | after spread | after taker fees | after 5%% ann. hurdle | after 20%% ann. hurdle | close-out trade | hours net>0 | hours net ann>5%% | best net ann. |\n|---|---|---|---|---|---|---|---|---|---|---|")
acc = {k: [] for k in ("survives_after_spread", "survives_after_fees", "survives_after_5pct_ann_hurdle", "survives_after_20pct_ann_hurdle", "survives_closeout_trade")}
for k in ORDER:
    r = R[k]
    w = (r.get("spread") or {}).get("waterfall_1h")
    if not w or "attrition" not in w: continue
    a = w["attrition"]
    for kk in acc: acc[kk].append(a[kk])
    print("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (k, f(a["mean_apparent_gap"] * 100, 2), f(w["median_days_to_res"], 0), f(a["survives_after_spread"], 2, pct=True), f(a["survives_after_fees"], 2, pct=True), f(a["survives_after_5pct_ann_hurdle"], 2, pct=True), f(a["survives_after_20pct_ann_hurdle"], 2, pct=True), f(a["survives_closeout_trade"], 2, pct=True), f(w["frac_net_after_fees_gt0"], 3, pct=True), f(w["frac_net_ann_gt_5pct"], 3, pct=True), f(w["best_ann_net"], 3, pct=True)))
import statistics as st
print("| **mean over pairs** | | | %s | %s | %s | %s | %s | | | |" % tuple(f(st.mean(acc[kk]), 1, pct=True) for kk in acc))
print("| **median over pairs** | | | %s | %s | %s | %s | %s | | | |" % tuple(f(st.median(acc[kk]), 1, pct=True) for kk in acc))
print("\n(Assumptions: Polymarket half-spread fixed at the T0 snapshot value; Kalshi bid/ask from candle closes; taker fees PM feeSchedule rate*p(1-p), Kalshi 0.07*p(1-p) [secondary source]; hold to resolution; capital = cost of both legs.)\n")

print("\n## T5b. Mean-reversion (pairs) back-test on the hourly spread, trailing-168h z-score, entry |z|>2, exit |z|<0.5 or 48h\n")
print("| id | trades | mean gross (c) | hit rate gross | mean hold (h) | assumed round-trip cost (c) | mean net (c) | share trades gross>cost |\n|---|---|---|---|---|---|---|---|")
for k in ORDER:
    b = (R[k].get("spread") or {}).get("pairs_backtest_1h")
    if not b or not b.get("n_trades"): continue
    print("| %s | %d | %s | %s | %s | %s | %s | %s |" % (k, b["n_trades"], f(b["mean_gross"], cents=True), f(b["hit_rate_gross"], 2), f(b["mean_hold_h"], 1), f(b["assumed_round_trip_cost"] * 100, 2), f(b["mean_net"], cents=True), f(b["frac_trades_gross_gt_cost"], 2)))

print("\n## T6. Logical constraints on MID prices (NOT executable). violation = child - parent > 0 (ladder/implication) or |sum(children) - parent| (identity)\n")
print("| id | grid | n | mean child-parent (c) | frac >0.5c | >1c | >2c | >3c | runs >1c (count, median h, max h) | frac time >1c | frac > spreads+fees | snapshot exec edge (c) |\n|---|---|---|---|---|---|---|---|---|---|---|---|")
for k in ORDER:
    r = R[k]
    if "logic" not in r: continue
    L = r["logic"]
    snap = L.get("snapshot_exec", {})
    se = snap.get("child_bid_minus_parent_ask", snap.get("sum_child_bids_minus_parent_ask"))
    if "parent_bid_minus_sum_child_asks" in snap: se = max(snap["sum_child_bids_minus_parent_ask"], snap["parent_bid_minus_sum_child_asks"])
    for g in ("1h", "5m_pm", "5m_k"):
        d = L.get(g)
        if not d or d.get("n", 0) < 50: continue
        fg = d["frac_gt"]; rr = d.get("runs_gt_1c", {})
        print("| %s | %s | %d | %s | %s | %s | %s | %s | %s,%s,%s | %s | %s | %s |" % (k, g, d["n"], f(d["mean_signed"], cents=True), f(fg["0.005"], 3), f(fg["0.01"], 3), f(fg["0.02"], 3), f(fg["0.03"], 3), rr.get("count"), f(rr.get("median_len_h"), 1), f(rr.get("max_len_h"), 0), f(rr.get("frac_time"), 3), f(d.get("frac_gt_costs"), 3) if g == "1h" else "", f(se * 100, 1) if se is not None and g == "1h" else ""))

print("\n## T7. Hedge ratio: regress y on x (first differences). beta in-sample; variance reduction out-of-sample (beta fitted on first 60%%, evaluated on last 40%%)\n")
print("| id | 5m beta / OOS VR | 1h beta (train, test) / OOS VR | 1d beta (train, test) / OOS VR |\n|---|---|---|---|")
for k in ORDER:
    r = R[k]; h = r["hedge"]
    def hc(d):
        if not d or d.get("n", 0) < 60: return "n/a"
        return "%s (%s, %s) / %s" % (f(d["beta"], 2), f(d["beta_train"], 2), f(d["beta_test"], 2), f(d["vr_oos"], 3, pct=True))
    d5 = h.get("5m", {})
    print("| %s | %s | %s | %s |" % (k, ("%s / %s" % (f(d5["beta"], 2), f(d5["vr_oos"], 3, pct=True))) if d5.get("n", 0) >= 60 else "n/a", hc(h.get("1h")), hc(h.get("1d"))))

print("\n## T8. Economic test of lead-lag (follow leader's move for one bin; pay spread + 2 taker fees). n>=30 rows only\n")
E = json.load(open(os.path.join(OUT, "leadlag_econ.json")))
good = [e for e in E if e.get("n", 0) >= 30]
print("Rows with n>=30: %d; positive mean net: %d; positive mean gross: %d; gross t>3: %d; gross t>3 AND net>0: %d\n" % (len(good), sum(1 for e in good if e["mean_net"] > 0), sum(1 for e in good if e["mean_gross"] > 0), sum(1 for e in good if (e["t_gross"] or 0) > 3), sum(1 for e in good if (e["t_gross"] or 0) > 3 and e["mean_net"] > 0)))
print("| cluster | leader -> follower | grid | theta (c) | n | mean gross (c) | t gross | mean net (c) | OOS n | OOS gross (c) | OOS net (c) |\n|---|---|---|---|---|---|---|---|---|---|---|")
for e in sorted(good, key=lambda e: -(e["t_gross"] or -99))[:12]:
    print("| %s | %s -> %s | %s | %.1f | %d | %s | %s | %s | %s | %s | %s |" % (e["cluster"], e["leader"], e["follower"], e["grid"], e["theta"] * 100, e["n"], f(e["mean_gross"], cents=True), f(e["t_gross"], 2), f(e["mean_net"], cents=True), e.get("n_oos", ""), f(e.get("mean_gross_oos"), cents=True) if e.get("mean_gross_oos") is not None else "", f(e.get("mean_net_oos"), cents=True) if e.get("mean_net_oos") is not None else ""))
print("\nPositive-net rows:")
for e in good:
    if e["mean_net"] > 0:
        print("- %s %s->%s %s theta=%.1fc n=%d gross=%sc net=%sc (t_net=%s)" % (e["cluster"], e["leader"], e["follower"], e["grid"], e["theta"] * 100, e["n"], f(e["mean_gross"], cents=True), f(e["mean_net"], cents=True), f(e["t_net"], 2)))

print("\n## T9. Leg diagnostics (5-minute grid, mid prices)\n")
D = json.load(open(os.path.join(OUT, "leg_diag.json")))
print("| leg | venue | bins | share bins with zero mid change | n changes | median |change| (c) | lag-1 autocorr of mid diffs | lag-1 autocorr of trade-price diffs (Kalshi) | mean spread (c) |\n|---|---|---|---|---|---|---|---|---|")
for k, d in D.items():
    sp = d.get("mean_spread") if d["venue"] == "K" else d.get("snapshot_spread")
    print("| %s | %s | %d | %s | %d | %s | %s | %s | %s |" % (k, d["venue"], d["n_bins"], f(d["share_zero_change"], 3), d["n_changes"], f((d.get("median_abs_change") or 0) * 100, 2), f(d.get("ac1_mid_diff"), 3), f(d.get("ac1_trade_price_diff"), 3), f((sp or 0) * 100, 2) if sp is not None else "n/a"))
