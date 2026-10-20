"""Choose the markets whose books are re-fetched for the persistence check.

  python3 -I make_recheck.py --raw RAW
  for v in polymarket kalshi xo limitless; do
    python3 -I fetch_books.py --raw RAW --venue $v --tag recheck --only RAW/recheck_$v.json --fresh --mirror-sample 0
  done
  python3 -I analyze.py --raw RAW --out RAW/out --books-tag recheck

Rows re-checked: every within-venue row with gross edge > 0 (mutually-exclusive sets, ladders) and every cross-venue
row with net edge > 0 and (similarity >= 0.55 or a venue-declared mirror).
"""
import argparse
import collections
import json
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    args = ap.parse_args()
    opps = json.load(open(os.path.join(args.raw, "opps_full.json")))
    sel = []
    for o in opps:
        if o["family"] == "cross":
            if o["net"] > 0 and ((o.get("sim") or 0) >= 0.55 or o.get("hint")):
                sel.append(o)
        elif o["gross"] > 0:
            sel.append(o)
    ks = collections.defaultdict(set)
    for o in sel:
        for l in o["legs"]:
            if l.get("key"):
                ks[l["key"].split(":")[0]].add(l["key"])
    for pre, v in (("pm", "polymarket"), ("ka", "kalshi"), ("xo", "xo"), ("lm", "limitless")):
        json.dump(sorted(ks.get(pre, [])), open(os.path.join(args.raw, f"recheck_{v}.json"), "w"))
    print({k: len(v) for k, v in ks.items()}, "rows", len(sel))


if __name__ == "__main__":
    main()
