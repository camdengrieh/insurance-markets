"""Calibrate what a Polymarket v2 prices-history bucket value means relative to the book, using public taker trades.

Logic: a taker BUY of the YES token executes at the best ASK at fill time tau; a taker SELL at the best BID.
With a one-tick (0.01) spread, mid = ask - 0.005 (BUY) or bid + 0.005 (SELL).  We compare that implied mid with the
bucket values at k buckets around floor(tau/60)*60 and report the mean absolute residual per k.
The k with the smallest residual tells which bucket reflects the book at tau:
 k=0  -> bucket value ~ mid at (or just before) the END of the bucket  ("close")
 k=+1 -> bucket value ~ mid at the START of the bucket  ("open"): the value labelled b+60 is the book right after tau.
Only trades during which the history shows a one-tick spread are used (bucket mid on a 0.005 grid)."""
import json, os, sys, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pmhttp as h
D = "https://data-api.polymarket.com/v2"
reg = json.load(open("out/registry.json"))
name = sys.argv[1]
leg = reg["legs"][name]
ser = json.load(open("out/series/%s.json" % name))
pts = {t: p for (t, p, r) in ser["1m"] if r == 60}
trades = []
cursor = None
for page in range(int(sys.argv[2]) if len(sys.argv) > 2 else 4):
    p = {"condition": leg["condition"], "limit": 1000}
    if cursor:
        p = {"cursor": cursor}
    d = h.get_json(D + "/trades", p)
    trades += [(t["timestamp"], t["price"], t["side"], t["token_id"], t["size"]) for t in d["data"]]
    cursor = d["pagination"].get("next_cursor")
    if not d["pagination"].get("has_more"):
        break
yes = [t for t in trades if t[3] == leg["token"]]
print(name, "trades", len(trades), "yes-token", len(yes), "span h", (max(t[0] for t in trades) - min(t[0] for t in trades)) / 3600)
res = {k: [] for k in (-2, -1, 0, 1, 2, 3)}
used = 0
for (tau, px, side, tok, size) in yes:
    b = tau // 60 * 60
    if b + 3 * 60 not in pts or b - 2 * 60 not in pts:
        continue
    implied = px - 0.005 if side == "BUY" else px + 0.005
    # only keep when quotes are tight: bucket values on a half-tick grid and within 0.01 of implied
    if abs(pts[b] - implied) > 0.03:
        continue
    used += 1
    for k in res:
        res[k].append(abs(pts[b + 60 * k] - implied))
print("used trades", used)
out = {}
for k in sorted(res):
    if res[k]:
        out[k] = {"mean_abs_resid": sum(res[k]) / len(res[k]), "n": len(res[k]), "share_exact_within_0.0026": sum(1 for v in res[k] if v < 0.0026) / len(res[k])}
        print("k=%+d mean|resid|=%.5f exact-share=%.3f n=%d" % (k, out[k]["mean_abs_resid"], out[k]["share_exact_within_0.0026"], out[k]["n"]))
json.dump({"leg": name, "trades": len(trades), "yes_trades": len(yes), "used": used, "by_k": out}, open("out/calib_pm_%s.json" % name, "w"), indent=1)
