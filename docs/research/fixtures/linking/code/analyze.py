"""Stage D: the measurements (analyses 1-4 and 6) on executable prices.

  python3 -I analyze.py --raw RAW --out OUTDIR [--recheck]

Every package is "buy every leg at its executable ask (a NO leg = hit the YES bid at 1 - bid),
collect the guaranteed MINIMUM payoff of the package", so net = payoff*q - cost - taker fees.
Reads RAW/books/*.json, RAW/screen/*.json; writes compact JSON/CSV to OUTDIR.
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
from common import (Book, Leg, ONE, ZERO, D, bps_of, book_from_kalshi, book_from_limitless,  # noqa: E402
                    book_from_polylike, fee_kalshi, fee_limitless_buy, fee_polymarket, fee_xo, fnum, jdump, optimise)
from universe import load_all  # noqa: E402

DEFAULT_XO_BPS = 400          # conservative: Conviction markets report takerFeeBps 400 in the Data API
DUST_LO, DUST_HI = Decimal("0.02"), Decimal("0.98")


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------
def load_books(raw, tag=""):
    books = {}
    for v in ("polymarket", "kalshi", "xo", "limitless"):
        p = os.path.join(raw, "books", f"{v}{('_' + tag) if tag else ''}.json")
        if not os.path.exists(p):
            continue
        for key, rec in json.load(open(p)).items():
            b = None
            r = rec.get("raw")
            if rec.get("status") == 200 and r is not None:
                if v in ("polymarket", "xo"):
                    b = book_from_polylike(r)
                elif v == "kalshi":
                    b = book_from_kalshi(r)
                else:
                    b = book_from_limitless(r)
            books[key] = {"book": b, "t": rec.get("t"), "status": rec.get("status"), "raw": r}
    return books


def fee_fn(m):
    v = m["venue"]
    if v == "polymarket":
        f = m["fee"]
        return lambda fills: fee_polymarket(fills, f.get("rate"), f.get("exponent") or 1, f.get("enabled"))
    if v == "kalshi":
        mult = m["fee"].get("multiplier")
        mult = 1 if mult is None else mult
        return lambda fills: fee_kalshi(fills, mult)
    if v == "xo":
        bps = m["fee"].get("bps")
        bps = DEFAULT_XO_BPS if bps is None else bps
        return lambda fills: fee_xo(fills, bps)
    if v == "limitless":
        en = m["fee"].get("enabled", True)
        return lambda fills: fee_limitless_buy(fills, en)
    raise ValueError(v)


def oriented(book, flip):
    if not flip:
        return book
    return Book([(ONE - p, s) for p, s in book.asks], [(ONE - p, s) for p, s in book.bids], ts=book.ts)


def mk_leg(m, book, side, label):
    lv = book.yes_buy_levels() if side == "yes" else book.no_buy_levels()
    return Leg(label, lv, fee_fn(m), min_size=m.get("min_size") if m["venue"] == "polymarket" else None, venue=m["venue"],
               meta={"key": m["key"], "side": side})


def run_package(legs, payoff, kind, extra=None):
    if not legs or any(not l.levels for l in legs):
        return None
    opt = optimise(legs, payoff)
    if not opt or not opt["best"]:
        return None
    best, touch = opt["best"], opt["touch"]
    rec = {"kind": kind, "n_legs": len(legs), "payoff": float(payoff), "q": fnum(best["q"], 4), "cost": fnum(best["cost"], 4),
           "fees": fnum(best["fees"], 4), "gross": fnum(best["gross"], 4), "net": fnum(best["net"], 4),
           "net_bps": bps_of(best["net"], best["cost"]), "gross_bps": bps_of(best["gross"], best["cost"]),
           "touch_q": fnum(touch["q"], 4) if touch else None, "touch_net": fnum(touch["net"], 4) if touch else None,
           "touch_gross": fnum(touch["gross"], 4) if touch else None, "touch_cost": fnum(touch["cost"], 4) if touch else None,
           "max_depth": fnum(opt["max_depth"], 2),
           "legs": [{"label": l.label, "touch": fnum(l.levels[0][0], 4), "key": l.meta.get("key"), "side": l.meta.get("side")} for l in legs]}
    # min-order-size feasibility (Polymarket 5 shares)
    mins = [l.min_size for l in legs if l.min_size]
    rec["below_min_size"] = bool(mins and best["q"] < max(mins))
    if extra:
        rec.update(extra)
    return rec


# --------------------------------------------------------------------------
# flags
# --------------------------------------------------------------------------
def leg_flags(idx, books, keys, snap_t):
    fl = set()
    for k in keys:
        m = idx[k]
        b = books.get(k, {}).get("book")
        if b is None:
            fl.add("no_book")
            continue
        if b.crossed():
            fl.add("crossed_book")
        if b.ts and books[k].get("t") and books[k]["t"] - b.ts > 6 * 3600:
            fl.add("book_untouched_6h")
        if m["venue"] == "polymarket":
            if m.get("past_end"):
                fl.add("past_end_date")
            if m.get("uma_status") and any(s in ("proposed", "resolved", "disputed") for s in (m["uma_status"] if isinstance(m["uma_status"], list) else [m["uma_status"]])):
                fl.add("resolution_proposed")
        if m["venue"] == "kalshi":
            e = m.get("expected_end") or m.get("end")
            if e and e < snap_t:
                fl.add("past_end_date")
        bb, ba = b.best_bid, b.best_ask
        for p in (bb, ba):
            if p is not None and (p <= DUST_LO or p >= DUST_HI):
                fl.add("extreme_price_leg")
    return sorted(fl)


# --------------------------------------------------------------------------
# analysis 1: mutually-exclusive sets
# --------------------------------------------------------------------------
def exhaustive_flag(S):
    if S["venue"] == "polymarket":
        if S["n_untradable"] > 0 or not S["complete"]:
            return False, "incomplete (untradable or unfetched legs)"
        if S["augmented"] and not S["has_other"]:
            return False, "augmented neg-risk without Other"
        return True, "negRisk flag + all legs tradable" + (" (augmented, Other present)" if S["augmented"] else "")
    return None, "Kalshi exposes mutually_exclusive but no exhaustive flag"


def analysis_me(U, idx, books, sets, snap_t):
    out = []
    for S in sets:
        legs_keys = S["legs"]
        have = [k for k in legs_keys if books.get(k, {}).get("book") is not None]
        if len(have) < len(legs_keys):
            continue
        sells, buys = [], []
        view = {k: books[k]["book"] for k in legs_keys}
        ex, why = exhaustive_flag(S)
        sb_touch = sum((view[k].best_bid or ZERO) for k in legs_keys)
        sa_touch = sum((view[k].best_ask or ONE) for k in legs_keys)
        asks_all = all(view[k].best_ask is not None for k in legs_keys)
        base = {"venue": S["venue"], "event": S["event_key"], "title": S["title"], "n_legs": len(legs_keys),
                "sum_bid_touch": fnum(sb_touch, 4), "sum_ask_touch": fnum(sa_touch, 4) if asks_all else None,
                "exhaustive": ex, "exhaustive_basis": why, "n_untradable": S["n_untradable"], "augmented": S["augmented"]}
        # SELL side: buy NO of every leg that has a bid; payoff >= (#legs bought) - 1
        cand = [k for k in legs_keys if view[k].best_bid is not None and view[k].best_bid >= Decimal("0.005")]
        rec = None
        if len(cand) >= 2:
            def build(keys):
                return [mk_leg(idx[k], view[k], "no", idx[k]["label"] or idx[k]["title"][:40]) for k in keys]
            cur = list(cand)
            rec = run_package(build(cur), len(cur) - 1, "me_sell", dict(base))
            if rec and len(cur) <= 12:
                improved = True
                while improved and len(cur) > 2:
                    improved = False
                    best_try = None
                    for j in range(len(cur)):
                        trial = cur[:j] + cur[j + 1:]
                        r = run_package(build(trial), len(trial) - 1, "me_sell", dict(base))
                        if r and r["net"] > (best_try["net"] if best_try else rec["net"]):
                            best_try, best_trial = r, trial
                    if best_try:
                        rec, cur, improved = best_try, best_trial, True
            if rec:
                rec["legs_used"] = len(cur)
        if rec:
            rec["flags"] = leg_flags(idx, books, legs_keys, snap_t)
            sells.append(rec)
        # BUY side: needs every leg ask and an exhaustive set
        if asks_all:
            legs = [mk_leg(idx[k], view[k], "yes", idx[k]["label"] or idx[k]["title"][:40]) for k in legs_keys]
            r = run_package(legs, 1, "me_buy", dict(base))
            if r:
                r["flags"] = leg_flags(idx, books, legs_keys, snap_t)
                if ex is not True:
                    r["flags"].append("exhaustiveness_unverified" if ex is None else "not_exhaustive")
                buys.append(r)
        out.extend(sells + buys)
    return out


# --------------------------------------------------------------------------
# analysis 2: complements
# --------------------------------------------------------------------------
def analysis_complement(U, idx, books, mirror, snap_t):
    res = {"per_venue": {}, "opps": []}
    for v in ("polymarket", "kalshi", "xo", "limitless"):
        keys = [k for k in books if idx.get(k, {}).get("venue") == v and books[k]["book"] is not None]
        nonempty = [k for k in keys if books[k]["book"].bids or books[k]["book"].asks]
        two_sided = [k for k in keys if books[k]["book"].bids and books[k]["book"].asks]
        crossed = [k for k in two_sided if books[k]["book"].crossed()]
        res["per_venue"][v] = {"books": len(keys), "nonempty": len(nonempty), "two_sided": len(two_sided),
                               "crossed_single_book": len(crossed), "crossed_keys": crossed[:10]}
        # YES-book-only identity: YES ask + NO ask = 1 + spread >= 1, so a derived NO leg cannot create an arb.
        # The only way a within-market complement edge exists is a crossed book.
        for k in crossed:
            b = books[k]["book"]
            legs = [mk_leg(idx[k], b, "yes", "YES"), mk_leg(idx[k], b, "no", "NO")]
            r = run_package(legs, 1, "complement_crossed", {"key": k, "title": idx[k]["title"][:80]})
            if r:
                r["flags"] = leg_flags(idx, books, [k], snap_t) + ["crossed_book"]
                res["opps"].append(r)
    # independent NO-token books (mirror tests): is the NO book the mirror image of the YES book?
    for v, mir in mirror.items():
        n_cmp = n_exact = n_price_equal = n_both_empty = 0
        arb = 0
        details = []
        for k, rec in mir.items():
            if rec.get("raw") is None:
                continue
            yb = books.get(k, {}).get("book")
            nb = book_from_polylike(rec["raw"])
            if yb is None or nb is None:
                continue
            n_cmp += 1
            if not (yb.bids or yb.asks or nb.bids or nb.asks):
                n_both_empty += 1
                continue
            mir_asks = [(ONE - p, s) for p, s in yb.bids]            # NO asks implied by YES bids
            mir_bids = [(ONE - p, s) for p, s in yb.asks]
            same_px = ([p for p, _ in nb.asks] == [p for p, _ in sorted(mir_asks)]) and ([p for p, _ in nb.bids] == [p for p, _ in sorted(mir_bids, reverse=True)])
            same_all = same_px and ([s for _, s in nb.asks] == [s for _, s in sorted(mir_asks)])
            n_price_equal += same_px
            n_exact += same_all
            # independent-book complement arb: YES ask + NO ask < 1 (cross-book, taken at different instants)
            if yb.best_ask is not None and nb.best_ask is not None and yb.best_ask + nb.best_ask < 1:
                arb += 1
                details.append({"key": k, "yes_ask": float(yb.best_ask), "no_ask": float(nb.best_ask)})
            if yb.best_bid is not None and nb.best_bid is not None and yb.best_bid + nb.best_bid > 1:
                arb += 1
                details.append({"key": k, "yes_bid": float(yb.best_bid), "no_bid": float(nb.best_bid)})
        res["per_venue"].setdefault(v, {})["mirror_test"] = {"compared": n_cmp, "both_empty": n_both_empty, "price_levels_identical": n_price_equal,
                                                          "prices_and_sizes_identical": n_exact, "ask_sum_below_1_or_bid_sum_above_1": arb,
                                                          "examples": details[:5]}
    return res


# --------------------------------------------------------------------------
# analysis 3: ladders
# --------------------------------------------------------------------------
def analysis_ladders(U, idx, books, near, snap_t):
    rows, checked = [], Counter()
    viol_book, viol_listing = Counter(), Counter()
    seen = set()
    for n in near:
        e, h = n["easy"], n["hard"]
        be, bh = books.get(e, {}).get("book"), books.get(h, {}).get("book")
        if be is None or bh is None:
            continue
        if (e, h) in seen:
            continue
        seen.add((e, h))
        me, mh = idx[e], idx[h]
        if not be.asks or not bh.bids:
            continue
        v = n["venue"]
        checked[v] += 1
        if n["gap"] > 0:
            viol_listing[v] += 1
        if bh.best_bid > be.best_ask:
            viol_book[v] += 1
        legs = [mk_leg(me, be, "yes", "easy YES: " + me["text"][:50]), mk_leg(mh, bh, "no", "hard NO: " + mh["text"][:50])]
        r = run_package(legs, 1, "ladder_" + n["kind"], {"venue": v, "easy": e, "hard": h, "listing_gap": n["gap"],
                                                        "book_gap": fnum(bh.best_bid - be.best_ask, 4)})
        if r:
            r["flags"] = leg_flags(idx, books, [e, h], snap_t)
            rows.append(r)
    return rows, {"pairs_with_both_books": dict(checked), "violations_on_book": dict(viol_book), "violations_in_listing": dict(viol_listing)}


# --------------------------------------------------------------------------
# analysis 4: cross-venue
# --------------------------------------------------------------------------
def analysis_cross(U, idx, books, links, snap_t, min_sim=0.45):
    rows, n_pairs, skipped = [], 0, Counter()
    for l in links:
        a, b = idx.get(l["a"]), idx.get(l["b"])
        if not a or not b:
            continue
        ba, bb = books.get(l["a"], {}).get("book"), books.get(l["b"], {}).get("book")
        if ba is None or bb is None:
            skipped["no_book"] += 1
            continue
        if not (ba.bids or ba.asks) or not (bb.bids or bb.asks):
            skipped["empty_book"] += 1
            continue
        flipa = flipb = False
        orient = l.get("orient", "same")
        if orient in ("unknown", "different_outcome"):
            skipped["orientation_" + orient] += 1
            continue
        if orient == "inverse":
            if not l.get("two_way"):
                skipped["inverse_but_not_verified_two_way"] += 1
                continue
            flipb = True
        if "polymarket" in (a["venue"], b["venue"]):
            side = l.get("pm_side")
            if side is None:
                skipped["pm_side_ambiguous"] += 1
                continue
            if a["venue"] == "polymarket":
                flipa = side == 1
            else:
                flipb = (side == 1) != flipb      # xor with a prior inverse flip
        va, vb = oriented(ba, flipa), oriented(bb, flipb)
        n_pairs += 1
        for d, (sa, sb) in {"buyA_buyNotB": ("yes", "no"), "buyNotA_buyB": ("no", "yes")}.items():
            if (sa == "yes" and not va.asks) or (sa == "no" and not va.bids) or (sb == "yes" and not vb.asks) or (sb == "no" and not vb.bids):
                continue
            legs = [mk_leg(a, va, sa, f"{a['venue']} {sa}"), mk_leg(b, vb, sb, f"{b['venue']} {sb}")]
            r = run_package(legs, 1, "cross", {"a": l["a"], "b": l["b"], "va": a["venue"], "vb": b["venue"], "dir": d, "sim": l.get("sim"),
                                              "hint": l.get("hint"), "pm_side": l.get("pm_side"), "orient": orient,
                                              "a_text": a["text"][:90], "b_text": b["text"][:90],
                                              "end_gap_days": (abs(a["end"] - b["end"]) / 86400.0) if a.get("end") and b.get("end") else None})
            if r:
                r["flags"] = leg_flags(idx, books, [l["a"], l["b"]], snap_t)
                rows.append(r)
    return rows, {"link_pairs_with_books": n_pairs, "skipped": dict(skipped)}


# --------------------------------------------------------------------------
# listing vs book consistency (staleness of the screening quotes)
# --------------------------------------------------------------------------
def listing_vs_book(idx, books):
    res = {}
    for v in ("polymarket", "kalshi"):
        n = same = off1 = bigger = 0
        diffs = []
        for k, rec in books.items():
            m = idx.get(k)
            if not m or m["venue"] != v or rec["book"] is None:
                continue
            b = rec["book"]
            if m["ask"] is None or b.best_ask is None:
                continue
            n += 1
            d = abs(m["ask"] - b.best_ask)
            diffs.append(float(d))
            if d == 0:
                same += 1
            elif d <= Decimal("0.011"):
                off1 += 1
            else:
                bigger += 1
        res[v] = {"compared_best_ask": n, "identical": same, "within_one_cent": off1, "more_than_one_cent": bigger,
                  "median_abs_diff": statistics.median(diffs) if diffs else None}
    return res


def pct(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    i = min(len(xs) - 1, max(0, int(round(p / 100 * (len(xs) - 1)))))
    return xs[i]


def summarize_opps(rows, label):
    pos = [r for r in rows if r["net"] is not None and r["net"] > 0]
    gpos = [r for r in rows if r["gross"] is not None and r["gross"] > 0]
    caps = [r["cost"] for r in pos]
    bps = [r["net_bps"] for r in pos if r["net_bps"] is not None]
    flagged = [r for r in pos if r.get("flags")]
    fc = Counter(f for r in pos for f in r.get("flags", []))
    return {"label": label, "evaluated": len(rows), "gross_positive": len(gpos), "net_positive": len(pos),
            "net_positive_unflagged": len(pos) - len(flagged), "flag_counts_among_net_positive": dict(fc),
            "net_bps_median": statistics.median(bps) if bps else None, "net_bps_p90": pct(bps, 90), "net_bps_max": max(bps) if bps else None,
            "capital_usd_median": statistics.median(caps) if caps else None, "capital_usd_p90": pct(caps, 90),
            "capital_usd_total": sum(caps) if caps else 0, "net_usd_total": sum(r["net"] for r in pos) if pos else 0,
            "below_min_size": sum(1 for r in pos if r.get("below_min_size"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--books-tag", default="")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    snap_t = snaps["polymarket"]
    books = load_books(args.raw, args.books_tag)
    mirror = {}
    for v in ("polymarket", "xo"):
        p = os.path.join(args.raw, "books", f"{v}_mirror.json")
        if os.path.exists(p):
            mirror[v] = json.load(open(p))
    # optional XO fee refinement
    xf = os.path.join(args.raw, "xo_fees.json")
    if os.path.exists(xf):
        for k, bps in json.load(open(xf)).items():
            if k in idx:
                idx[k]["fee"]["bps"] = bps
    sc = os.path.join(args.raw, "screen")
    sets = json.load(open(os.path.join(sc, "sets.json")))
    near = json.load(open(os.path.join(sc, "near_ladder_pairs.json")))
    links = json.load(open(os.path.join(sc, "links.json")))
    os.makedirs(args.out, exist_ok=True)

    t0 = time.time()
    me = analysis_me(U, idx, books, sets, snap_t)
    comp = analysis_complement(U, idx, books, mirror, snap_t)
    lad, lad_stats = analysis_ladders(U, idx, books, near, snap_t)
    cross, cross_stats = analysis_cross(U, idx, books, links, snap_t)
    lvb = listing_vs_book(idx, books)
    print("analysis time", round(time.time() - t0, 1))

    summary = {
        "me_sets": {"sets_total_in_listings": len(sets), "sets_with_all_books": len({r["event"] for r in me}),
                    "sell_side": summarize_opps([r for r in me if r["kind"] == "me_sell"], "me_sell"),
                    "buy_side_all": summarize_opps([r for r in me if r["kind"] == "me_buy"], "me_buy"),
                    "buy_side_exhaustive_verified": summarize_opps([r for r in me if r["kind"] == "me_buy" and r.get("exhaustive") is True], "me_buy_verified")},
        "complement": {"per_venue": comp["per_venue"], "crossed_book_opps": summarize_opps(comp["opps"], "complement_crossed")},
        "ladders": {"stats": lad_stats, "all": summarize_opps(lad, "ladders"),
                    "threshold": summarize_opps([r for r in lad if r["kind"] == "ladder_threshold"], "threshold"),
                    "date": summarize_opps([r for r in lad if r["kind"] == "ladder_date"], "date")},
        "cross": {"stats": cross_stats, "all": summarize_opps(cross, "cross")},
        "listing_vs_book": lvb,
    }
    if args.no_write:
        print(json.dumps(summary, indent=1, default=str)[:6000])
        return
    suf = ("_" + args.books_tag) if args.books_tag else ""
    jdump(summary, os.path.join(args.out, f"analysis_summary{suf}.json"), indent=1)
    allrows = {"me": me, "ladders": lad, "cross": cross, "complement": comp["opps"]}
    # compact opportunity table: every row with gross>0, keep leg touches
    keep = []
    for name, rows in allrows.items():
        for r in rows:
            if r["gross"] is not None and r["gross"] > 0:
                keep.append({"family": name, **{k: v for k, v in r.items() if k != "legs"}, "legs": r["legs"]})
    keep.sort(key=lambda r: -(r["net"] if r["net"] is not None else -1e9))
    json.dump(keep, open(os.path.join(args.raw, f"opps_full{suf}.json"), "w"), default=str)
    print("gross-positive rows", len(keep))
    # also dump all cross rows for the report
    json.dump(cross, open(os.path.join(args.raw, f"cross_all{suf}.json"), "w"), default=str)
    json.dump(me, open(os.path.join(args.raw, f"me_all{suf}.json"), "w"), default=str)
    json.dump(lad, open(os.path.join(args.raw, f"ladder_all{suf}.json"), "w"), default=str)


if __name__ == "__main__":
    main()
