import sys, json, time
sys.path.insert(0, '.')
import lib
url = "https://base.gateway.tenderly.co"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
topics = [[lib.topic0("DispatchId(bytes32)"), lib.topic0("ProcessId(bytes32)"),
           lib.topic0("SentTransferRemote(uint32,bytes32,uint256)"), lib.topic0("ReceivedTransferRemote(uint32,bytes32,uint256)")]]
latest = int(lib.rpc(url, "eth_blockNumber")["result"], 16)
print("latest", latest)
# an August 2026 window (~ts 1786000000): blocks = (ts-1686789347)/2
b = (1786000000 - 1686789347) // 2
for lo in (latest - 999, b):
    j = lib.rpc(url, "eth_getLogs", [{"fromBlock": hex(lo), "toBlock": hex(lo + 999), "address": [MB, ROUTER], "topics": topics}])
    if "result" in j:
        print("window start", lo, "logs", len(j["result"]))
        for r in j["result"][:3]:
            print("   ", int(r["blockNumber"], 16), r["address"][:10], r["topics"][0][:10], r["transactionHash"][:12])
    else:
        print("window", lo, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:300])
