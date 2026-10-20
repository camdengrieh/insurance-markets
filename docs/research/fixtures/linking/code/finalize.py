"""Stage F: assemble the headline numbers and the compact result files.

  python3 -I finalize.py --raw RAW --fixtures FIXTURES_DIR

Inputs : RAW/{cross_all,me_all,ladder_all}[_recheck].json, RAW/audit_*.json, RAW/screen/*.json, listings, books
Outputs: FIXTURES_DIR/{final_summary.json, audit_results.json, audit_sample_labeled.json, cross_candidates.csv,
         me_sets_results.csv, ladder_results.csv, false_link_patterns.json, snapshot_manifest.json, ...}
Every file is <= 100 KB.
"""
import argparse
import csv
import json
import math
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ladders as LD  # noqa: E402
from common import Leg, ONE, jdump  # noqa: E402
from analyze import load_books, mk_leg, run_package, leg_flags  # noqa: E402
from universe import load_all  # noqa: E402

HAIRCUTS = [0, 100, 300, 500, 1000]
APR_HURDLE = 0.05


def pct(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, int(round(p / 100 * (len(xs) - 1)))))]


def wilson(k, n, z=1.96):
    if n == 0:
        return (None, None)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (round((c - h) / d, 3), round((c + h) / d, 3))


