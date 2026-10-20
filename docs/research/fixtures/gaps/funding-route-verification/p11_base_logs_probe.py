import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://mainnet.base.org"
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T_DISPATCHID = lib.topic0("DispatchId(bytes32)")
T_DISPATCH = lib.topic0("Dispatch(address,uint32,bytes32,bytes)")
T_PROCESSID = lib.topic0("ProcessId(bytes32)")
print(T_DISPATCHID, T_DISPATCH, T_PROCESSID)
latest = int(lib.rpc(RPC, "eth_blockNumber")["result"], 16)
print("latest", latest, "base ts formula", 1686789347 + 2 * latest)
# calibrate formula against Multicall3.getCurrentBlockTimestamp at latest
mc = "0xcA11bde05977b3631167028862bE2a173976CA11"
r = lib.eth_call(RPC, mc, lib.selector("getCurrentBlockTimestamp()"))
print("multicall3 ts", r, int(r, 16) if isinstance(r, str) else None)
import time; print("local utc now", int(time.time()))
for span in (10_000, 100_000, 1_000_000):
    j = lib.rpc(RPC, "eth_getLogs", [{"fromBlock": hex(latest - span), "toBlock": hex(latest), "address": MAILBOX, "topics": [T_DISPATCHID]}])
    if "result" in j:
        print("span", span, "logs", len(j["result"]))
    else:
        print("span", span, "error", json.dumps(j.get("error") or j.get("_raw"))[:300])
        break
