"""Back-to-back YES/NO book fetches to test whether a venue's NO book is the exact mirror of its YES book.

  python3 -I mirror_test.py --raw RAW --venue polymarket|xo --n 20 [--seed 3]

For each sampled market the YES-token book and the NO-token book are fetched one after the other (~0.3 s apart).
mirror(YES) = NO asks at 1-p for each YES bid p (same size), NO bids at 1-p for each YES ask p.
Reports how many markets are identical in price levels and in sizes. Public GET only.
"""
import argparse
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ONE, Http, book_from_polylike  # noqa: E402
from universe import load_all  # noqa: E402

URL = {"polymarket": "https://clob.polymarket.com/book", "xo": "https://orderbooks.xo.market/book"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--venue", required=True)
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    http = Http(args.raw)
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    books = json.load(open(os.path.join(args.raw, "books", f"{args.venue}.json")))
    pool = [k for k, r in books.items() if r.get("raw") and r["raw"].get("bids") and r["raw"].get("asks")]
    rnd = random.Random(args.seed)
    sample = rnd.sample(pool, min(args.n, len(pool)))
    res = []
    for k in sample:
        m = idx[k]
        by, _ = http.get(URL[args.venue], {"token_id": m["tokens"]["yes"]}, fresh=True)
        bn, _ = http.get(URL[args.venue], {"token_id": m["tokens"]["no"]}, fresh=True)
        y, n = book_from_polylike(by), book_from_polylike(bn)
        if not y or not n:
            continue
        my_asks = sorted([(ONE - p, s) for p, s in y.bids])
        my_bids = sorted([(ONE - p, s) for p, s in y.asks], reverse=True)
        px = [p for p, _ in n.asks] == [p for p, _ in my_asks] and [p for p, _ in n.bids] == [p for p, _ in my_bids]
        sz = px and [s for _, s in n.asks] == [s for _, s in my_asks] and [s for _, s in n.bids] == [s for _, s in my_bids]
        res.append({"key": k, "price_levels_identical": bool(px), "sizes_identical": bool(sz),
                    "yes_ts": by.get("timestamp"), "no_ts": bn.get("timestamp"),
                    "yes_best": [str(y.best_bid), str(y.best_ask)], "no_best": [str(n.best_bid), str(n.best_ask)]})
    summ = {"venue": args.venue, "n": len(res), "price_levels_identical": sum(r["price_levels_identical"] for r in res),
            "sizes_identical": sum(r["sizes_identical"] for r in res), "details_first5": res[:5]}
    print(json.dumps(summ, indent=1))
    if args.out:
        json.dump({**summ, "all": [{k: v for k, v in r.items() if k != "key"} for r in res]}, open(args.out, "w"), indent=0)


if __name__ == "__main__":
    main()
