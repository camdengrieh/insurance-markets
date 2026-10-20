"""Download price-history series for every leg in out/registry.json (public unauthenticated GETs).

usage: python3 -I src/fetch_series.py pm|kalshi
Polymarket: Data API v2 /v2/prices-history  (1-min x 6.9d, 5-min x 58d, 30-min for days 58-85)
Kalshi:     /series/{s}/markets/{t}/candlesticks (1-min x 30.6d in 3.4d chunks [max 5000 candles/request], 60-min x 90d)
All timestamps are fixed to T0 (stored in out/t0.txt) so re-runs hit the on-disk cache.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pmhttp as h

OUT = os.environ.get("PM_OUT_DIR", "out")
SER = os.path.join(OUT, "series")
os.makedirs(SER, exist_ok=True)
D = "https://data-api.polymarket.com/v2"
K = "https://external-api.kalshi.com/trade-api/v2"
DAY = 86400


def get_t0():
    p = os.path.join(OUT, "t0.txt")
    if os.path.exists(p):
        return int(open(p).read().strip())
    t0 = int(time.time() // 300 * 300)
    open(p, "w").write(str(t0))
    return t0


def pm_window(tok, s, e, bucket):
    pts = []
    cursor = None
    for _ in range(6):
        p = {"token_id": tok, "start": s, "end": e, "bucket_seconds": bucket, "limit": 10000}
        if cursor:
            p = {"token_id": tok, "cursor": cursor}
        d = h.get_json(D + "/prices-history", p)
        if not isinstance(d, dict) or "_error" in d:
            raise RuntimeError("pm error %s" % (d,))
        pts += [(x["timestamp"], x["price"], x["resolution_seconds"]) for x in d["data"]]
        pg = d.get("pagination") or {}
        cursor = pg.get("next_cursor")
        if not pg.get("has_more") or not cursor:
            break
    return pts


def fetch_pm(name, leg, t0):
    tok = leg["token"]
    out = {"leg": name, "token": tok, "t0": t0, "1m": [], "5m": [], "30m": []}
    out["1m"] = pm_window(tok, t0 - int(6.9 * DAY), t0, 60)
    w = int(14.5 * DAY)
    s = t0 - 58 * DAY
    for i in range(4):
        out["5m"] += pm_window(tok, s + i * w, s + (i + 1) * w, 300)
    s2 = t0 - 85 * DAY
    w2 = int(13.5 * DAY)
    for i in range(2):
        out["30m"] += pm_window(tok, s2 + i * w2, s2 + (i + 1) * w2, 1800)
    for k in ("1m", "5m", "30m"):
        out[k] = sorted(set(out[k]))
    return out


def kal_window(series, ticker, s, e, period):
    d = h.get_json(K + "/series/%s/markets/%s/candlesticks" % (series, ticker),
                   {"start_ts": s, "end_ts": e, "period_interval": period})
    if not isinstance(d, dict) or "_error" in d:
        raise RuntimeError("kalshi error %s %s" % (ticker, d))
    rows = []
    def f(x):
        return None if x in (None, "") else float(x)
    for c in d.get("candlesticks", []):
        pr = c.get("price") or {}
        yb = c.get("yes_bid") or {}
        ya = c.get("yes_ask") or {}
        rows.append((c["end_period_ts"], f(yb.get("close_dollars")), f(ya.get("close_dollars")), f(pr.get("close_dollars")),
                     f(c.get("volume_fp")), f(yb.get("open_dollars")), f(ya.get("open_dollars"))))
    return rows


def fetch_kalshi(name, leg, t0):
    out = {"leg": name, "ticker": leg["ticker"], "series": leg["series"], "t0": t0, "1m": [], "60m": []}
    w = int(3.4 * DAY)
    s = t0 - 9 * w
    for i in range(9):
        out["1m"] += kal_window(leg["series"], leg["ticker"], s + i * w, s + (i + 1) * w, 1)
    out["60m"] += kal_window(leg["series"], leg["ticker"], t0 - 90 * DAY, t0, 60)
    for k in ("1m", "60m"):
        out[k] = sorted(set(out[k]), key=lambda r: r[0])
    return out


if __name__ == "__main__":
    which = sys.argv[1]
    reg = json.load(open(os.path.join(OUT, "registry.json")))
    t0 = get_t0()
    legs = reg["legs"]
    for name, leg in legs.items():
        path = os.path.join(SER, name + ".json")
        if os.path.exists(path):
            continue
        try:
            if which == "pm" and leg["venue"] == "PM":
                res = fetch_pm(name, leg, t0)
            elif which == "kalshi" and leg["venue"] == "K":
                res = fetch_kalshi(name, leg, t0)
            else:
                continue
        except Exception as ex:
            print("FAIL", name, ex, file=sys.stderr)
            continue
        json.dump(res, open(path, "w"))
        print("ok", name, {k: len(v) for k, v in res.items() if isinstance(v, list)}, file=sys.stderr, flush=True)
