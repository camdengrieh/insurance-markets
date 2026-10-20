"""Select a RANDOM set of un-screened sets/pairs so we can measure how many arbitrages the listing-quote
pre-screen would have missed (calibration of the screen), then fetch them with fetch_books.py --tag calib.

  python3 -I make_calibration.py --raw RAW [--seed 7]
  python3 -I fetch_books.py --raw RAW --venue kalshi --tag calib --only RAW/calib_kalshi.json
  python3 -I fetch_books.py --raw RAW --venue polymarket --tag calib --only RAW/calib_polymarket.json --mirror-sample 0
"""
import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from universe import load_all  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--ka-sets", type=int, default=420)
    ap.add_argument("--ka-ladder-pairs", type=int, default=300)
    ap.add_argument("--pm-sets", type=int, default=8)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    sc = os.path.join(args.raw, "screen")
    targets = json.load(open(os.path.join(sc, "targets.json")))
    have = {v: set(json.load(open(os.path.join(args.raw, "books", v + ".json")))) for v in ("kalshi", "polymarket")}
    sets = json.load(open(os.path.join(sc, "sets.json")))
    fams = json.load(open(os.path.join(sc, "families.json")))
    near = json.load(open(os.path.join(sc, "near_ladder_pairs.json")))
    near_pairs = {(n["easy"], n["hard"]) for n in near}

    ka_sets = [S for S in sets if S["venue"] == "kalshi" and not all(k in have["kalshi"] for k in S["legs"]) and 2 <= len(S["legs"]) <= 40]
    sel_ka = rnd.sample(ka_sets, min(args.ka_sets, len(ka_sets)))
    pm_sets = [S for S in sets if S["venue"] == "polymarket" and not all(k in have["polymarket"] for k in S["legs"]) and 2 <= len(S["legs"]) <= 6]
    sel_pm = rnd.sample(pm_sets, min(args.pm_sets, len(pm_sets)))
    # ladders: random Kalshi pairs outside the near-violation screen, quoted both sides
    pairs = []
    from ladders import easy_hard_pairs
    for f in fams:
        if f["venue"] != "kalshi":
            continue
        mem = f["members"]
        for e, h in easy_hard_pairs(f):
            if (e, h) in near_pairs:
                continue
            me, mh = idx.get(e), idx.get(h)
            if not me or not mh or me["ask"] is None or mh["bid"] is None:
                continue
            pairs.append((e, h))
    sel_pairs = rnd.sample(pairs, min(args.ka_ladder_pairs, len(pairs)))
    ka_keys = sorted({k for S in sel_ka for k in S["legs"]} | {k for p in sel_pairs for k in p})
    pm_keys = sorted({k for S in sel_pm for k in S["legs"]})
    json.dump(ka_keys, open(os.path.join(args.raw, "calib_kalshi.json"), "w"))
    json.dump(pm_keys, open(os.path.join(args.raw, "calib_polymarket.json"), "w"))
    json.dump({"ka_sets": [S["event_key"] for S in sel_ka], "pm_sets": [S["event_key"] for S in sel_pm],
               "ladder_pairs": sel_pairs, "population": {"ka_sets_unscreened": len(ka_sets), "pm_sets_unscreened": len(pm_sets),
                                                          "ka_ladder_pairs_unscreened": len(pairs)}},
              open(os.path.join(args.raw, "calib_sample.json"), "w"))
    print("kalshi markets", len(ka_keys), "pm markets", len(pm_keys), "unscreened populations", len(ka_sets), len(pm_sets), len(pairs))


if __name__ == "__main__":
    main()
