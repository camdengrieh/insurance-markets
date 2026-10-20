import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://base-rpc.publicnode.com"
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T_DISPATCHID = lib.topic0("DispatchId(bytes32)")
print("chainId", lib.rpc(RPC, "eth_chainId"))
latest = int(lib.rpc(RPC, "eth_blockNumber")["result"], 16)
print("latest", latest)
for span in (10_000, 100_000, 1_000_000):
    j = lib.rpc(RPC, "eth_getLogs", [{"fromBlock": hex(latest - span), "toBlock": hex(latest), "address": MAILBOX, "topics": [T_DISPATCHID]}])
    if "result" in j:
        print("span", span, "logs", len(j["result"]))
    else:
        print("span", span, "error", json.dumps(j.get("error") or j.get("_raw"))[:300])
        break
