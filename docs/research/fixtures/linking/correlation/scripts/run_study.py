"""Main analysis: reads out/registry.json + out/series/*.json (downloaded by fetch_series.py) and writes out/results.json.

usage: python3 -I src/run_study.py [cluster_id_prefix ...]
Everything is computed on mid prices (Polymarket: server-side bucketed price series, which our calibration shows is the book mid;
Kalshi: (yes_bid_close + yes_ask_close)/2 of each candle).  Returns are first differences in probability points.
"""
import datetime
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

OUT = os.environ.get("PM_OUT_DIR", "out")
DAY = 86400
REG = json.load(open(os.path.join(OUT, "registry.json")))
LEGS = REG["legs"]
CL = REG["clusters"]
T0 = int(open(os.path.join(OUT, "t0.txt")).read().strip())

KFEE = 0.07          # Kalshi taker coefficient (secondary source, M); fee = KFEE * p * (1-p)
PA = 0.0             # PRIMARY alpha: Polymarket bucket labelled t treated as known at t (see calibration in notes)
SA = 1.0             # SENSITIVITY alpha: bucket known only at t+res (conservative; shifts Polymarket later by one bucket)
BURN = 6 * 3600      # drop the first 6 hours after a series' first observation (price-discovery burn-in)
_valid_from = [0]
_valid_to = [None]
_cache = {}


def load(name):
    if name not in _cache:
        _cache[name] = json.load(open(os.path.join(OUT, "series", name + ".json")))
    return _cache[name]


# ----------------------------------------------------------------------------- observations
def pm_obs(name, tier, alpha):
    """Polymarket observations [(t_known, price)]. A bucket labelled t with width res was observed inside [t, t+res);
    alpha=0 treats it as known at t (optimistic, may look ahead by up to res); alpha=1 as known at t+res (conservative)."""
    out = []
    for (t, p, res) in load(name)[tier]:
        if res <= 0:        # drop exact-tick / settlement points: for RESOLVED markets every window ends with a clamped payout point (artifact)
            continue
        out.append((t + alpha * res, p))
    return out


def pm_obs_merged(name, alpha):
    d = {}
    for tier in ("30m", "5m"):
        for (t, p, res) in load(name)[tier]:
            if res <= 0:
                continue
            d[t] = (t + alpha * res, p)
    return sorted(d.values())


def k_obs(name, tier, which="mid"):
    out = []
    for r in load(name)[tier]:
        end, bid, ask = r[0], r[1], r[2]
        if which == "mid":
            if bid is None or ask is None:
                continue
            out.append((end, (bid + ask) / 2.0))
        elif which == "bid":
            if bid is not None:
                out.append((end, bid))
        elif which == "ask":
            if ask is not None:
                out.append((end, ask))
    return out


