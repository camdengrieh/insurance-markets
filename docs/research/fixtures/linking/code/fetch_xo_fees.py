"""Read each linked XO market's fee configuration from the public Data API (GET only).

  python3 -I fetch_xo_fees.py --raw RAW [--min-sim 0.55]

Writes RAW/xo_fees.json {key: takerFeeBps} using effectiveFeeConfig.takerFeeBps from
GET api-mainnet.xo.market/api/markets/contract/{conditionId}. If the field is missing the
market is left out (analyze.py then applies the conservative 400 bps default).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CapExceeded, Http  # noqa: E402
from universe import load_all  # noqa: E402

XO_DATA = "https://api-mainnet.xo.market/api"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--min-sim", type=float, default=0.55)
    args = ap.parse_args()
    http = Http(args.raw)
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    links = json.load(open(os.path.join(args.raw, "screen", "links.json")))
    books = json.load(open(os.path.join(args.raw, "books", "xo.json")))
    need = []
    for l in links:
        if (l.get("sim") or 0) < args.min_sim or l.get("orient") in ("unknown", "different_outcome"):
            continue
        for k in (l["a"], l["b"]):
            if idx[k]["venue"] == "xo" and k not in need and books.get(k, {}).get("raw") and (books[k]["raw"].get("bids") or books[k]["raw"].get("asks")):
                need.append(k)
    out, conf = {}, {}
    try:
        for k in need:
            body, meta = http.get(f"{XO_DATA}/markets/contract/{idx[k]['cid']}")
            fc = (body or {}).get("effectiveFeeConfig") if isinstance(body, dict) else None
            if fc and fc.get("takerFeeBps") is not None:
                out[k] = fc["takerFeeBps"]
                conf[k] = {"curve": fc.get("curveModel"), "takerFeeBps": fc.get("takerFeeBps"), "type": body.get("type")}
    except CapExceeded as e:
        print("CAP", e)
    json.dump(out, open(os.path.join(args.raw, "xo_fees.json"), "w"))
    json.dump(conf, open(os.path.join(args.raw, "xo_fee_detail.json"), "w"))
    from collections import Counter
    print("xo markets queried", len(need), "with fee config", len(out), Counter(out.values()))


if __name__ == "__main__":
    main()
