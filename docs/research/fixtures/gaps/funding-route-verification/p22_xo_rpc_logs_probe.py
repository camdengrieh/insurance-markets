import sys, json, time
sys.path.insert(0, '.')
import lib
RPC = "https://rpc-mainnet-2.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("ProcessId(bytes32)")
latest = int(lib.rpc(RPC, "eth_blockNumber")["result"], 16)
print("latest", latest)
for lo, hi in ((latest - 100_000, latest),):
    j = lib.rpc(RPC, "eth_getLogs", [{"fromBlock": hex(lo), "toBlock": hex(hi), "address": MB, "topics": [T]}])
    if "result" in j:
        print("range", hi - lo, "logs", len(j["result"]), "bytes~", len(json.dumps(j["result"])))
    else:
        print("range", hi - lo, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:300], j.get("_http"))