# ----------------------------------------------------------------------------- grids
GRIDS = {
    # name: (start, step, n)
    "1m": (T0 - 9900 * 60, 60, 9900),
    "5m_pm": (T0 - 57 * DAY, 300, 57 * 288),
    "5m_k": (T0 - 30 * DAY, 300, 30 * 288),
    "1h": (int((T0 - 84 * DAY) // 3600 * 3600), 3600, 84 * 24),
}


def grid_values(leg, gname, alpha=1.0, which="mid"):
    """Value grid for one leg (list of float|None) on grid gname."""
    start, step, n = GRIDS[gname]
    L = LEGS[leg]
    if L["venue"] == "PM":
        if gname == "1m":
            obs = pm_obs(leg, "1m", alpha)
        elif gname.startswith("5m"):
            obs = pm_obs(leg, "5m", alpha)
        else:
            obs = pm_obs_merged(leg, alpha)
        if which in ("bid", "ask"):
            return [None] * n
    else:
        tier = "60m" if gname == "1h" else "1m"
        obs = k_obs(leg, tier, which)
    obs = sorted(obs)
    vals = lib.locf(obs, start, step, n)
    if _valid_to[0] is not None:
        for i in range(n):
            if start + i * step > _valid_to[0]:
                vals[i] = None
    if obs:
        cut = max(obs[0][0] + BURN, _valid_from[0])
        for i in range(n):
            if start + i * step < cut:
                vals[i] = None
            else:
                break
    return vals


def sum_grids(gs):
    out = []
    for vals in zip(*gs):
        out.append(None if any(v is None for v in vals) else sum(vals))
    return out


def sub(a, b):
    return [None if (x is None or y is None) else x - y for x, y in zip(a, b)]


# ----------------------------------------------------------------------------- per-pair analyses
def corr_summary(dx, dy, block, B=300):
    xs, ys, idx = lib.pair_clean(dx, dy)
    n = len(xs)
    if n < 30:
        return {"n": n}
    rho = lib.pearson(xs, ys)
    pairs = list(zip(xs, ys))
    ci = lib.block_bootstrap_stat(pairs, lambda s: lib.pearson([a for a, b in s], [b for a, b in s]), block, B=B)
    ja = [(a, b) for a, b in pairs if a != 0.0 or b != 0.0]
    rho_ja = lib.pearson([a for a, b in ja], [b for a, b in ja]) if len(ja) > 30 else float("nan")
    sx = sum(1 for a in xs if a != 0.0) / n
    sy = sum(1 for b in ys if b != 0.0) / n
    # sign concordance among bins where both moved
    both = [(a, b) for a, b in pairs if a != 0.0 and b != 0.0]
    conc = sum(1 for a, b in both if (a > 0) == (b > 0)) / len(both) if both else float("nan")
    return {"n": n, "rho": rho, "ci": ci, "rho_joint_active": rho_ja, "nactive_either": len(ja), "frac_nonzero_x": sx,
            "frac_nonzero_y": sy, "n_both_moved": len(both), "sign_concordance_both_moved": conc}


def ccf_summary(dx, dy, K, block, B=400, Bs=1000, seed=1):
    xs, ys, idx = lib.pair_clean(dx, dy)
    n = len(xs)
    nx_ = sum(1 for v in xs if v != 0.0)
    ny_ = sum(1 for v in ys if v != 0.0)
    if n < 400 or nx_ < 20 or ny_ < 20:
        return {"n": n, "n_events_x": nx_, "n_events_y": ny_, "insufficient": True}
    bb = lib.block_bootstrap_ccf(xs, ys, K, block, B=B, seed=seed)
    if bb is None:
        return {"n": n}
    cs = lib.circular_shift_null(xs, ys, K, B=Bs, seed=seed + 1)
    rho = bb["rho"]
    sgn = bb["sgn"]
    pk = max(rho, key=lambda k: sgn * rho[k])
    pd = bb["peak_dist"]
    p_pos = sum(v for k, v in pd.items() if k > 0)
    p_neg = sum(v for k, v in pd.items() if k < 0)
    return {"n": n, "n_events_x": nx_, "n_events_y": ny_, "K": K, "J": bb["J"], "sgn": sgn, "rho0": rho[0],
            "rho": {str(k): round(rho[k], 4) for k in rho if abs(k) <= 3},
            "rho_ci": {str(k): [round(bb["ci"][k][0], 4), round(bb["ci"][k][1], 4)] for k in bb["ci"] if abs(k) <= 3},
            "peak_lag_bins": pk, "p_peak_pos": p_pos, "p_peak_neg": p_neg, "p_peak_zero": pd.get(0, 0.0),
            "lam": bb["lam"], "lam_ci": [bb["lam_ci"][0], bb["lam_ci"][1]], "lam_p_shift": cs["lam_p"],
            "lam_rel": bb["lam"] / max(1e-12, abs(sum(rho[k] for k in range(1, K + 1))) + abs(sum(rho[-k] for k in range(1, K + 1))))}


def event_summary(dx, dy, W, B=1500, seed=7):
    xs, ys, idx = lib.pair_clean(dx, dy)
    if len(xs) < 400:
        return {"n": len(xs), "insufficient": True}
    r = lib.event_response(xs, ys, W, B=B, seed=seed)
    r["n"] = len(xs)
    return r


def hedge_summary(da, db, frac=0.6):
    xs, ys, idx = lib.pair_clean(da, db)
    n = len(xs)
    if n < 60:
        return {"n": n}
    cut = int(frac * n)
    a, b, r2, _ = lib.ols(xs, ys)
    atr, btr, r2tr, _ = lib.ols(xs[:cut], ys[:cut])
    res_te = [y - atr - btr * x for x, y in zip(xs[cut:], ys[cut:])]
    vr_te = 1 - lib.var(res_te) / lib.var(ys[cut:]) if lib.var(ys[cut:]) > 0 else float("nan")
    a2, b2, r22, _ = lib.ols(xs[cut:], ys[cut:])
    return {"n": n, "beta": b, "r2_in": r2, "beta_train": btr, "beta_test": b2, "vr_oos": vr_te}


def runs(flags):
    """Lengths of consecutive True runs."""
    out, c = [], 0
    for f in flags:
        if f:
            c += 1
        elif c:
            out.append(c)
            c = 0
    if c:
        out.append(c)
    return out


def pm_halfspread(leg):
    L = LEGS[leg]
    try:
        b, a = float(L["snap_bid"]), float(L["snap_ask"])
        if a > b >= 0:
            return (a - b) / 2.0
    except Exception:
        pass
    return 0.01


def snapshot_bidask(leg):
    L = LEGS[leg]
    try:
        return float(L["snap_bid"]), float(L["snap_ask"])
    except Exception:
        return None, None


def pm_fee_rate(leg):
    r = LEGS[leg].get("fee_rate")
    return float(r) if r not in (None, "") and LEGS[leg].get("fees_enabled") else 0.0


def res_ts(datestr):
    fmt = "%Y-%m-%dT%H:%M" if "T" in datestr else "%Y-%m-%d"
    return int(datetime.datetime.strptime(datestr, fmt).replace(tzinfo=datetime.timezone.utc).timestamp())


# ----------------------------------------------------------------------------- spread analysis (same-event pairs)
def spread_analysis(cl):
    a, b = cl["a"], cl["b"]
    out = {}
    for gname in ("1h", "5m_k"):
        step_h = GRIDS[gname][1] / 3600.0
        pa = grid_values(a, gname, alpha=PA)
        kb = grid_values(b, gname)
        s = sub(pa, kb)
        sc = [v for v in s if v is not None]
        if len(sc) < 100:
            out[gname] = {"n": len(sc)}
            continue
        phi, se, c, sig = lib.ar1(sc)
        blk = max(10, int(48 / step_h)) if gname == "1h" else 288
        phi_ci = (phi - 1.96 * se, phi + 1.96 * se)   # analytic OLS interval (block bootstrap of AR(1) is biased near unit root)
        hl = lib.half_life(phi, step_h)
        hl_ci = [lib.half_life(phi_ci[0], step_h), lib.half_life(phi_ci[1], step_h)]
        d = {"n": len(sc), "mean": lib.mean(sc), "sd": lib.sd(sc), "min": min(sc), "max": max(sc),
             "p05": lib.quantile(sc, 0.05), "p95": lib.quantile(sc, 0.95),
             "phi": phi, "phi_ci": list(phi_ci), "half_life_h": hl, "half_life_ci_h": hl_ci, "df_t": lib.df_tstat(sc),
             "frac_abs_gt": {str(t): sum(1 for v in sc if abs(v) > t) / len(sc) for t in (0.005, 0.01, 0.02, 0.03, 0.05)}}
        # AR(1) on the mean-removed series is what phi estimates (intercept free); also half-life of |s| crossing zero is not computed.
        out[gname] = d
    # executable-edge waterfall on hourly grid
    gname = "1h"
    start, step, n = GRIDS[gname]
    pm_mid = grid_values(a, gname, alpha=PA)
    kb_bid = grid_values(b, gname, which="bid")
    kb_ask = grid_values(b, gname, which="ask")
    hp = pm_halfspread(a)
    frate = pm_fee_rate(a)
    rt = res_ts(cl["res"])
    rows = []
    for i in range(n):
        m, kbid, kask = pm_mid[i], kb_bid[i], kb_ask[i]
        if m is None or kbid is None or kask is None:
            continue
        t = start + i * step
        days = (rt - t) / DAY
        if days <= 0:
            continue
        pm_ask = min(1.0, m + hp)
        pm_bid = max(0.0, m - hp)
        # e1: buy YES on PM at ask, buy NO on Kalshi (= sell YES at kbid).  profit per $1 payoff = kbid - pm_ask
        e1 = kbid - pm_ask
        f1 = lib.fee_quadratic(pm_ask, frate) + lib.fee_quadratic(kbid, KFEE)
        # e2: buy YES on Kalshi at kask, buy NO on PM (= sell YES at pm_bid)
        e2 = pm_bid - kask
        f2 = lib.fee_quadratic(pm_bid, frate) + lib.fee_quadratic(kask, KFEE)
        if e1 - f1 >= e2 - f2:
            e, f = e1, f1
        else:
            e, f = e2, f2
        net = e - f
        cost = max(0.05, 1.0 - e)
        ann = lib.annualise(net / cost, days)
        mid_gap = abs(m - (kbid + kask) / 2.0)
        kspread = kask - kbid
        rt_net = mid_gap - 2 * hp - kspread - 2 * f      # close-out (convergence) trade: cross both spreads twice, 4 fees
        rows.append((t, mid_gap, e, net, ann, days, rt_net, f, kspread))
    if rows:
        N = len(rows)
        wf = {
            "n_hours": N,
            "half_spread_pm_assumed": hp,
            "pm_fee_rate": frate,
            "mean_kalshi_spread": lib.mean([r[8] for r in rows]),
            "mean_entry_fees": lib.mean([r[7] for r in rows]),
            "frac_mid_gap_gt_0.5c": sum(1 for r in rows if r[1] > 0.005) / N,
            "frac_mid_gap_gt_1c": sum(1 for r in rows if r[1] > 0.01) / N,
            "frac_mid_gap_gt_2c": sum(1 for r in rows if r[1] > 0.02) / N,
            "frac_edge_after_spread_gt0": sum(1 for r in rows if r[2] > 0) / N,
            "frac_net_after_fees_gt0": sum(1 for r in rows if r[3] > 0) / N,
            "frac_net_ann_gt_5pct": sum(1 for r in rows if r[3] > 0 and r[4] > 0.05) / N,
            "frac_net_ann_gt_20pct": sum(1 for r in rows if r[3] > 0 and r[4] > 0.20) / N,
            "frac_closeout_net_gt0": sum(1 for r in rows if r[6] > 0) / N,
            "max_net": max(r[3] for r in rows), "p95_net": lib.quantile([r[3] for r in rows], 0.95),
            "median_net": lib.quantile([r[3] for r in rows], 0.5),
            "median_edge_after_spread": lib.quantile([r[2] for r in rows], 0.5),
            "median_days_to_res": lib.quantile([r[5] for r in rows], 0.5),
            "best_ann_net": max((r[4] for r in rows if r[3] > 0), default=None),
            "median_ann_when_pos": lib.quantile([r[4] for r in rows if r[3] > 0], 0.5) if any(r[3] > 0 for r in rows) else None,
        }
        # explicit fee thresholds on the MID gap (before spreads): entry-only fees (hold to resolution) and 2x (open+close, fees only)
        wf["frac_mid_gap_gt_entry_fees"] = sum(1 for r in rows if r[1] > r[7]) / N
        wf["frac_mid_gap_gt_2x_fees_roundtrip_fees_only"] = sum(1 for r in rows if r[1] > 2 * r[7]) / N
        wf["frac_mid_gap_gt_roundtrip_all_costs"] = sum(1 for r in rows if r[6] > 0) / N
        # dollar-weighted edge attrition: how much of the apparent mid gap survives each friction
        G = sum(r[1] for r in rows)
        if G > 0:
            wf["attrition"] = {
                "mean_apparent_gap": G / N,
                "survives_after_spread": sum(max(r[2], 0.0) for r in rows) / G,
                "survives_after_fees": sum(max(r[3], 0.0) for r in rows) / G,
                "survives_after_5pct_ann_hurdle": sum(max(r[3], 0.0) for r in rows if r[4] > 0.05) / G,
                "survives_after_20pct_ann_hurdle": sum(max(r[3], 0.0) for r in rows if r[4] > 0.20) / G,
                "survives_closeout_trade": sum(max(r[6], 0.0) for r in rows) / G,
            }
        out["waterfall_1h"] = wf
    # simple trailing-window mean-reversion backtest on the hourly mid spread (no look-ahead: z uses data up to t-1)
    pa = grid_values(a, "1h", alpha=PA)
    kb = grid_values(b, "1h")
    s = sub(pa, kb)
    W = 168
    trades = []
    pos = None
    for i in range(W + 1, len(s)):
        if s[i] is None:
            continue
        win = [v for v in s[i - W - 1:i - 1] if v is not None]
        if len(win) < W * 0.8:
            continue
        mu, sdv = lib.mean(win), lib.sd(win)
        if sdv != sdv or sdv < 0.0025:
            continue
        z = (s[i] - mu) / sdv
        if pos is None and abs(z) > 2.0:
            pos = (i, s[i], 1 if z > 0 else -1)      # short the rich side: profit when spread falls if z>0
        elif pos is not None:
            hold = i - pos[0]
            if abs(z) < 0.5 or hold >= 48:
                gross = -pos[2] * (s[i] - pos[1])
                trades.append((gross, hold))
                pos = None
    if trades:
        g = [t[0] for t in trades]
        cost_rt = 2 * hp + (wf["mean_kalshi_spread"] if rows else 0.01) + 2 * (wf["mean_entry_fees"] if rows else 0.02)
        out["pairs_backtest_1h"] = {"n_trades": len(trades), "mean_gross": lib.mean(g), "sd_gross": lib.sd(g) if len(g) > 1 else None,
                                    "hit_rate_gross": sum(1 for v in g if v > 0) / len(g), "mean_hold_h": lib.mean([t[1] for t in trades]),
                                    "assumed_round_trip_cost": cost_rt, "mean_net": lib.mean(g) - cost_rt,
                                    "frac_trades_gross_gt_cost": sum(1 for v in g if v > cost_rt) / len(g)}
    else:
        out["pairs_backtest_1h"] = {"n_trades": 0}
    return out


# ----------------------------------------------------------------------------- logical-constraint analysis
def logic_analysis(cl):
    """child <= parent (PC, LAD) or parent == sum(children) (IDENT), on mids. NOT executable."""
    out = {}
    if cl["kind"] == "LAD":
        child, parent = cl["lo"], cl["hi"]
        kids = [child]
    elif cl["kind"] == "PC":
        child, parent = cl["child"], cl["parent"]
        kids = [child]
    else:
        parent, kids = cl["parent"], cl["children"]
    ident = cl["kind"] == "IDENT"
    for gname in ("1h", "5m_pm"):
        venues = {LEGS[x]["venue"] for x in kids + [parent]}
        gg = gname
        if "K" in venues and gname == "5m_pm":
            gg = "5m_k"
        step_h = GRIDS[gg][1] / 3600.0
        P = grid_values(parent, gg, alpha=PA)
        C = sum_grids([grid_values(k, gg, alpha=PA) for k in kids])
        v = sub(C, P)            # child - parent (>0 = violation); IDENT: sum(children) - parent (either sign)
        vc = [x for x in v if x is not None]
        if len(vc) < 50:
            out[gg] = {"n": len(vc)}
            continue
        mag = [abs(x) for x in vc] if ident else [x for x in vc]
        thr = (0.005, 0.01, 0.02, 0.03, 0.05)
        d = {"n": len(vc), "mean_signed": lib.mean(vc), "sd": lib.sd(vc), "min": min(vc), "max": max(vc)}
        d["frac_gt"] = {str(t): sum(1 for x in mag if x > t) / len(mag) for t in thr}
        for t in (0.01, 0.02):
            flags = [x > t for x in mag]
            rl = runs(flags)
            d["runs_gt_%gc" % (t * 100)] = {"count": len(rl), "median_len_h": (sorted(rl)[len(rl) // 2] * step_h if rl else 0.0),
                                            "max_len_h": (max(rl) * step_h if rl else 0.0), "frac_time": sum(flags) / len(flags)}
        d["mean_when_violating_gt1c"] = lib.mean([x for x in mag if x > 0.01]) if any(x > 0.01 for x in mag) else 0.0
        out[gg] = d
    # cost-aware survival of apparent violations using SNAPSHOT half-spreads and taker fees (static approximation)
    try:
        legs_c = kids + [parent]
        hs = 0.0
        fee_c = 0.0
        for x in legs_c:
            b_, a_ = snapshot_bidask(x)
            hs += (a_ - b_) / 2.0
            mid_ = (a_ + b_) / 2.0
            fee_c += lib.fee_quadratic(mid_, pm_fee_rate(x) if LEGS[x]["venue"] == "PM" else KFEE)
        out["cost_model"] = {"sum_half_spreads_snapshot": hs, "sum_taker_fees_snapshot": fee_c}
        for gname in ("1h",):
            if gname in out and out[gname].get("n", 0) > 50:
                P = grid_values(parent, gname, alpha=PA)
                C = sum_grids([grid_values(k, gname, alpha=PA) for k in kids])
                v = [x for x in sub(C, P) if x is not None]
                mag = [abs(x) for x in v] if ident else [x for x in v]
                out[gname]["frac_gt_costs"] = sum(1 for x in mag if x > hs + fee_c) / len(mag)
                out[gname]["frac_gt_spreads_only"] = sum(1 for x in mag if x > hs) / len(mag)
    except Exception as ex:
        out["cost_model"] = {"err": str(ex)}
    # one-shot executable check on the T0 snapshot book (bid/ask from Gamma / Kalshi crawl, ~minutes before T0)
    try:
        if ident:
            pb, pa_ = snapshot_bidask(parent)
            cbs = [snapshot_bidask(k) for k in kids]
            # long parent (pay ask), short children (receive bids) => profit if sum(bids) > ask  (parent == sum(children))
            e_a = sum(b for b, a in cbs) - pa_
            # long children (pay asks), short parent (receive bid)
            e_b = pb - sum(a for b, a in cbs)
            out["snapshot_exec"] = {"sum_child_bids_minus_parent_ask": e_a, "parent_bid_minus_sum_child_asks": e_b,
                                    "snapshot_gross_exec_gt0": max(e_a, e_b) > 0}
        else:
            cb, ca = snapshot_bidask(child)
            pb, pa_ = snapshot_bidask(parent)
            e = cb - pa_      # sell child YES at bid, buy parent YES at ask: payoff >= 0 always (child => parent)
            out["snapshot_exec"] = {"child_bid_minus_parent_ask": e, "gross_exec_gt0": e > 0,
                                    "mid_violation_snapshot": ((cb + ca) / 2 - (pb + pa_) / 2)}
    except Exception as ex:
        out["snapshot_exec"] = {"err": str(ex)}
    return out


# ----------------------------------------------------------------------------- one relationship
def analyse(cl):
    kind = cl["kind"]
    _valid_from[0] = res_ts(cl["valid_from"]) if cl.get("valid_from") else 0
    _valid_to[0] = res_ts(cl["valid_to"]) if cl.get("valid_to") else None
    if kind == "XV" or kind == "FAC":
        a, b = cl["a"], cl["b"]
        lhs = lambda g, alpha: grid_values(a, g, alpha)
        rhs = lambda g, alpha: grid_values(b, g, alpha)
    elif kind == "LAD":
        a, b = cl["hi"], cl["lo"]
        lhs = lambda g, alpha: grid_values(a, g, alpha)
        rhs = lambda g, alpha: grid_values(b, g, alpha)
    elif kind == "PC":
        a, b = cl["parent"], cl["child"]
        lhs = lambda g, alpha: grid_values(a, g, alpha)
        rhs = lambda g, alpha: grid_values(b, g, alpha)
    else:   # IDENT: parent vs sum of children
        a = cl["parent"]
        lhs = lambda g, alpha: grid_values(a, g, alpha)
        rhs = lambda g, alpha: sum_grids([grid_values(k, g, alpha) for k in cl["children"]])
        b = "+".join(cl["children"])
    legs_used = [a] + (cl["children"] if kind == "IDENT" else [b])
    venues = {LEGS[x]["venue"] for x in legs_used}
    has_k = "K" in venues
    has_pm = "PM" in venues
    res = {"id": cl["id"], "kind": kind, "x": a, "y": b, "note": cl.get("note"), "venues": sorted(venues)}
    g5 = "5m_k" if has_k else "5m_pm"
    # ---- correlations at 5-min / 1-hour / 1-day on first differences of mids
    X5, Y5 = lhs(g5, PA), rhs(g5, PA)
    XH, YH = lhs("1h", PA), rhs("1h", PA)
    # daily = hourly grid sampled at 00:00 UTC
    start_h = GRIDS["1h"][0]
    first_mid = int(math.ceil(start_h / DAY) * DAY)
    off = int((first_mid - start_h) // 3600)
    XD, YD = XH[off::24], YH[off::24]
    d5x, d5y = lib.diffs(X5), lib.diffs(Y5)
    dhx, dhy = lib.diffs(XH), lib.diffs(YH)
    ddx, ddy = lib.diffs(XD), lib.diffs(YD)
    res["corr"] = {"5m": corr_summary(d5x, d5y, 24), "1h": corr_summary(dhx, dhy, 24), "1d": corr_summary(ddx, ddy, 5, B=300)}
    res["grid5"] = g5
    # 2-bin (non-overlapping) 10-min correlation to damp microstructure noise
    res["corr"]["10m_nonoverlap"] = corr_summary(lib.resample_sum(d5x, 2), lib.resample_sum(d5y, 2), 12)
    # ---- lead-lag
    res["ccf"] = {}
    for alpha in ((PA, SA) if (has_k and has_pm) else (PA,)):
        tag = "primary" if alpha == PA else "sens"
        X1, Y1 = lhs("1m", alpha), rhs("1m", alpha)
        res["ccf"]["1m_" + tag] = ccf_summary(lib.diffs(X1), lib.diffs(Y1), 10, 120)
        X5a, Y5a = lhs(g5, alpha), rhs(g5, alpha)
        res["ccf"]["5m_" + tag] = ccf_summary(lib.diffs(X5a), lib.diffs(Y5a), 6, 24)
        res.setdefault("event", {})["1m_W5_" + tag] = event_summary(lib.diffs(X1), lib.diffs(Y1), 5)
        res["event"]["1m_W30_" + tag] = event_summary(lib.diffs(X1), lib.diffs(Y1), 30)
        res["event"]["5m_W3_" + tag] = event_summary(lib.diffs(X5a), lib.diffs(Y5a), 3)
        res["event"]["5m_W12_" + tag] = event_summary(lib.diffs(X5a), lib.diffs(Y5a), 12)
    res["ccf"]["1h"] = ccf_summary(dhx, dhy, 6, 24)
    # ---- hedge ratios (regress y on x): 5m, 1h, 1d
    res["hedge"] = {"5m": hedge_summary(d5x, d5y), "1h": hedge_summary(dhx, dhy), "1d": hedge_summary(ddx, ddy)}
    # ---- kind-specific
    if kind == "XV":
        res["spread"] = spread_analysis(cl)
    if kind in ("LAD", "PC", "IDENT"):
        res["logic"] = logic_analysis(cl)
    # data coverage
    res["coverage"] = {x: {"1m": len(load(x)["1m"]), "5m": len(load(x).get("5m", [])), "first_5m_ts": (load(x)["5m"][0][0] if load(x).get("5m") else None)}
                       for x in legs_used if LEGS[x]["venue"] == "PM"}
    return res


def jsonable(o):
    if isinstance(o, float):
        if o != o:
            return None
        if o in (float("inf"), float("-inf")):
            return "inf" if o > 0 else "-inf"
        return round(o, 5)
    if isinstance(o, dict):
        return {str(k): jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    return o


if __name__ == "__main__":
    want = sys.argv[1:]
    os.makedirs(os.path.join(OUT, "res"), exist_ok=True)
    for cl in CL:
        if want and not any(cl["id"] == w or cl["id"].startswith(w) for w in want):
            continue
        try:
            r = analyse(cl)
        except Exception as ex:
            import traceback
            traceback.print_exc()
            r = {"id": cl["id"], "error": str(ex)}
        json.dump(jsonable(r), open(os.path.join(OUT, "res", cl["id"] + ".json"), "w"))
        print("done", cl["id"], file=sys.stderr, flush=True)
    json.dump({"t0": T0, "t0_iso": datetime.datetime.fromtimestamp(T0, datetime.timezone.utc).isoformat()}, open(os.path.join(OUT, "meta.json"), "w"))
