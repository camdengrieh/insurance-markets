import json, sys, collections
sys.path.insert(0, ".")
import xohttp, rpc
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T_OWN = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=12000000&toBlock=latest&address=%s&topic0=%s" % (VAL, T_OWN))
c, j = xohttp.get(url)
res = j.get("result") or []
print(c, len(res))
pairs = [("0x" + r["topics"][1][-40:], "0x" + r["topics"][2][-40:], int(r["blockNumber"], 16)) for r in res]
json.dump(pairs, open("out/ownerreg_r1.json", "w"))
owners = [p[1] for p in pairs]
print("events", len(pairs), "distinct kernels", len(set(p[0] for p in pairs)), "distinct owners", len(set(owners)))
mult = collections.Counter(owners)
print("owners with >1 account:", sum(1 for v in mult.values() if v > 1))
# cross-check vs AccountDeployed senders in the same window
dep = set("0x" + r["topics"][2][-40:] for r in json.load(open("out/ad_bulk_r1.json"))["result"])
print("kernels registered in window that are in deployed set:", len(set(p[0] for p in pairs) & dep), "of", len(dep))
# Base/Ethereum nonce for distinct owners (batches of 80)
uo = sorted(set(owners))
act = {}
for name, u in (("base", "https://mainnet.base.org"), ("ethereum", "https://ethereum-rpc.publicnode.com")):
    act[name] = {}
    for i in range(0, len(uo), 80):
        chunk = uo[i:i + 80]
        code, jj = rpc.call(u, [("eth_getTransactionCount", [o, "latest"]) for o in chunk])
        if not isinstance(jj, list):
            print(name, code, str(jj)[:160]); break
        for o, r in zip(chunk, jj):
            act[name][o] = int(r["result"], 16) if "result" in r else None
tot = len(uo)
b = sum(1 for o in uo if (act["base"].get(o) or 0) > 0)
e = sum(1 for o in uo if (act["ethereum"].get(o) or 0) > 0)
anyc = sum(1 for o in uo if (act["base"].get(o) or 0) > 0 or (act["ethereum"].get(o) or 0) > 0)
print("distinct owners", tot, "| Base nonce>0:", b, "| Ethereum nonce>0:", e, "| either:", anyc)
json.dump(dict(total=tot, base_nonce_gt0=b, eth_nonce_gt0=e, either=anyc), open("out/owner_activity_r1_summary.json", "w"))
