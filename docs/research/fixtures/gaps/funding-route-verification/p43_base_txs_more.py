import sys, json, collections
sys.path.insert(0, '.')
import lib
URL = "https://base.drpc.org"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
WRAP = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"
T_SENT = lib.topic0("SentTransferRemote(uint32,bytes32,uint256)")
prev = json.load(open("data/base_tx_sample.json"))
seen = {r["tx"] for r in prev}
cand = []
for w in ("winA", "winB"):
    j = json.load(open("data/base_%s.json" % w))
    for r in j["logs"]:
        if r["topics"][0] == T_SENT and r["transactionHash"] not in seen:
            cand.append(r["transactionHash"])
step = max(1, len(cand) // 50)
pick = cand[::step][:50]
rows = []
for h in pick:
    t = lib.rpc(URL, "eth_getTransactionByHash", [h]).get("result")
    if t: rows.append({"tx": h, "from": t["from"], "to": t["to"], "value": int(t["value"], 16), "selector": t["input"][:10], "input_len": (len(t["input"]) - 2) // 2})
allrows = [{"tx": r["tx"], "from": r["from"], "to": r["to"], "value": r["value"], "selector": r["selector"], "input_len": r["input_len"]} for r in prev] + rows
json.dump(allrows, open("data/base_tx_sample2.json", "w"))
print("total sampled", len(allrows))
print("to:", collections.Counter(r["to"] for r in allrows).most_common(5))
print("selector:", collections.Counter(r["selector"] for r in allrows).most_common(5))
print("value:", collections.Counter(r["value"] for r in allrows))
c = collections.Counter(r["from"] for r in allrows)
print("distinct senders", len(c), "top-share", [round(v / len(allrows), 2) for _, v in c.most_common(5)])
print("direct calls to router:", sum(1 for r in allrows if r["to"].lower() == ROUTER))
il = sorted(r["input_len"] for r in allrows); print("input length bytes min/median/max", il[0], il[len(il)//2], il[-1])
