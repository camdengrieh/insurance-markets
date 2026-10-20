"""Stage B: screen the listings (top-of-book quotes only) and decide which order books to fetch.

  python3 -I screen.py --raw RAW

Writes RAW/screen/{links.json, families.json, sets.json, targets.json}.
Nothing here touches the network.
"""
import argparse
import json
import os
import random
import sys
from collections import defaultdict
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ladders  # noqa: E402
import linking  # noqa: E402
from common import D  # noqa: E402
from universe import load_all  # noqa: E402

ONE = Decimal(1)


def me_sets(U):
    """Mutually-exclusive candidate sets from the listings.
    Polymarket: event.negRisk (all markets mutually exclusive).  Kalshi: event.mutually_exclusive."""
    sets = []
    pm = defaultdict(list)
    for m in U["polymarket"]:
        if m["neg_risk"]:
            pm[m["event_key"]].append(m)
    for ek, ms in pm.items():
        trad = [m for m in ms if m["tradable"]]
        if len(trad) < 2:
            continue
        sets.append({"venue": "polymarket", "event_key": ek, "title": ms[0].get("event_title"), "legs": [m["key"] for m in trad],
                     "n_listed": len(ms), "n_tradable": len(trad), "complete": ms[0]["event_complete"],
                     "augmented": ms[0]["neg_risk_augmented"], "has_other": any(m["neg_risk_other"] for m in ms),
                     "n_untradable": len(ms) - len(trad)})
    ka = defaultdict(list)
    for m in U["kalshi"]:
        if m["mutually_exclusive"] and m["quoted"]:
            ka[m["event_key"]].append(m)
    for ek, ms in ka.items():
        if len(ms) < 2:
            continue
        sets.append({"venue": "kalshi", "event_key": ek, "title": ms[0].get("event_title"), "legs": [m["key"] for m in ms],
                     "n_listed": ms[0]["n_event_markets"], "n_tradable": len(ms), "complete": True,
                     "augmented": False, "has_other": False, "n_untradable": ms[0]["n_event_markets"] - len(ms),
                     "collateral_return_type": ms[0].get("collateral_return_type")})
    return sets


