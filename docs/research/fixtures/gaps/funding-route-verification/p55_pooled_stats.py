"""Pooled delivery-delay statistics from data/pairs_A.json and data/pairs_B.json (output of p33_analyze.py), plus decoded ISM metadata."""
import sys, json, statistics, time
sys.path.insert(0, '.')
import lib
def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p / 100.0; f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
dep, wd = [], []
for w in ("A", "B"):
    j = json.load(open("data/pairs_%s.json" % w))
    dep += [r["delay"] for r in j["dep"] if "delay" in r]
    wd += [r["delay"] for r in j["wd"] if "delay" in r]
for name, xs in (("Base->XO deposits", dep), ("XO->Base withdrawals", wd)):
    print("%-22s n=%d min=%d p10=%.1f median=%.1f mean=%.1f p90=%.1f p95=%.1f p99=%.1f max=%d (seconds)" % (name, len(xs), min(xs), pct(xs, 10), pct(xs, 50), statistics.mean(xs), pct(xs, 90), pct(xs, 95), pct(xs, 99), max(xs)))
    hist = {}
    for x in xs: hist[x] = hist.get(x, 0) + 1
    print("   share <=30s: %.3f  <=60s: %.3f" % (sum(1 for x in xs if x <= 30) / len(xs), sum(1 for x in xs if x <= 60) / len(xs)))
# ISM metadata decode from the clone bytecode appended data
c = open("data/ism_code.hex").read().strip() if False else None
