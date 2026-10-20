"""Offline: compare Base Mailbox nonce (eth_call history, data/base_nonce_curve.json + data/gap_weekly_june.json)
with the cumulative count of XO ProcessId events from the explorer (data/xo_processid_all.json).
NOTE: the explorer index turned out to MISS logs (the 21 burst messages were delivered on-chain), so this 'gap' is an upper bound."""
import json, time, bisect
rows = json.load(open("data/xo_processid_all.json"))
ts = sorted(int(r["timeStamp"], 16) for r in rows)
G = 1686789347
curve = json.load(open("data/base_nonce_curve.json"))
print("XO ProcessId events indexed by explorer:", len(ts), "first", time.strftime("%F %T", time.gmtime(ts[0])), "last", time.strftime("%F %T", time.gmtime(ts[-1])))
print("date        base_nonce  xo_processid_by_t  gap")
for d, b, n in curve:
    c = bisect.bisect_right(ts, G + 2 * b)
    print(d, n, c, n - c)
print("latest read: base nonce 9655 vs", len(ts), "-> gap", 9655 - len(ts))