def listing_sums(S, idx):
    sb = sum((idx[k]["bid"] or 0) for k in S["legs"])
    quoted_asks = [idx[k]["ask"] for k in S["legs"]]
    sa = sum((a for a in quoted_asks if a is not None), Decimal(0))
    return sb, sa, all(a is not None for a in quoted_asks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--pm-budget", type=int, default=390)
    ap.add_argument("--lm-budget", type=int, default=300)
    args = ap.parse_args()
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    out_dir = os.path.join(args.raw, "screen")
    os.makedirs(out_dir, exist_ok=True)

    # ---- ladders
    fams = ladders.all_families(U, extra["kalshi_events"], snaps["polymarket"])
    near = []   # ladder pairs whose listing quotes are within 2c of a violation
    for f in fams:
        for e, h in ladders.easy_hard_pairs(f):
            me, mh = idx[e], idx[h]
            if mh["bid"] is None or me["ask"] is None:
                continue
            gap = mh["bid"] - me["ask"]
            if gap >= Decimal("-0.02"):
                near.append({"easy": e, "hard": h, "venue": f["venue"], "kind": f["kind"], "gap": float(gap)})
    # ---- ME sets
    sets = me_sets(U)
    for S in sets:
        sb, sa, allq = listing_sums(S, idx)
        S["sum_bid_listing"] = float(sb)
        S["sum_ask_listing"] = float(sa) if allq else None
    # ---- links
    res, docs = linking.link_venues(U)
    hints = linking.explicit_hint_links(U)
    links = []
    for r in res:
        if r["sim"] < 0.45:
            continue
        a, b = idx[r["a"]], idx[r["b"]]
        r = dict(r)
        r["pm_side"] = None
        if a["venue"] == "polymarket":
            r["pm_side"] = linking.pick_pm_side(a, b)
        elif b["venue"] == "polymarket":
            r["pm_side"] = linking.pick_pm_side(b, a)
        sa = r["pm_side"] if (a["venue"] == "polymarket" and r["pm_side"] is not None) else 0
        sb = r["pm_side"] if (b["venue"] == "polymarket" and r["pm_side"] is not None) else 0
        r["orient"] = linking.orientation(a, b, sa, sb)
        r["two_way"] = bool(linking.two_way(a) or linking.two_way(b))
        links.append(r)
    for h in hints:
        links.append({**h, "sim": None, "cos": None, "seq": None, "pm_side": 0, "orient": "same", "two_way": False})
    print("families", len(fams), "near-violation ladder pairs", len(near), "ME sets", len(sets), "links", len(links), "hints", len(hints))

    # ---- targets
    pm_t, ka_t, lm_t, xo_t = {}, {}, {}, {}

    def add(d, key, why):
        d.setdefault(key, set()).add(why)

    pm_trad = [m for m in U["polymarket"] if m["tradable"] and not m["past_end"]]
    for m in sorted(pm_trad, key=lambda m: -m["liq"])[:75]:
        add(pm_t, m["key"], "liquid_top75_liq")
    for m in sorted(pm_trad, key=lambda m: -m["vol24"])[:75]:
        add(pm_t, m["key"], "liquid_top75_vol24")
    # ME sets worth a depth check
    cand_sets = []
    for S in sets:
        if S["venue"] != "polymarket":
            continue
        sb, sa = S["sum_bid_listing"], S["sum_ask_listing"]
        near_sell = sb >= 0.985
        near_buy = S["complete"] and sa is not None and sa <= 1.02 and S["n_untradable"] == 0
        if (near_sell or near_buy) and len(S["legs"]) <= 45:
            cand_sets.append((max(sb - 1, (1 - sa) if sa is not None else -9), S))
    cand_sets.sort(key=lambda x: -x[0])
    used = 0
    for score, S in cand_sets:
        if used + len(S["legs"]) > 170:
            continue
        for k in S["legs"]:
            add(pm_t, k, "me_set")
        used += len(S["legs"])
    # ladder near-violations
    lad = [n for n in near if n["venue"] == "polymarket"]
    lad.sort(key=lambda n: -n["gap"])
    c = 0
    for n in lad:
        if c >= 70:
            break
        add(pm_t, n["easy"], "ladder")
        add(pm_t, n["hard"], "ladder")
        c += 2
    for n in near:
        if n["venue"] == "kalshi":
            add(ka_t, n["easy"], "ladder")
            add(ka_t, n["hard"], "ladder")
        elif n["venue"] == "limitless":
            add(lm_t, n["easy"], "ladder")
            add(lm_t, n["hard"], "ladder")
    # cross-venue links, best first
    pm_links = [l for l in links if "polymarket" in (l["va"], l["vb"]) and (l.get("sim") is None or l["sim"] >= 0.55)]

    def pm_key(l):
        return l["a"] if l["va"] == "polymarket" else l["b"]

    def other_key(l):
        return l["b"] if l["va"] == "polymarket" else l["a"]

    pm_links.sort(key=lambda l: -(l["sim"] if l["sim"] is not None else 2))
    budget_left = args.pm_budget - len(pm_t)
    for l in pm_links:
        if budget_left <= 0:
            break
        k = pm_key(l)
        if k not in pm_t:
            budget_left -= 1
        add(pm_t, k, "link")
        ok = other_key(l)
        v = idx[ok]["venue"]
        {"kalshi": ka_t, "limitless": lm_t, "xo": xo_t}[v].setdefault(ok, set()).add("link")
    # links not involving polymarket
    for l in links:
        if "polymarket" in (l["va"], l["vb"]):
            continue
        if l.get("sim") is None or l["sim"] < 0.6:
            continue
        for k in (l["a"], l["b"]):
            {"kalshi": ka_t, "limitless": lm_t, "xo": xo_t}[idx[k]["venue"]].setdefault(k, set()).add("link")

    # Kalshi
    ka_q = [m for m in U["kalshi"] if m["quoted"]]
    for m in sorted(ka_q, key=lambda m: -m["vol24"])[:220]:
        add(ka_t, m["key"], "liquid_top_vol24")
    for m in sorted(ka_q, key=lambda m: -m["oi"])[:120]:
        add(ka_t, m["key"], "liquid_top_oi")
    ks = []
    for S in sets:
        if S["venue"] != "kalshi":
            continue
        sb = S["sum_bid_listing"]
        if sb >= 0.97 or (S["sum_ask_listing"] is not None and S["sum_ask_listing"] <= 1.03):
            ks.append((sb, S))
    ks.sort(key=lambda x: -x[0])
    n_ka_me = 0
    for sb, S in ks:
        if n_ka_me + len(S["legs"]) > 3500:
            continue
        for k in S["legs"]:
            add(ka_t, k, "me_set")
        n_ka_me += len(S["legs"])
    # XO: everything tradable
    for m in U["xo"]:
        if m["tradable"]:
            add(xo_t, m["key"], "all_xo")
    # Limitless: ladder groups + links + top volume, capped
    lm_groups = ladders_members = set()
    for f in fams:
        if f["venue"] == "limitless":
            for mem in f["members"]:
                add(lm_t, mem["key"], "ladder_family")
    for m in sorted([m for m in U["limitless"] if m["tradable"]], key=lambda m: -m["vol"])[:150]:
        add(lm_t, m["key"], "top_vol")
    lm_keys = list(lm_t)
    if len(lm_keys) > args.lm_budget:
        # keep link/ladder-tagged first
        pri = sorted(lm_keys, key=lambda k: (0 if lm_t[k] & {"link", "ladder"} else 1 if "ladder_family" in lm_t[k] else 2))
        keep = set(pri[:args.lm_budget])
        for k in lm_keys:
            if k not in keep:
                del lm_t[k]

    def ser(d):
        return {k: sorted(v) for k, v in d.items()}

    targets = {"polymarket": ser(pm_t), "kalshi": ser(ka_t), "limitless": ser(lm_t), "xo": ser(xo_t)}
    for v, d in targets.items():
        print("targets", v, len(d))
    json.dump(targets, open(os.path.join(out_dir, "targets.json"), "w"))
    # what is still missing from the books already fetched (so the fetch can be incremental)
    have = {}
    for v in targets:
        p = os.path.join(args.raw, "books", v + ".json")
        have[v] = set(json.load(open(p))) if os.path.exists(p) else set()
    missing = {v: [k for k in targets[v] if k not in have[v]] for v in targets}
    json.dump(missing, open(os.path.join(out_dir, "targets_missing.json"), "w"))
    for v in missing:
        print("missing books", v, len(missing[v]))
    json.dump(links, open(os.path.join(out_dir, "links.json"), "w"), default=str)
    json.dump(fams, open(os.path.join(out_dir, "families.json"), "w"))
    json.dump(sets, open(os.path.join(out_dir, "sets.json"), "w"))
    json.dump(near, open(os.path.join(out_dir, "near_ladder_pairs.json"), "w"))


if __name__ == "__main__":
    main()
