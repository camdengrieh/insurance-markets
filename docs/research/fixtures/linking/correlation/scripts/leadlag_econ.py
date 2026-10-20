"""Economic test of lead-lag: follow the leader's move in the follower for one bin, pay realistic frictions.

Rule (fixed ex-ante, no fitting): at the close of bin t, if |dL_t| >= theta and sign agrees, trade the FOLLOWER in the direction of
the leader's move at the follower's quotes known at close of bin t (buy at ask / sell at bid), exit at the opposite quote at close of
bin t+1.  Kalshi follower: candle bid/ask closes.  Polymarket follower: mid +/- snapshot half-spread (historic PM bid/ask unavailable).
Fees: taker fee at entry and at exit (Polymarket feeSchedule rate or Kalshi 0.07, times p(1-p)).
We report all (pair, direction, grid, theta) combinations (no cherry-picking), full sample and last-40% hold-out.
usage: python3 -I src/leadlag_econ.py   -> out/leadlag_econ.json
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
import run_study as rs

def legs_of(cl):
    k = cl["kind"]
    if k in ("XV", "FAC"): return cl["a"], cl["b"]
    if k == "LAD": return cl["hi"], cl["lo"]
    if k == "PC": return cl["parent"], cl["child"]
    return None

def quotes(leg, g):
    L = rs.LEGS[leg]
    mid = rs.grid_values(leg, g, alpha=rs.PA)
    if L["venue"] == "K":
        bid = rs.grid_values(leg, g, which="bid"); ask = rs.grid_values(leg, g, which="ask")
    else:
        hp = rs.pm_halfspread(leg)
        bid = [None if m is None else max(0.0, m - hp) for m in mid]
        ask = [None if m is None else min(1.0, m + hp) for m in mid]
    return mid, bid, ask

def feerate(leg):
    return rs.KFEE if rs.LEGS[leg]["venue"] == "K" else rs.pm_fee_rate(leg)

def tstat(v):
    n = len(v)
    if n < 3: return float("nan")
    s = lib.sd(v)
    return lib.mean(v) / (s / math.sqrt(n)) if s > 0 else float("nan")

def run(leader, follower, g, theta, hold=1):
    lm, lb, la = quotes(leader, g)
    fm, fb, fa = quotes(follower, g)
    n = len(lm)
    fee = feerate(follower)
    trades = []
    for t in range(1, n - hold):
        if None in (lm[t], lm[t-1], fm[t], fm[t-hold+0], fb[t], fa[t], fb[t+hold], fa[t+hold], fm[t+hold], fm[t-1]):
            continue
        dl = lm[t] - lm[t-1]
        df = fm[t] - fm[t-1]
        if abs(dl) < theta - 1e-12:
            continue
        s = 1 if dl > 0 else -1
        if df * s >= abs(dl) - 1e-12:      # follower already moved at least as much in the same bin: nothing left to follow
            continue
        entry = fa[t] if s > 0 else fb[t]
        exit_ = fb[t+hold] if s > 0 else fa[t+hold]
        gross = s * (fm[t+hold] - fm[t])
        net = s * (exit_ - entry) - lib.fee_quadratic(entry, fee) - lib.fee_quadratic(exit_, fee)
        trades.append((t, gross, net))
    return trades

def summarize(trades):
    if len(trades) < 5: return {"n": len(trades)}
    g = [x[1] for x in trades]; nn = [x[2] for x in trades]
    cut = int(0.6 * len(trades))
    oos = trades[cut:]
    d = {"n": len(trades), "mean_gross": lib.mean(g), "t_gross": tstat(g), "mean_net": lib.mean(nn), "t_net": tstat(nn),
         "hit_gross": sum(1 for v in g if v > 0) / len(g)}
    if len(oos) >= 5:
        go = [x[1] for x in oos]; no = [x[2] for x in oos]
        d.update({"n_oos": len(oos), "mean_gross_oos": lib.mean(go), "t_gross_oos": tstat(go), "mean_net_oos": lib.mean(no), "t_net_oos": tstat(no)})
    return d

if __name__ == "__main__":
    out = []
    for cl in rs.CL:
        lg = legs_of(cl)
        if not lg: continue
        rs._valid_from[0] = rs.res_ts(cl["valid_from"]) if cl.get("valid_from") else 0
        rs._valid_to[0] = rs.res_ts(cl["valid_to"]) if cl.get("valid_to") else None
        a, b = lg
        has_k = "K" in {rs.LEGS[a]["venue"], rs.LEGS[b]["venue"]}
        for g in (("5m_k" if has_k else "5m_pm"), "1h"):
            for (ld, fl) in ((a, b), (b, a)):
                for theta in (0.005, 0.01, 0.02):
                    tr = run(ld, fl, g, theta)
                    row = {"cluster": cl["id"], "kind": cl["kind"], "leader": ld, "follower": fl, "grid": g, "theta": theta}
                    row.update(summarize(tr))
                    out.append(row)
    json.dump(rs.jsonable(out), open("out/leadlag_econ.json", "w"))
    print(len(out), "rows")
    # print best by t_gross
    good = [r for r in out if r.get("n", 0) >= 30]
    good.sort(key=lambda r: -r["t_gross"])
    print("top by gross t-stat (n>=30):")
    for r in good[:15]:
        print("%-28s %-14s->%-14s %-5s th=%.3f n=%4d gross=%+.4f (t=%.2f) net=%+.4f (t=%.2f) | oos n=%s gross=%s net=%s" % (r["cluster"][:28], r["leader"], r["follower"], r["grid"], r["theta"], r["n"], r["mean_gross"], r["t_gross"], r["mean_net"], r["t_net"], r.get("n_oos"), None if r.get("mean_gross_oos") is None else round(r["mean_gross_oos"], 4), None if r.get("mean_net_oos") is None else round(r["mean_net_oos"], 4)))
    print("best by net:")
    good.sort(key=lambda r: -r["mean_net"])
    for r in good[:8]:
        print("%-28s %-14s->%-14s %-5s th=%.3f n=%4d gross=%+.4f net=%+.4f (t=%.2f)" % (r["cluster"][:28], r["leader"], r["follower"], r["grid"], r["theta"], r["n"], r["mean_gross"], r["mean_net"], r["t_net"]))
    print("rows with positive net mean (n>=30):", sum(1 for r in good if r["mean_net"] > 0), "of", len(good))
