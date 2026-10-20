import json, sys, time
sys.path.insert(0, ".")
import rpc
pairs = json.load(open("out/ownerreg_r1.json"))
uo = sorted(set(p[1] for p in pairs))
res = {}
eth = {}
for name, u, bs, store in (("base", "https://mainnet.base.org", 20, res), ("ethereum", "https://ethereum-rpc.publicnode.com", 80, eth)):
    for i in range(0, len(uo), bs):
        chunk = uo[i:i + bs]
        code, jj = rpc.call(u, [("eth_getTransactionCount", [o, "latest"]) for o in chunk])
        if not isinstance(jj, list) or any("result" not in r for r in jj):
            print(name, "batch", i, "failed:", str(jj)[:160]); time.sleep(3); continue
        for o, r in zip(chunk, jj):
            store[o] = int(r["result"], 16)
        time.sleep(1.1 if name == "base" else 0.4)
print("base measured", len(res), "of", len(uo), "| eth measured", len(eth), "of", len(uo))
b = sum(1 for v in res.values() if v > 0); e = sum(1 for v in eth.values() if v > 0)
either = sum(1 for o in uo if res.get(o, 0) > 0 or eth.get(o, 0) > 0)
print("Base nonce>0:", b, "| Ethereum nonce>0:", e, "| either:", either, "| max base", max(res.values() or [0]), "max eth", max(eth.values() or [0]))
json.dump(dict(total_owners=len(uo), base_measured=len(res), eth_measured=len(eth), base_nonce_gt0=b, eth_nonce_gt0=e, either=either), open("out/owner_activity_r1_summary.json", "w"))
