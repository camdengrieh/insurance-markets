"""Stage A: listing snapshots from the public APIs (GET only, cached under --raw).

  python3 -I fetch_listings.py --raw RAW [--venues polymarket,kalshi,xo,limitless]

Polymarket Gamma  /markets/keyset ordered four ways (24h volume, liquidity, lifetime volume,
                  1-week volume), then /events/{id} for the events worth completing.
Kalshi            /events?status=open&with_nested_markets=true (all pages), /series (fee types).
XO Data API       /markets?marketType=2,4&statuses=ACTIVE (long-form CLOB + Conviction).
Limitless         /markets/active (all pages; group markets carry nested markets).
Books are NOT fetched here (see fetch_books.py).
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Http, CapExceeded, now_iso  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com"
KALSHI = "https://external-api.kalshi.com/trade-api/v2"
XO_DATA = "https://api-mainnet.xo.market/api"
LIMITLESS = "https://api.limitless.exchange"


def poly_markets(http, order, pages):
    out, cursor = [], None
    for i in range(pages):
        params = {"closed": "false", "active": "true", "limit": 100, "order": order, "ascending": "false"}
        if cursor:
            params["after_cursor"] = cursor
        body, meta = http.get(GAMMA + "/markets/keyset", params)
        if not body or "markets" not in body:
            print(f"  gamma {order} page {i}: status {meta.get('status')}", file=sys.stderr)
            break
        out.extend(body["markets"])
        cursor = body.get("next_cursor")
        if not cursor:
            break
    return out


def run_polymarket(http, args):
    seen = {}
    plan = [("volume24hr", args.pm_pages_vol24), ("liquidity", args.pm_pages_liq),
            ("volumeNum", args.pm_pages_vol), ("volume1wk", args.pm_pages_wk)]
    for order, pages in plan:
        ms = poly_markets(http, order, pages)
        print(f"polymarket markets order={order}: {len(ms)}")
        for m in ms:
            seen.setdefault(m["conditionId"], m)
    markets = list(seen.values())
    print("polymarket unique markets:", len(markets))
    # group by event
    events = {}
    for m in markets:
        for ev in (m.get("events") or [])[:1]:
            e = events.setdefault(ev["id"], {"ev": ev, "n_seen": 0, "liq": 0.0, "v24": 0.0, "slug": ev.get("slug")})
            e["n_seen"] += 1
            e["liq"] = max(e["liq"], float(ev.get("liquidity") or 0))
            e["v24"] = max(e["v24"], float(ev.get("volume24hr") or 0))
    # which events to complete: any event with >=2 seen markets or flagged negRisk, ranked by liquidity
    cand = [e for e in events.values() if (e["ev"].get("negRisk") or e["n_seen"] >= 2)]
    cand.sort(key=lambda e: -(e["liq"] + e["v24"]))
    budget = min(args.max_events, http.remaining("gamma-api.polymarket.com") - 20)
    full = {}
    for e in cand[:max(budget, 0)]:
        body, meta = http.get(f"{GAMMA}/events/{e['ev']['id']}")
        if body and isinstance(body, dict) and body.get("markets") is not None:
            full[e["ev"]["id"]] = body
    print("polymarket events completed:", len(full), "of candidates", len(cand), "total events seen", len(events))
    return {"markets": markets, "events_full": full, "events_seen": {k: {"n_seen": v["n_seen"], "liq": v["liq"], "v24": v["v24"]} for k, v in events.items()}}


def run_kalshi(http, args):
    events, cursor = [], None
    for i in range(args.kalshi_pages):
        params = {"status": "open", "with_nested_markets": "true", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        body, meta = http.get(KALSHI + "/events", params)
        if not body or "events" not in body:
            print(f"  kalshi events page {i}: status {meta.get('status')}", file=sys.stderr)
            break
        events.extend(body["events"])
        cursor = body.get("cursor")
        if i % 5 == 0:
            print(f"  kalshi events page {i}: total {len(events)}")
        if not cursor:
            break
    nm = sum(len(e.get("markets") or []) for e in events)
    print("kalshi events:", len(events), "markets:", nm)
    series, _ = http.get(KALSHI + "/series", {"include_product_metadata": "false"})
    fee = {}
    for s in (series or {}).get("series", []):
        fee[s["ticker"]] = {"fee_type": s.get("fee_type"), "fee_multiplier": s.get("fee_multiplier"),
                            "category": s.get("category"), "frequency": s.get("frequency"),
                            "contract_terms_url": s.get("contract_terms_url")}
    print("kalshi series fee rows:", len(fee))
    return {"events": events, "series_fee": fee}


def run_xo(http, args):
    out, page = [], 1
    while True:
        body, meta = http.get(XO_DATA + "/markets", {"marketType": "2,4", "statuses": "ACTIVE", "take": 50, "page": page,
                                                      "sortBy": "totalVolumeInUSD", "sortOrder": "DESC"})
        if not body or "data" not in body:
            print("  xo page", page, "status", meta.get("status"), file=sys.stderr)
            break
        out.extend(body["data"])
        if not body["meta"].get("hasNextPage"):
            break
        page += 1
    print("xo markets:", len(out))
    return {"markets": out}


def run_limitless(http, args):
    out, page, total = [], 1, None
    while True:
        body, meta = http.get(LIMITLESS + "/markets/active", {"limit": 25, "page": page, "sortBy": "high_value"})
        if not body or "data" not in body:
            print("  limitless page", page, "status", meta.get("status"), file=sys.stderr)
            break
        total = body.get("totalMarketsCount", total)
        out.extend(body["data"])
        if len(out) >= (total or 0) or not body["data"]:
            break
        page += 1
        if page > 40:
            break
    print("limitless top-level markets:", len(out), "reported total", total)
    return {"markets": out, "reported_total": total}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--venues", default="polymarket,kalshi,xo,limitless")
    ap.add_argument("--offline", action="store_true", help="use cache only")
    ap.add_argument("--pm-pages-vol24", type=int, default=30)
    ap.add_argument("--pm-pages-liq", type=int, default=20)
    ap.add_argument("--pm-pages-vol", type=int, default=12)
    ap.add_argument("--pm-pages-wk", type=int, default=12)
    ap.add_argument("--max-events", type=int, default=220)
    ap.add_argument("--kalshi-pages", type=int, default=80)
    args = ap.parse_args()
    http = Http(args.raw, offline=args.offline)
    snap = {"started_utc": now_iso(), "started_epoch": time.time()}
    os.makedirs(os.path.join(args.raw, "listings"), exist_ok=True)
    try:
        for v in args.venues.split(","):
            fn = {"polymarket": run_polymarket, "kalshi": run_kalshi, "xo": run_xo, "limitless": run_limitless}[v]
            t0 = time.time()
            data = fn(http, args)
            data["_fetched_epoch"] = t0
            data["_fetched_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t0))
            with open(os.path.join(args.raw, "listings", f"{v}.json"), "w") as f:
                json.dump(data, f)
            snap[v + "_listing_start_utc"] = data["_fetched_utc"]
    except CapExceeded as e:
        print("CAP:", e, file=sys.stderr)
    snap["finished_utc"] = now_iso()
    snap["request_counts"] = http.counts
    with open(os.path.join(args.raw, "listings", "_snapshot.json"), "w") as f:
        json.dump(snap, f, indent=1)
    print(json.dumps(snap, indent=1))


if __name__ == "__main__":
    main()
