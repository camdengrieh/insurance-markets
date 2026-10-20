"""How sensitive are the Kalshi within-venue results to the fee model?

  python3 -I fee_sensitivity.py --raw RAW --out OUT.json

Re-runs the mutually-exclusive-set and ladder analyses on the SAME fetched books with (a) the baseline
(taker fee 0.07*C*P*(1-P) rounded up to a cent), (b) direct-member rounding ($0.0001 grid), (c) a hypothetical
quarter-size fee (what a mostly-maker execution might approximate), (d) zero fees (the gross upper bound).
"""
import argparse
import json
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze  # noqa: E402
import common  # noqa: E402


def run(label, U, idx, books, sets, near, snap):
    me = analyze.analysis_me(U, idx, books, sets, snap)
    lad, _ = analyze.analysis_ladders(U, idx, books, near, snap)
    ks = [r for r in me if r["venue"] == "kalshi" and r["kind"] == "me_sell"]
    kb = [r for r in me if r["venue"] == "kalshi" and r["kind"] == "me_buy"]
    return {"label": label, "kalshi_sell_sets_evaluated": len(ks), "kalshi_sell_gross_positive": sum(r["gross"] > 0 for r in ks),
            "kalshi_sell_net_positive": sum(r["net"] > 0 for r in ks),
            "kalshi_buy_net_positive_unverified_exhaustive": sum(r["net"] > 0 for r in kb),
            "ladder_rows_gross_positive": sum(r["gross"] > 0 for r in lad), "ladder_rows_net_positive": sum(r["net"] > 0 for r in lad),
            "kalshi_sell_total_net_usd_of_net_positive": round(sum(r["net"] for r in ks if r["net"] > 0), 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    U, extra, snaps = analyze.load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    books = analyze.load_books(args.raw)
    sets = json.load(open(os.path.join(args.raw, "screen", "sets.json")))
    near = json.load(open(os.path.join(args.raw, "screen", "near_ladder_pairs.json")))
    snap = snaps["polymarket"]
    orig = analyze.fee_kalshi
    res = [run("baseline: non-direct member, cent grid", U, idx, books, sets, near, snap)]
    analyze.fee_kalshi = lambda fills, multiplier=1, grid=Decimal("0.0001"), coef=common.KALSHI_COEF: orig(fills, multiplier, Decimal("0.0001"), coef)
    res.append(run("direct member, $0.0001 grid", U, idx, books, sets, near, snap))
    analyze.fee_kalshi = lambda fills, multiplier=1, grid=Decimal("0.01"), coef=common.KALSHI_COEF: orig(fills, multiplier, Decimal("0.0001"), coef * Decimal("0.25"))
    res.append(run("hypothetical quarter-size fee", U, idx, books, sets, near, snap))
    analyze.fee_kalshi = lambda fills, multiplier=1, grid=Decimal("0.01"), coef=common.KALSHI_COEF: Decimal(0)
    res.append(run("zero fees (gross upper bound)", U, idx, books, sets, near, snap))
    json.dump(res, open(args.out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
