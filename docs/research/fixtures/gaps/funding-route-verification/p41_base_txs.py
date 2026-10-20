import sys, json, collections
sys.path.insert(0, '.')
import lib
URL = "https://base.drpc.org"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
SEL = lib.selector("transferRemote(uint32,bytes32,uint256)")
T_APPROVAL = lib.topic0("Approval(address,address,uint256)"); T_TRANSFER = lib.topic0("Transfer(address,address,uint256)")
def sample(winname, n):
    j = json.load(open("data/base_%s.json" % winname))
    txs = []
    for r in j["logs"]:
        if r["topics"][0] == lib.topic0("SentTransferRemote(uint32,bytes32,uint256)") and r["transactionHash"] not in txs:
            txs.append(r["transactionHash"])
    return txs[-n:] if winname == "winA" else txs[:: max(1, len(txs) // n)][:n]
out = []
for w, n in (("winA", 14), ("winB", 8)):
    for h in sample(w, n):
        t = lib.rpc(URL, "eth_getTransactionByHash", [h]).get("result")
        rc = lib.rpc(URL, "eth_getTransactionReceipt", [h]).get("result")
        if not t or not rc: print("miss", h); continue
        inp = t["input"]
        evs = [("Approval" if l["topics"][0] == T_APPROVAL else "Transfer" if l["topics"][0] == T_TRANSFER else l["topics"][0][:10], l["address"][:10]) for l in rc["logs"]]
        rec = {"win": w, "tx": h, "from": t["from"], "to": t["to"], "value": int(t["value"], 16), "selector": inp[:10], "input_len": (len(inp) - 2) // 2,
               "gas_used": int(rc["gasUsed"], 16), "eff_gas_price": int(rc["effectiveGasPrice"], 16), "status": rc["status"], "n_logs": len(rc["logs"]), "events": evs, "type": t.get("type")}
        out.append(rec)
json.dump(out, open("data/base_tx_sample.json", "w"))
print("sampled", len(out))
print("to == router:", sum(1 for r in out if r["to"].lower() == ROUTER), " selector==transferRemote:", sum(1 for r in out if r["selector"] == SEL))
print("value distribution:", collections.Counter(r["value"] for r in out))
print("distinct senders:", len({r["from"] for r in out}), "of", len(out))
print("to distribution:", collections.Counter(r["to"] for r in out).most_common(5))
print("selector distribution:", collections.Counter(r["selector"] for r in out).most_common(5))
print("status:", collections.Counter(r["status"] for r in out))
gu = sorted(r["gas_used"] for r in out); print("gas used min/median/max", gu[0], gu[len(gu)//2], gu[-1])
ev = collections.Counter(tuple(e[0] for e in r["events"]) for r in out)
for k, v in ev.most_common(4): print(v, k)
gp = sorted(r["eff_gas_price"] for r in out); print("eff gas price (wei) min/median/max", gp[0], gp[len(gp)//2], gp[-1])
