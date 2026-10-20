# Re-measure the Base nonces of the 34 decoded owners that s31 could not measure (public RPC per-second limit on a 34-call batch).
import json, sys, time
sys.path.insert(0, ".")
import rpc
dec = [r for r in json.load(open("out/decoded.json")) if not r.get("decodeError")]
owners = [r["owner"] for r in dec]
rows = json.load(open("out/owner_activity.json"))
need = [i for i, x in enumerate(rows) if x["base_nonce"] is None]
print("unmeasured before:", len(need))
for k in range(0, len(need), 10):
    idx = need[k:k + 10]
    code, j = rpc.call("https://mainnet.base.org", [("eth_getTransactionCount", [owners[i], "latest"]) for i in idx])
    if not isinstance(j, list) or any("result" not in r for r in j):
        print("batch failed", str(j)[:150]); time.sleep(3); continue
    for i, r in zip(idx, j):
        rows[i]["base_nonce"] = int(r["result"], 16)
    time.sleep(1.2)
json.dump(rows, open("out/owner_activity.json", "w"), indent=1)
print("unmeasured after:", sum(1 for x in rows if x["base_nonce"] is None), "| base nonce>0:", sum(1 for x in rows if (x["base_nonce"] or 0) > 0), "| eth nonce>0:", sum(1 for x in rows if (x["eth_nonce"] or 0) > 0))
