"""Chain-pull ALL XO Mailbox ProcessId events through the explorer getLogs (cursor = last block, <=1000 rows/call).
Resumes from data/xo_processid.json (first 1000 rows, already fetched)."""
import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("ProcessId(bytes32)")
rows = json.load(open("data/xo_processid.json"))
seen = {(r["transactionHash"], r["logIndex"]) for r in rows}
calls = 0
while True:
    lo = int(rows[-1]["blockNumber"], 16)
    st, j = lib.bs_logs(H, MB, T, lo, 99999999, offset=1000)
    calls += 1
    page = j.get("result", []) if isinstance(j, dict) else []
    new = [r for r in page if (r["transactionHash"], r["logIndex"]) not in seen]
    for r in new: seen.add((r["transactionHash"], r["logIndex"]))
    rows.extend(new)
    print("call", calls, "from block", lo, "http", st, "page", len(page), "new", len(new), "total", len(rows))
    json.dump(rows, open("data/xo_processid_all.json", "w"))
    if len(page) < 1000 or not new or calls >= 11:
        break
print("final total", len(rows), "calls", calls)
