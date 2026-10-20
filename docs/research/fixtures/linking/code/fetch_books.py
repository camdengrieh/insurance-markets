"""Stage C: order books for the screened targets (public GET only).

  python3 -I fetch_books.py --raw RAW --venue polymarket|kalshi|xo|limitless [--tag first] [--only KEYFILE]

Polymarket  GET clob.polymarket.com/book?token_id=<YES token>       (one request per market; the YES and
            NO books are mirrors, verified on a sample with --mirror-sample N extra NO-token requests)
Kalshi      GET /markets/orderbooks?tickers=... (<=100 per request)
XO          GET orderbooks.xo.market/book?token_id=<YES token>        (+ NO-token mirror sample)
Limitless   GET /markets/{slug}/orderbook                             (YES side only)
Output: RAW/books/<venue>[_<tag>].json  {key: {"raw": ..., "t": epoch, "status": int}}.
POST /books (batch) is deliberately NOT used: ground rules allow GET only.
"""
import argparse
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CapExceeded, Http  # noqa: E402
from universe import load_all  # noqa: E402

CLOB = "https://clob.polymarket.com"
KALSHI = "https://external-api.kalshi.com/trade-api/v2"
XO_OB = "https://orderbooks.xo.market"
LIMITLESS = "https://api.limitless.exchange"


def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--venue", required=True)
    ap.add_argument("--tag", default="")
    ap.add_argument("--only", help="JSON file with a list of keys to fetch instead of screen/targets.json")
    ap.add_argument("--mirror-sample", type=int, default=25)
    ap.add_argument("--fresh", action="store_true", help="bypass the HTTP cache (re-check pass)")
    ap.add_argument("--max", type=int, default=100000)
    ap.add_argument("--merge", action="store_true", help="merge into the existing books file instead of overwriting it")
    args = ap.parse_args()
    http = Http(args.raw)
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    if args.only:
        keys = json.load(open(args.only))
    else:
        keys = list(json.load(open(os.path.join(args.raw, "screen", "targets.json")))[args.venue])
    keys = [k for k in keys if idx.get(k, {}).get("venue") == args.venue][:args.max]
    os.makedirs(os.path.join(args.raw, "books"), exist_ok=True)
    out_path = os.path.join(args.raw, "books", f"{args.venue}{('_' + args.tag) if args.tag else ''}.json")
    out = {}
    if args.merge and os.path.exists(out_path):
        out = json.load(open(out_path))
    t0 = time.time()
    try:
        if args.venue == "kalshi":
            for i in range(0, len(keys), 100):
                chunk = keys[i:i + 100]
                tickers = [idx[k]["ticker"] for k in chunk]
                body, meta = http.get(KALSHI + "/markets/orderbooks", {"tickers": tickers}, fresh=args.fresh)
                t = meta.get("fetched_at")
                if not body or "orderbooks" not in body:
                    print("kalshi batch failed", meta.get("status"), file=sys.stderr)
                    continue
                by = {ob["ticker"]: ob for ob in body["orderbooks"]}
                for k in chunk:
                    ob = by.get(idx[k]["ticker"])
                    out[k] = {"raw": ob.get("orderbook_fp") if ob else None, "t": t, "status": 200 if ob else 404}
                if (i // 100) % 10 == 0:
                    print("kalshi", i, len(keys))
                    save(out_path, out)
        elif args.venue in ("polymarket", "xo"):
            base = CLOB + "/book" if args.venue == "polymarket" else XO_OB + "/book"
            for n, k in enumerate(keys):
                m = idx[k]
                body, meta = http.get(base, {"token_id": m["tokens"]["yes"]}, fresh=args.fresh)
                out[k] = {"raw": body if meta.get("status") == 200 else None, "t": meta.get("fetched_at"), "status": meta.get("status")}
                if n % 40 == 0:
                    print(args.venue, n, len(keys))
                    save(out_path, out)
            # mirror test: fetch the NO token book for a random sample of markets that returned a YES book
            rnd = random.Random(11)
            pool = [k for k in keys if out.get(k, {}).get("raw") and (out[k]["raw"].get("bids") or out[k]["raw"].get("asks"))]
            sample = rnd.sample(pool, min(args.mirror_sample, len(pool)))
            mir = {}
            for k in sample:
                m = idx[k]
                body, meta = http.get(base, {"token_id": m["tokens"]["no"]}, fresh=args.fresh)
                mir[k] = {"raw": body if meta.get("status") == 200 else None, "t": meta.get("fetched_at"), "status": meta.get("status")}
            save(out_path.replace(".json", "_mirror.json"), mir)
        elif args.venue == "limitless":
            for n, k in enumerate(keys):
                m = idx[k]
                body, meta = http.get(f"{LIMITLESS}/markets/{m['slug']}/orderbook", fresh=args.fresh)
                out[k] = {"raw": body if meta.get("status") == 200 else None, "t": meta.get("fetched_at"), "status": meta.get("status")}
                if n % 40 == 0:
                    print("limitless", n, len(keys))
                    save(out_path, out)
    except CapExceeded as e:
        print("CAP", e, file=sys.stderr)
    save(out_path, out)
    print(json.dumps({"venue": args.venue, "n": len(out), "started": t0, "finished": time.time(),
                      "ok": sum(1 for v in out.values() if v["status"] == 200)}))


if __name__ == "__main__":
    main()
