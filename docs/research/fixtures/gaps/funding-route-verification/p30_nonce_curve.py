import sys, json, time, calendar
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
G = 1686789347
def blk(ts): return (ts - G) // 2
pts = ["2026-04-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-08-10", "2026-08-20", "2026-09-01", "2026-09-15", "2026-10-01", "2026-10-10"]
rows = []
for d in pts:
    ts = calendar.timegm(time.strptime(d, "%Y-%m-%d"))
    b = blk(ts)
    r = lib.eth_call(BASE, MB, lib.selector("nonce()"), hex(b))
    n = int(r, 16) if isinstance(r, str) else r
    rows.append((d, b, n))
    print(d, b, n)
json.dump(rows, open("data/base_nonce_curve.json", "w"))
