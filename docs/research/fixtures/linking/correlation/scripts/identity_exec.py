"""Executable (bid/ask) check of the intra-Kalshi identities on the 5-minute grid, using candle bid/ask closes.
I03: P(rate>4.00% after Oct) = P(hike25) + P(hike>25).  I02: P(D Senate) = P(DD) + P(R-House,D-Senate).
Profit (per 1-contract unit, before fees): A = bid(parent) - sum ask(children)   [short parent, long children]
                                           B = sum bid(children) - ask(parent)   [long parent, short children]
Fees: Kalshi taker 0.07*p(1-p) on every leg (secondary-source coefficient).  usage: python3 -I src/identity_exec.py -> out/identity_exec.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
import run_study as rs
out = {}
for cid in ("I03_k_fed_hike_identity", "I02_k_senateD_identity"):
    cl = [c for c in rs.CL if c["id"] == cid][0]
    rs._valid_from[0] = rs.res_ts(cl["valid_from"]) if cl.get("valid_from") else 0
    g = "5m_k"
    par = cl["parent"]; kids = cl["children"]
    pb = rs.grid_values(par, g, which="bid"); pa = rs.grid_values(par, g, which="ask")
    kb = [rs.grid_values(k, g, which="bid") for k in kids]; ka = [rs.grid_values(k, g, which="ask") for k in kids]
    rows = []
    for i in range(len(pb)):
        vals = [pb[i], pa[i]] + [x[i] for x in kb] + [x[i] for x in ka]
        if any(v is None for v in vals): continue
        A = pb[i] - sum(x[i] for x in ka)
        B = sum(x[i] for x in kb) - pa[i]
        fA = lib.fee_quadratic(pb[i], rs.KFEE) + sum(lib.fee_quadratic(x[i], rs.KFEE) for x in ka)
        fB = lib.fee_quadratic(pa[i], rs.KFEE) + sum(lib.fee_quadratic(x[i], rs.KFEE) for x in kb)
        rows.append((A, B, A - fA, B - fB))
    N = len(rows)
    best_gross = [max(r[0], r[1]) for r in rows]; best_net = [max(r[2], r[3]) for r in rows]
    # persistence of positive gross windows (consecutive bins)
    flags = [g_ > 0 for g_ in best_gross]
    rl = rs.runs(flags)
    out[cid] = {"n_bins": N, "frac_gross_exec_gt0": sum(flags) / N, "frac_net_exec_gt0": sum(1 for v in best_net if v > 0) / N,
                "max_gross": max(best_gross), "p99_gross": lib.quantile(best_gross, 0.99), "median_gross": lib.quantile(best_gross, 0.5),
                "max_net": max(best_net), "median_net": lib.quantile(best_net, 0.5),
                "runs_gross_gt0": {"count": len(rl), "median_len_min": (sorted(rl)[len(rl) // 2] * 5 if rl else 0), "max_len_min": (max(rl) * 5 if rl else 0)}}
    print(cid, out[cid])
json.dump(rs.jsonable(out), open("out/identity_exec.json", "w"), indent=1)
