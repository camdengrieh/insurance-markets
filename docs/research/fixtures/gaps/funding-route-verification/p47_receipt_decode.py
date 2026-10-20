import sys, json, collections
sys.path.insert(0, '.')
import lib
URL = "https://base.drpc.org"
rows = json.load(open("data/base_tx_sample.json"))
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"; WRAP = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"
T_TR = lib.topic0("Transfer(address,address,uint256)"); T_AP = lib.topic0("Approval(address,address,uint256)")
def a(t): return "0x" + t[-40:]
tag = {USDC: "USDC", ROUTER: "ROUTER", WRAP: "EXECUTOR"}
for r in rows[:1] + rows[-1:]:
    rc = lib.rpc(URL, "eth_getTransactionReceipt", [r["tx"]])["result"]
    print("tx", r["tx"][:12], "from(relayer)", r["from"][:8], "to", tag.get(r["to"].lower(), r["to"]))
    for l in rc["logs"]:
        t0 = l["topics"][0]; em = tag.get(l["address"].lower(), l["address"])
        if t0 == T_TR: print("   Transfer", em, a(l["topics"][1])[:10], "->", tag.get(a(l["topics"][2]), a(l["topics"][2])[:10]), int(l["data"], 16))
        elif t0 == T_AP: print("   Approval", em, a(l["topics"][1])[:10], "->", tag.get(a(l["topics"][2]), a(l["topics"][2])[:10]), int(l["data"], 16) if int(l["data"],16) < 10**30 else "huge")
        else: print("   event", t0[:10], "emitter", em, "ntopics", len(l["topics"]), "data_len", (len(l["data"]) - 2) // 2)
    # who is the first Transfer's source?
    first = [l for l in rc["logs"] if l["topics"][0] == T_TR][0]
    src = a(first["topics"][1])
    code = lib.rpc(URL, "eth_getCode", [src, "latest"])["result"]
    print("   first Transfer source code:", code[:50], "bytes", (len(code) - 2) // 2)
