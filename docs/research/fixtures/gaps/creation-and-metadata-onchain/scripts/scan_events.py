"""Generic greedy getLogs scanner (GET only) for one event of the market manager. Saves raw rows to work/ev_<name>.json
Usage: python3 -I scan_events.py <EventName> [W0]"""
import os, sys, json
sys.path.insert(0, os.path.join(os.environ["SCRATCH"], "work"))
from xoclient import get, used
S = os.environ["SCRATCH"]
MGR = "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307"
name = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 300000
T = json.load(open(S + "/work/event_topics.json"))[name]["topic0"]
fees = json.load(open(S + "/raw/fee_events.json"))["result"]
first = min(int(r["blockNumber"], 16) for r in fees) - 5
end = max(int(r["blockNumber"], 16) for r in fees) + 400000  # reviews/responses happen after creation
frm = first; seen = set(); out = []; pages = 0
latest_seen = 0
while frm <= end:
    to = min(frm + W, end)
    u = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs"
         f"&fromBlock={frm}&toBlock={to}&address={MGR}&topic0={T}")
    try:
        st, b, h = get(u)
    except RuntimeError as e:
        print("retry smaller", e, flush=True); W = max(5000, W // 2); continue
    if st != 200: print("HTTP", st, b[:200]); break
    res = json.loads(b)["result"]
    res = res if isinstance(res, list) else []
    pages += 1; new = 0
    for r in res:
        k = (r["transactionHash"], r["logIndex"])
        if k in seen: continue
        seen.add(k); new += 1; out.append(r)
    blocks = [int(r["blockNumber"], 16) for r in res]
    print(f"{name} page {pages} {frm}-{to} n={len(res)} new={new} W={W} used={used('explorer-mainnet.xo.market')}", flush=True)
    if len(res) >= 1000:
        nxt = max(blocks)
        if nxt == frm: print("stuck"); break
        frm = nxt
    else:
        frm = to + 1
        if len(res) < 300: W = min(W * 2, 1000000)
json.dump(out, open(S + f"/work/ev_{name}.json", "w"))
print(name, "total", len(out))
