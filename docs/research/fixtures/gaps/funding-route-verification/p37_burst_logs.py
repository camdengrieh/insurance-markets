import sys, json
sys.path.insert(0, '.')
import lib
URL = "https://base.gateway.tenderly.co"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
TOPICS = [[lib.topic0("DispatchId(bytes32)"), lib.topic0("Dispatch(address,uint32,bytes32,bytes)"), lib.topic0("SentTransferRemote(uint32,bytes32,uint256)")]]
start, n = 46961401, 8
out, errs = [], []
for i in range(n):
    lo = start + 1000 * i
    j = lib.rpc(URL, "eth_getLogs", [{"fromBlock": hex(lo), "toBlock": hex(lo + 999), "address": [MB, ROUTER], "topics": TOPICS}])
    if "result" in j: out.extend(j["result"])
    else: errs.append((lo, json.dumps(j.get("error") or j.get("_raw"))[:200]))
json.dump({"start": start, "n": n, "logs": out, "errs": errs}, open("data/base_burst.json", "w"))
print("logs", len(out), "errs", errs)