def write_csv(path, rows, cols):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            w.writerow([r.get(c) for c in cols])
    if os.path.getsize(path) > 100_000:
        raise RuntimeError(path + " exceeds 100 KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--fixtures", required=True)
    args = ap.parse_args()
    raw, fx = args.raw, args.fixtures
    U, extra, snaps = load_all(raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    snap_t = snaps["polymarket"]
    cross = json.load(open(os.path.join(raw, "cross_all.json")))
    cross_rc = {(r["a"], r["b"], r["dir"]): r for r in json.load(open(os.path.join(raw, "cross_all_recheck.json")))}
    me = json.load(open(os.path.join(raw, "me_all.json")))
    me_rc = {(r["event"], r["kind"]): r for r in json.load(open(os.path.join(raw, "me_all_recheck.json")))}
    lad = json.load(open(os.path.join(raw, "ladder_all.json")))
    lad_rc = {(r["easy"], r["hard"]): r for r in json.load(open(os.path.join(raw, "ladder_all_recheck.json")))}
    labels = json.load(open(os.path.join(raw, "audit_labels_all.json")))
    census = json.load(open(os.path.join(raw, "census_labels.json")))
    truth = {**{k: v["label"] for k, v in census.items()}, **{k: v["label"] for k, v in labels.items()}}
    sample = json.load(open(os.path.join(raw, "audit_sample_full.json")))
    ameta = json.load(open(os.path.join(raw, "audit_meta.json")))
    sets = json.load(open(os.path.join(raw, "screen", "sets.json")))
    near = json.load(open(os.path.join(raw, "screen", "near_ladder_pairs.json")))
    fams = json.load(open(os.path.join(raw, "screen", "families.json")))
    links = json.load(open(os.path.join(raw, "screen", "links.json")))
    out = {}

    # ------------------------------------------------------------------ manifest
    req = Counter()
    first, last = {}, {}
    for line in open(os.path.join(raw, "request_log.jsonl")):
        r = json.loads(line)
        req[r["host"]] += 1
        first.setdefault(r["host"], r["ts"])
        last[r["host"]] = r["ts"]
    fmt = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))  # noqa: E731
    manifest = {"requests_per_host_total": dict(req), "first_request_utc": {h: fmt(t) for h, t in first.items()},
                "last_request_utc": {h: fmt(t) for h, t in last.items()},
                "listing_start_utc": {v: fmt(t) for v, t in snaps.items()},
                "universe_sizes": {v: {"normalised_markets": len(ms), "tradable": sum(1 for m in ms if m["tradable"])} for v, ms in U.items()}}
    books_fetch = {}
    for v in ("polymarket", "kalshi", "xo", "limitless"):
        for tag in ("", "_recheck", "_calib"):
            p = os.path.join(raw, "books", f"{v}{tag}.json")
            if os.path.exists(p):
                d = json.load(open(p))
                ts = [x["t"] for x in d.values() if x.get("t")]
                if ts:
                    books_fetch[f"{v}{tag}"] = {"n": len(d), "ok": sum(1 for x in d.values() if x["status"] == 200),
                                               "first_utc": fmt(min(ts)), "last_utc": fmt(max(ts))}
    manifest["book_fetch_windows"] = books_fetch
    jdump(manifest, os.path.join(fx, "snapshot_manifest.json"), indent=1)
    out["manifest"] = manifest

    # ------------------------------------------------------------------ listing-level screens (all markets, top-of-book only)
    lst = {}
    pairs_total, pairs_viol = Counter(), Counter()
    for f in fams:
        for e, h in LD.easy_hard_pairs(f):
            me_, mh_ = idx[e], idx[h]
            if mh_["bid"] is None or me_["ask"] is None:
                continue
            pairs_total[f["venue"] + ":" + f["kind"]] += 1
            if mh_["bid"] > me_["ask"]:
                pairs_viol[f["venue"] + ":" + f["kind"]] += 1
    lst["ladder_families"] = dict(Counter(f["venue"] + ":" + f["kind"] for f in fams))
    lst["ladder_pairs_with_both_quotes"] = dict(pairs_total)
    lst["ladder_pairs_violating_in_listing"] = dict(pairs_viol)
    ka_crossed = sum(1 for m in U["kalshi"] if m["bid"] is not None and m["ask"] is not None and m["bid"] >= m["ask"])
    ka_two = sum(1 for m in U["kalshi"] if m["bid"] is not None and m["ask"] is not None)
    pm_crossed = sum(1 for m in U["polymarket"] if m["tradable"] and m["bid"] is not None and m["ask"] is not None and m["bid"] >= m["ask"])
    pm_two = sum(1 for m in U["polymarket"] if m["tradable"] and m["bid"] is not None and m["ask"] is not None)
    lst["listing_two_sided_and_crossed"] = {"kalshi": {"two_sided": ka_two, "crossed": ka_crossed}, "polymarket": {"two_sided": pm_two, "crossed": pm_crossed}}
    sets_sum = {}
    for v in ("polymarket", "kalshi"):
        ss = [S for S in sets if S["venue"] == v]
        sets_sum[v] = {"sets_with_ge2_legs": len(ss), "listing_sum_bid_gt_1": sum(1 for S in ss if S["sum_bid_listing"] > 1.0),
                       "listing_sum_bid_ge_0.985": sum(1 for S in ss if S["sum_bid_listing"] >= 0.985),
                       "listing_sum_ask_lt_1_all_quoted": sum(1 for S in ss if S["sum_ask_listing"] is not None and S["sum_ask_listing"] < 1.0)}
    lst["me_sets"] = sets_sum
    out["listing_level"] = lst

    # ------------------------------------------------------------------ calibration of the screens
    cal = {}
    cs = json.load(open(os.path.join(raw, "calib_sample.json")))
    cb = load_books(raw, "calib")
    cal["population"] = cs["population"]
    cal["kalshi_sets_sampled"] = len(cs["ka_sets"])
    cal["pm_sets_sampled"] = len(cs["pm_sets"])
    cme = json.load(open(os.path.join(raw, "me_all_calib.json")))
    cal["me_sell_evaluated"] = sum(1 for r in cme if r["kind"] == "me_sell")
    cal["me_sell_gross_positive"] = sum(1 for r in cme if r["kind"] == "me_sell" and r["gross"] > 0)
    cal["me_sell_net_positive"] = sum(1 for r in cme if r["kind"] == "me_sell" and r["net"] > 0)
    cal["me_buy_evaluated"] = sum(1 for r in cme if r["kind"] == "me_buy")
    cal["me_buy_gross_positive"] = sum(1 for r in cme if r["kind"] == "me_buy" and r["gross"] > 0)
    cal["me_buy_net_positive_all_flagged_unverified_or_nonexhaustive"] = sum(1 for r in cme if r["kind"] == "me_buy" and r["net"] > 0)
    ck = {"checked": 0, "violating_on_book": 0, "net_positive": 0}
    for e, h in cs["ladder_pairs"]:
        be, bh = cb.get(e, {}).get("book"), cb.get(h, {}).get("book")
        if be is None or bh is None or not be.asks or not bh.bids:
            continue
        ck["checked"] += 1
        if bh.best_bid > be.best_ask:
            ck["violating_on_book"] += 1
            r = run_package([mk_leg(idx[e], be, "yes", "easy"), mk_leg(idx[h], bh, "no", "hard")], 1, "ladder_calib")
            if r and r["net"] > 0:
                ck["net_positive"] += 1
    cal["ladder_unscreened_pairs"] = ck
    out["screen_calibration"] = cal

    # ------------------------------------------------------------------ cross-venue: persistence, carry, flags
    def end_of(k):
        m = idx[k]
        if m["venue"] == "kalshi":
            return m.get("expected_end") or m.get("end")
        return m.get("end")

    rows = []
    for r in cross:
        a, b = idx[r["a"]], idx[r["b"]]
        # capital is locked until the LATER of the two legs' expected resolutions (Kalshi: expected_expiration, else close)
        ends = [e for e in (end_of(r["a"]), end_of(r["b"])) if e]
        lock_end = max(ends) if ends else None
        days = max((lock_end - snap_t) / 86400.0, 1.0) if lock_end else None
        rc = cross_rc.get((r["a"], r["b"], r["dir"]))
        rec = dict(r)
        rec["days_locked"] = round(days, 1) if days else None
        rec["apr_net"] = (r["net_bps"] / 1e4 * 365.0 / days) if (days and r["net_bps"] is not None) else None
        rec["rechecked"] = rc is not None
        rec["recheck_net"] = rc["net"] if rc else None
        rec["recheck_net_bps"] = rc["net_bps"] if rc else None
        rec["persist"] = (rc["net"] > 0) if rc else None
        rec["pair_key"] = f"{r['a']}|{r['b']}"
        rec["label"] = truth.get(rec["pair_key"])
        rows.append(rec)
    pos = [r for r in rows if r["net"] is not None and r["net"] > 0]
    best_by_pair = {}
    for r in rows:
        k = r["pair_key"]
        if k not in best_by_pair or r["net"] > best_by_pair[k]["net"]:
            best_by_pair[k] = r
    pairs_eval = list(best_by_pair.values())
    pairs_pos = [r for r in pairs_eval if r["net"] > 0]

    BINS = [(0.0, 0.55), (0.55, 0.65), (0.65, 0.75), (0.75, 0.85), (0.85, 0.95), (0.95, 1.01)]

    def binname(s):
        for lo, hi in BINS:
            if lo <= s < hi:
                return f"{lo}-{hi}"
        return "hint"

    byb = defaultdict(lambda: {"pairs": 0, "net_pos_pairs": 0, "gross_pos_pairs": 0, "net_bps_pos": [], "cap_pos": []})
    for r in pairs_eval:
        b = binname(r["sim"] if r["sim"] is not None else 2)
        byb[b]["pairs"] += 1
        if r["gross"] > 0:
            byb[b]["gross_pos_pairs"] += 1
        if r["net"] > 0:
            byb[b]["net_pos_pairs"] += 1
            byb[b]["net_bps_pos"].append(r["net_bps"])
            byb[b]["cap_pos"].append(r["cost"])
    cross_bins = {b: {"pairs_evaluated": v["pairs"], "gross_positive": v["gross_pos_pairs"], "net_positive": v["net_pos_pairs"],
                      "net_bps_median": statistics.median(v["net_bps_pos"]) if v["net_bps_pos"] else None,
                      "net_bps_p90": pct(v["net_bps_pos"], 90), "capital_usd_median": statistics.median(v["cap_pos"]) if v["cap_pos"] else None,
                      "capital_usd_p90": pct(v["cap_pos"], 90)} for b, v in sorted(byb.items())}
    cs_ = {"link_pairs_evaluated": len(pairs_eval), "directional_rows": len(rows), "pairs_net_positive": len(pairs_pos),
           "pairs_gross_positive": sum(1 for r in pairs_eval if r["gross"] > 0), "by_similarity_bin": cross_bins,
           "net_bps_positive_median": statistics.median([r["net_bps"] for r in pairs_pos]) if pairs_pos else None,
           "net_bps_positive_p90": pct([r["net_bps"] for r in pairs_pos], 90),
           "capital_usd_positive_median": statistics.median([r["cost"] for r in pairs_pos]) if pairs_pos else None,
           "capital_usd_positive_p90": pct([r["cost"] for r in pairs_pos], 90),
           "touch_capital_usd_positive_median": statistics.median([r["touch_cost"] for r in pairs_pos if r["touch_cost"]]) if pairs_pos else None}
    vp = defaultdict(lambda: {"pairs": 0, "gross_pos": 0, "net_pos": 0, "pairs_sim_ge_065": 0, "net_pos_sim_ge_065": 0})
    for r in pairs_eval:
        k = f"{r['va']}/{r['vb']}"
        vp[k]["pairs"] += 1
        vp[k]["gross_pos"] += r["gross"] > 0
        vp[k]["net_pos"] += r["net"] > 0
        if (r["sim"] if r["sim"] is not None else 2) >= 0.65:
            vp[k]["pairs_sim_ge_065"] += 1
            vp[k]["net_pos_sim_ge_065"] += r["net"] > 0
    cs_["by_venue_pair"] = dict(vp)
    # distribution of net bps (all pairs positive) in coarse buckets
    edges = [0, 25, 50, 100, 250, 500, 1000, 5000, 1e9]
    dist = Counter()
    for r in pairs_pos:
        for lo, hi in zip(edges, edges[1:]):
            if lo < r["net_bps"] <= hi:
                dist[f"{lo}-{hi if hi < 1e9 else 'inf'}"] += 1
    cs_["net_bps_histogram_positive_pairs"] = dict(dist)

    # ------------------------------------------------------------------ audit results
    strata = defaultdict(Counter)
    for x in sample:
        strata[x["stratum"]][labels[x["a"]["key"] + "|" + x["b"]["key"]]["label"]] += 1
    pop = ameta["strata_population"]
    prec_rows = []
    for st, c in strata.items():
        n = sum(c.values())
        strict = c["I"] / n
        lenient = (c["I"] + c["Dm"]) / n
        prec_rows.append({"stratum": st, "population": pop.get(st) if st != "positive_edge" else pop.get("positive_edge(sim>=0.55, not already sampled)"),
                          "n_audited": n, "identical": c["I"], "resolution_differs_minor": c["Dm"], "resolution_differs_major": c["DM"], "different": c["X"],
                          "precision_strict": round(strict, 3), "precision_strict_ci95": wilson(c["I"], n),
                          "precision_lenient": round(lenient, 3), "precision_lenient_ci95": wilson(c["I"] + c["Dm"], n)})
    # threshold precision from the six random similarity strata, weighted by population
    rnd_st = [f"{lo}-{hi}" for lo, hi in BINS]
    thr = []
    for t_i, (lo, hi) in enumerate(BINS):
        use = rnd_st[t_i:]
        N = sum(pop[s] for s in use)
        pi = sum(pop[s] * strata[s]["I"] / sum(strata[s].values()) for s in use) / N
        pl = sum(pop[s] * (strata[s]["I"] + strata[s]["Dm"]) / sum(strata[s].values()) for s in use) / N
        k_i = sum(strata[s]["I"] for s in use)
        k_l = sum(strata[s]["I"] + strata[s]["Dm"] for s in use)
        n_a = sum(sum(strata[s].values()) for s in use)
        thr.append({"sim_threshold": lo, "population_pairs_at_or_above": N, "n_audited_at_or_above": n_a,
                    "precision_strict_pop_weighted": round(pi, 3), "precision_lenient_pop_weighted": round(pl, 3),
                    "unweighted_lenient_ci95": wilson(k_l, n_a)})
    # precision among executable-looking candidates (best net edge > 0) over ALL audited pairs
    posl = Counter()
    for x in sample:
        if x["best_net_bps"] is not None and x["best_net_bps"] > 0:
            posl[labels[x["a"]["key"] + "|" + x["b"]["key"]]["label"]] += 1
    audit_res = {"n_audited": len(sample), "seed": ameta["seed"], "strata_population": pop, "by_stratum": prec_rows, "by_threshold": thr,
                 "audited_pairs_with_positive_net_edge": dict(posl), "label_policy": {
                     "I": "identical: same event and outcome mapping, rule text equivalent or mirrored (cosmetic wording only)",
                     "Dm": "looks identical but resolution differs (minor): same underlying outcome; documented difference in cancel/void/postponement handling, source, cut-off time or edge-case definition that could change THIS leg's payout in an uncommon scenario",
                     "DM": "looks identical but resolution differs (major): none observed in this sample",
                     "X": "different: not the same event/outcome mapping (other entity, scope, deadline or direction)"},
                 "single_rater_caveat": "labels assigned by one reader (this agent) from the rules text displayed in the fixture; no legal or domain second opinion"}
    # false-link patterns (from notes on X labels)
    def pattern_of(n_):
        if "deadline" in n_:
            return "same question, different deadline (calendar spread)"
        if "opposite direction" in n_:
            return "opposite direction/outcome (cut vs hike)"
        if "ballot" in n_ or "Anthropic" in n_ or "competition" in n_ or "Champions League" in n_ or "scope" in n_:
            return "different scope/subject in a near-identical template (ballot vs win, OpenAI vs Anthropic, La Liga/EPL vs Champions League)"
        return "different entity under a shared market template (player/team/candidate/party/bank/office)"
    pat, pat_census = Counter(), Counter()
    in_sample = {x["a"]["key"] + "|" + x["b"]["key"] for x in sample}
    for k in in_sample:
        if labels[k]["label"] == "X":
            pat[pattern_of(labels[k]["note"])] += 1
    for k, v in census.items():
        if v["label"] == "X":
            pat_census[pattern_of(v["note"])] += 1
    jdump({"x_label_patterns_in_audit_sample": dict(pat), "x_label_patterns_in_positive_edge_census_sim_ge_0.65": dict(pat_census)}, os.path.join(fx, "false_link_patterns.json"), indent=1)
    out["audit"] = audit_res

    # ------------------------------------------------------------------ funnel & haircut
    def simv(r):
        return r["sim"] if r["sim"] is not None else 2.0

    unflag = lambda r: not [f for f in r["flags"] if f in ("crossed_book", "past_end_date", "resolution_proposed", "no_book")]  # noqa: E731
    fun = []
    cur = [r for r in pairs_pos]
    fun.append(("net-positive link pairs (any similarity >= 0.45)", len(cur)))
    cur = [r for r in cur if simv(r) >= 0.65]
    fun.append(("... similarity >= 0.65", len(cur)))
    cur = [r for r in cur if unflag(r)]
    fun.append(("... no crossed/past-end/resolution-proposed flag", len(cur)))
    cur_nodust = [r for r in cur if "extreme_price_leg" not in r["flags"]]
    fun.append(("... no leg priced <=2c or >=98c", len(cur_nodust)))
    cur2 = [r for r in cur_nodust if r["rechecked"] and r["persist"]]
    fun.append(("... still net-positive on re-fetched books (~10-13 min later)", len(cur2)))
    cur3 = [r for r in cur2 if r["cost"] >= 10]
    fun.append(("... executable capital >= $10", len(cur3)))
    cur4 = [r for r in cur3 if (r["apr_net"] or 0) >= APR_HURDLE]
    fun.append((f"... net APR on locked capital >= {int(APR_HURDLE*100)}%", len(cur4)))
    cur5 = [r for r in cur4 if r["net_bps"] - 300 > 0]
    fun.append(("... still positive after a 300 bps resolution-risk haircut", len(cur5)))
    audited_pos = [(x, labels[x["a"]["key"] + "|" + x["b"]["key"]]["label"]) for x in sample if x["best_net_bps"] and x["best_net_bps"] > 0]
    survivors = [{"a": r["a_text"], "b": r["b_text"], "va": r["va"], "vb": r["vb"], "sim": r["sim"], "net_bps": round(r["net_bps"], 1),
                  "capital_usd": r["cost"], "days_locked": r["days_locked"], "apr_net": round(r["apr_net"], 3) if r["apr_net"] else None,
                  "label": r["label"], "persist": r["persist"]} for r in cur5]
    haircut = {}
    for name, sel in (("all net-positive pairs", pairs_pos), ("sim>=0.65", [r for r in pairs_pos if simv(r) >= 0.65]),
                      ("sim>=0.85", [r for r in pairs_pos if simv(r) >= 0.85]),
                      ("sim>=0.65, unflagged, persists, no extreme leg", [r for r in pairs_pos if simv(r) >= 0.65 and unflag(r) and "extreme_price_leg" not in r["flags"] and r["persist"]])):
        haircut[name] = {str(h): sum(1 for r in sel if r["net_bps"] - h > 0) for h in HAIRCUTS}
        haircut[name]["n"] = len(sel)
    out["cross_venue"] = {**cs_, "funnel": fun, "haircut_survivors": haircut, "survivor_rows": survivors[:15],
                          "audited_positive_edge_labels": dict(posl)}

    # positive-edge census: every net-positive link pair with sim >= 0.65, labelled by hand
    cen_rows = [r for r in pairs_pos if simv(r) >= 0.65]
    cc = Counter(r["label"] for r in cen_rows)
    true_rows = [r for r in cen_rows if r["label"] in ("I", "Dm")]
    def trow(r):
        return {"venues": f"{r['va']}/{r['vb']}", "label": r["label"], "sim": round(r["sim"], 3), "a": r["a_text"][:46], "b": r["b_text"][:46],
                "net_bps": round(r["net_bps"], 1), "gross_bps": round(r["gross_bps"], 1) if r["gross_bps"] is not None else None,
                "capital_usd": r["cost"], "size_contracts": r["q"], "days_locked": r["days_locked"],
                "apr_net_pct": round(100 * r["apr_net"], 2) if r["apr_net"] is not None else None,
                "flags": ";".join(r["flags"]), "persist_recheck": r["persist"], "legs": r["legs"]}
    true_tab = sorted([trow(r) for r in true_rows], key=lambda d: -d["net_bps"])
    f2 = [("true links (I or Dm) with net>0 and sim>=0.65", len(true_rows))]
    t = [r for r in true_rows if r["label"] == "I"]
    f2.append(("... strictly identical (I)", len(t)))
    t = [r for r in t if "extreme_price_leg" not in r["flags"]]
    f2.append(("... no leg priced <=2c or >=98c", len(t)))
    t = [r for r in t if r["persist"] is not False]
    f2.append(("... persists on re-fetch (or not rechecked)", len(t)))
    t = [r for r in t if r["cost"] >= 10]
    f2.append(("... capital >= $10", len(t)))
    t = [r for r in t if (r["apr_net"] or 0) >= APR_HURDLE]
    f2.append((f"... net APR >= {int(APR_HURDLE*100)}%", len(t)))
    t = [r for r in t if r["net_bps"] - 300 > 0]
    f2.append(("... positive after 300 bps resolution haircut", len(t)))
    caps_true = [d["capital_usd"] for d in true_tab]
    out["positive_edge_census"] = {"pairs_sim_ge_0.65_net_positive": len(cen_rows), "labels": dict(cc),
                                   "true_link_net_bps_median": statistics.median([d["net_bps"] for d in true_tab]) if true_tab else None,
                                   "true_link_net_bps_p90": pct([d["net_bps"] for d in true_tab], 90),
                                   "true_link_capital_usd_median": statistics.median(caps_true) if caps_true else None,
                                   "true_link_capital_usd_p90": pct(caps_true, 90),
                                   "true_link_capital_usd_total": round(sum(caps_true), 2),
                                   "true_link_net_usd_total": round(sum(d["net_bps"] / 1e4 * d["capital_usd"] for d in true_tab), 2),
                                   "true_link_net_usd_total_excl_tail_legs": round(sum(d["net_bps"] / 1e4 * d["capital_usd"] for d in true_tab if "extreme_price_leg" not in d["flags"]), 2),
                                   "precision_strict": round(cc["I"] / len(cen_rows), 3) if cen_rows else None,
                                   "precision_lenient": round((cc["I"] + cc["Dm"]) / len(cen_rows), 3) if cen_rows else None,
                                   "true_link_rows": true_tab, "true_link_funnel": f2}
    cols = ["venues", "label", "sim", "a", "b", "net_bps", "gross_bps", "capital_usd", "size_contracts", "days_locked", "apr_net_pct", "flags", "persist_recheck"]
    write_csv(os.path.join(fx, "census_true_links.csv"), true_tab, cols)

    # ME sets by venue
    mv = {}
    for v in ("polymarket", "kalshi"):
        rv = [r for r in me if r["venue"] == v]
        sells = [r for r in rv if r["kind"] == "me_sell"]
        buys = [r for r in rv if r["kind"] == "me_buy"]
        verified = [r for r in buys if r.get("exhaustive") is True]
        mv[v] = {"sets_with_all_books": len({r["event"] for r in rv}),
                 "sell_evaluated": len(sells), "sell_gross_positive": sum(1 for r in sells if r["gross"] > 0), "sell_net_positive": sum(1 for r in sells if r["net"] > 0),
                 "buy_evaluated": len(buys), "buy_gross_positive": sum(1 for r in buys if r["gross"] > 0), "buy_net_positive": sum(1 for r in buys if r["net"] > 0),
                 "buy_exhaustive_verified_evaluated": len(verified), "buy_exhaustive_verified_gross_positive": sum(1 for r in verified if r["gross"] > 0),
                 "buy_exhaustive_verified_net_positive": sum(1 for r in verified if r["net"] > 0),
                 "sell_gross_usd_sum": round(sum(r["gross"] for r in sells if r["gross"] > 0), 2), "sell_fees_usd_on_those": round(sum(r["fees"] for r in sells if r["gross"] > 0), 2)}
    out["me_by_venue"] = mv

    # persistence overall
    chk = [r for r in pos if r["rechecked"]]
    out["persistence"] = {"net_positive_rows": len(pos), "rechecked": len(chk), "still_positive": sum(1 for r in chk if r["persist"]),
                          "median_abs_net_bps_change": statistics.median([abs((r["recheck_net_bps"] or 0) - r["net_bps"]) for r in chk]) if chk else None}

    # flags among gross-positive for each family
    def flag_share(rowsx):
        g = [r for r in rowsx if r["gross"] and r["gross"] > 0]
        if not g:
            return {"gross_positive": 0}
        fl = Counter(f for r in g for f in set(r["flags"]))
        anyf = sum(1 for r in g if r["flags"])
        stale = sum(1 for r in g if set(r["flags"]) & {"crossed_book", "past_end_date", "resolution_proposed", "book_untouched_6h"})
        return {"gross_positive": len(g), "with_any_flag": anyf, "with_stale_crossed_or_ended_flag": stale, "flag_counts": dict(fl)}
    out["flag_share"] = {"cross": flag_share(rows), "me": flag_share(me), "ladders": flag_share(lad)}
    # recheck for ME and ladders
    me_chk = [(r, me_rc.get((r["event"], r["kind"]))) for r in me if r["gross"] > 0]
    out["me_recheck"] = {"gross_positive": len(me_chk), "rechecked": sum(1 for _, rc in me_chk if rc), "still_gross_positive": sum(1 for _, rc in me_chk if rc and rc["gross"] > 0),
                         "net_positive_original": sum(1 for r, _ in me_chk if r["net"] > 0),
                         "net_positive_recheck": sum(1 for _, rc in me_chk if rc and rc["net"] > 0)}
    lad_chk = [(r, lad_rc.get((r["easy"], r["hard"]))) for r in lad if r["gross"] > 0]
    out["ladder_recheck"] = {"gross_positive": len(lad_chk), "rechecked": sum(1 for _, rc in lad_chk if rc), "still_gross_positive": sum(1 for _, rc in lad_chk if rc and rc["gross"] > 0),
                             "net_positive_original": sum(1 for r, _ in lad_chk if r["net"] > 0), "net_positive_recheck": sum(1 for _, rc in lad_chk if rc and rc["net"] > 0)}

    # ------------------------------------------------------------------ attribution of gross-positive rows (first matching cause)
    def attribute(rowx, family):
        fl = set(rowx.get("flags", []))
        if fl & {"crossed_book"}:
            return "crossed_book"
        if fl & {"past_end_date", "resolution_proposed"}:
            return "market_already_ended_or_resolution_proposed"
        if family == "cross":
            sm = rowx["sim"] if rowx["sim"] is not None else 2.0
            if rowx.get("label") == "X":
                return "false_link_confirmed_by_reading_rules"
            if sm < 0.65:
                return "link_unverified_low_similarity (audit: 0-25% genuine)"
        if family == "me" and rowx["kind"] == "me_buy" and rowx.get("exhaustive") is not True:
            return "set_not_proven_exhaustive"
        if rowx["net"] <= 0:
            return "taker_fees_exceed_gross_edge"
        if "extreme_price_leg" in fl:
            return "tail_price_leg (<=2c or >=98c)"
        if rowx["cost"] < 10:
            return "capital_below_10_usd"
        if family == "cross" and rowx.get("persist") is False:
            return "edge_vanished_on_refetch"
        if family == "cross" and (rowx.get("apr_net") or 0) < APR_HURDLE:
            return "net_apr_below_5pct_on_locked_capital"
        return "remaining_candidate"
    attr = {}
    attr["cross_pairs"] = dict(Counter(attribute(r, "cross") for r in pairs_eval if r["gross"] > 0))
    attr["me_rows"] = dict(Counter(attribute(r, "me") for r in me if r["gross"] > 0))
    attr["ladder_rows"] = dict(Counter(attribute(r, "ladder") for r in lad if r["gross"] > 0))
    out["attribution_of_gross_positive"] = attr

    # ------------------------------------------------------------------ write compact files
    keep_cols = ["pair_key", "va", "vb", "sim", "orient", "dir", "net_bps", "gross_bps", "q", "cost", "fees", "net", "days_locked", "apr_net",
                 "rechecked", "persist", "recheck_net_bps", "label", "flags", "a_text", "b_text"]
    top = sorted(pairs_eval, key=lambda r: -(r["net_bps"] if r["net_bps"] is not None else -1e9))
    crows = []
    for r in top:
        if r["gross"] <= 0:
            continue
        d = {k: r.get(k) for k in keep_cols}
        d["flags"] = ";".join(r["flags"])
        d["a_text"] = (d["a_text"] or "")[:60]
        d["b_text"] = (d["b_text"] or "")[:60]
        d["pair_key"] = d["pair_key"].replace("pm:0x", "pm:0x")[:20] + ".." + d["pair_key"][-12:]
        crows.append(d)
    # keep the file small: top 120 by net_bps among sim>=0.55, plus all audited labels
    crows = [d for d in crows][:140]
    write_csv(os.path.join(fx, "cross_candidates_top.csv"), crows, keep_cols)
    mrows = sorted([r for r in me if r["gross"] > 0], key=lambda r: -r["gross"])[:80]
    mcols = ["kind", "venue", "title", "n_legs", "exhaustive", "sum_bid_touch", "sum_ask_touch", "q", "cost", "fees", "gross", "net", "net_bps", "flags"]
    write_csv(os.path.join(fx, "me_sets_results.csv"), [{**{c: r.get(c) for c in mcols}, "title": (r.get("title") or "")[:60], "flags": ";".join(r.get("flags", []))} for r in mrows], mcols)
    lrows = sorted([r for r in lad if r["gross"] > 0], key=lambda r: -r["gross"])
    lcols = ["kind", "venue", "listing_gap", "book_gap", "q", "cost", "fees", "gross", "net", "net_bps", "flags", "easy", "hard"]
    write_csv(os.path.join(fx, "ladder_results.csv"), [{**{c: r.get(c) for c in lcols}, "flags": ";".join(r.get("flags", []))} for r in lrows], lcols)
    sl = []
    for x in sample:
        lab = labels[x["a"]["key"] + "|" + x["b"]["key"]]
        sl.append({"id": x["id"], "stratum": x["stratum"], "sim": x["sim"], "orient": x["orient"], "label": lab["label"], "note": lab["note"],
                   "best_net_bps": round(x["best_net_bps"], 1) if x["best_net_bps"] is not None else None,
                   "a": {"venue": x["a"]["venue"], "text": x["a"]["text"][:110], "rules_head": (x["a"]["rules"] or "")[:160]},
                   "b": {"venue": x["b"]["venue"], "text": x["b"]["text"][:110], "rules_head": (x["b"]["rules"] or "")[:160]}})
    jdump(sl, os.path.join(fx, "audit_sample_labeled.json"))
    jdump(audit_res, os.path.join(fx, "audit_results.json"), indent=1)
    jdump(out, os.path.join(fx, "final_summary.json"), indent=1)
    print(json.dumps({k: out[k] for k in ("persistence", "me_recheck", "ladder_recheck", "screen_calibration")}, indent=1, default=str))
    print(json.dumps(out["cross_venue"]["funnel"], indent=1))
    print(json.dumps(out["cross_venue"]["haircut_survivors"], indent=1))
    print(json.dumps(out["positive_edge_census"]["true_link_funnel"], indent=1))


if __name__ == "__main__":
    main()
