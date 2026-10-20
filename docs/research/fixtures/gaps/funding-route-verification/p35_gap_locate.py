import sys, json, time, calendar, bisect
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
G = 1686789347
rows = json.load(open("data/xo_processid_all.json"))
pts = sorted(int(r["timeStamp"], 16) for r in rows)
def gap_at_block(b):
    r = lib.eth_call(BASE, MB, lib.selector("nonce()"), hex(b))
    n = int(r, 16)
    t = G + 2 * b
    return n, bisect.bisect_right(pts, t - 120), n - bisect.bisect_right(pts, t - 120)   # processed up to t-120s (allow in-flight)
log = []
for d in ("2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"):
    ts = calendar.timegm(time.strptime(d, "%Y-%m-%d")); b = (ts - G) // 2
    n, p, g = gap_at_block(b)
    log.append((d, b, n, p, g)); print(d, b, "nonce", n, "processed(t-120s)", p, "gap", g)
json.dump(log, open("data/gap_weekly_june.json", "w"))
