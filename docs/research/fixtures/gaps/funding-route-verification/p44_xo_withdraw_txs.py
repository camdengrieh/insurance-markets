import sys, json, collections
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
ROUTE = "0x9090463546d725f6ece5d1a4b27beb929d5d1983"
WRAP = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"
txs = []
for w in ("A", "B"):
    for r in json.load(open("data/xo_%s_dispatchid.json" % w)):
        txs.append(r["transactionHash"])
step = max(1, len(txs) // 22)
pick = txs[::step][:22]
rows = []
for h in pick:
    t = lib.rpc(XO, "eth_getTransactionByHash", [h]).get("result")
    if not t: continue
    rows.append({"tx": h, "from": t["from"], "to": t["to"], "value": int(t["value"], 16), "selector": t["input"][:10], "input_len": (len(t["input"]) - 2) // 2, "gas": int(t["gas"], 16), "gasPrice": int(t.get("gasPrice", "0x0"), 16), "type": t.get("type")})
json.dump(rows, open("data/xo_withdraw_tx_sample.json", "w"))
print("sampled", len(rows))
print("to:", collections.Counter(r["to"] for r in rows).most_common(4))
print("selector:", collections.Counter(r["selector"] for r in rows).most_common(4))
print("value:", collections.Counter(r["value"] for r in rows))
c = collections.Counter(r["from"] for r in rows); print("distinct senders", len(c), [v for _, v in c.most_common(6)])
print("direct to route:", sum(1 for r in rows if r["to"].lower() == ROUTE))
print("gasPrice set:", collections.Counter(r["gasPrice"] for r in rows).most_common(3))
# receipts for 4 txs
for r in rows[:4]:
    rc = lib.rpc(XO, "eth_getTransactionReceipt", [r["tx"]]).get("result")
    print("receipt", r["tx"][:12], "gasUsed", int(rc["gasUsed"], 16), "status", rc["status"], "events", [l["topics"][0][:10] for l in rc["logs"]])
