"""Greedy block-range paging of CLOBMarketCreated logs from the XO explorer (GET only).
Dedupes by (tx, logIndex). Keeps decoded marketType 2 and 4 rows; counts type 3 by day."""
import os, sys, json, collections
sys.path.insert(0, os.path.join(os.environ["SCRATCH"], "work"))
from xoclient import get, used
S = os.environ["SCRATCH"]
MGR = "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307"
T = json.load(open(S + "/work/event_topics.json"))["CLOBMarketCreated"]["topic0"]
fees = json.load(open(S + "/raw/fee_events.json"))["result"]
first = min(int(r["blockNumber"], 16) for r in fees)
last = max(int(r["blockNumber"], 16) for r in fees)

def word(h, i): return h[2 + 64 * i: 2 + 64 * (i + 1)]
def decode(r):
    d = r["data"]
    off = int(word(d, 8), 16)
    base = 2 + 2 * off
    ln = int(d[base: base + 64], 16)
    uri = bytes.fromhex(d[base + 64: base + 64 + 2 * ln]).decode("utf-8", "replace")
    return {
        "cond": r["topics"][1], "creator": "0x" + r["topics"][2][-40:],
        "startsAt": int(word(d, 5), 16), "expiresAt": int(word(d, 6), 16),
        "fee_bps": int(word(d, 7), 16), "uri": uri, "marketType": int(word(d, 9), 16),
        "block": int(r["blockNumber"], 16), "ts": int(r["timeStamp"], 16),
        "tx": r["transactionHash"], "li": int(r["logIndex"], 16),
    }

seen = set(); rows = []; typecount = collections.Counter(); t3day = collections.Counter()
frm = first - 5
end = last + 5
pages = 0
W = 60000
while frm <= end:
    to = min(frm + W, end)
    u = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs"
         f"&fromBlock={frm}&toBlock={to}&address={MGR}&topic0={T}")
    try:
        st, b, h = get(u)
    except RuntimeError as e:
        print("retry smaller:", e, "W", W, flush=True)
        W = max(5000, W // 2)
        continue
    if st != 200:
        print("HTTP", st, b[:200]); break
    d = json.loads(b)
    res = d["result"] if isinstance(d["result"], list) else []
    pages += 1
    blocks = [int(r["blockNumber"], 16) for r in res]
    asc = blocks == sorted(blocks)
    new = 0
    for r in res:
        k = (r["transactionHash"], r["logIndex"])
        if k in seen: continue
        seen.add(k); new += 1
        x = decode(r)
        typecount[x["marketType"]] += 1
        if x["marketType"] == 3:
            t3day[x["ts"] // 86400] += 1
        else:
            rows.append(x)
    print(f"page {pages} {frm}-{to} n={len(res)} new={new} asc={asc} W={W} used={used('explorer-mainnet.xo.market')}", flush=True)
    if len(res) >= 1000:
        nxt = max(blocks)
        if nxt == frm:
            print("stuck: >=1000 events in one block"); break
        frm = nxt
    else:
        frm = to + 1
        if len(res) < 400: W = min(W * 2, 400000)
json.dump(rows, open(S + "/work/created_t2_t4.json", "w"))
json.dump({"typecount": typecount, "t3_per_day": t3day}, open(S + "/work/created_counts.json", "w"))
print(dict(typecount), "rows kept", len(rows))
