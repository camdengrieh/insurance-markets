import sys, json, time, calendar, bisect
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
G = 1686789347
pts = sorted(int(r["timeStamp"], 16) for r in json.load(open("data/xo_processid_all.json")))
def gap(b):
    n = int(lib.eth_call(BASE, MB, lib.selector("nonce()"), hex(b)), 16)
    return n, n - bisect.bisect_right(pts, G + 2 * b - 120)
lo = (calendar.timegm(time.strptime("2026-06-01", "%Y-%m-%d")) - G) // 2   # gap 0 here (from earlier sample)
hi = 47043726                                                              # 2026-06-08, gap 21
steps = []
for _ in range(6):
    mid = (lo + hi) // 2
    n, g = gap(mid)
    steps.append((mid, n, g)); print("mid", mid, "nonce", n, "gap", g)
    if g >= 1: hi = mid
    else: lo = mid
print("bracket", lo, hi, "width", hi - lo, "ts", G + 2 * lo, G + 2 * hi, time.strftime("%F %T", time.gmtime(G + 2 * lo)))
json.dump({"steps": steps, "lo": lo, "hi": hi}, open("data/bisect_june.json", "w"))
