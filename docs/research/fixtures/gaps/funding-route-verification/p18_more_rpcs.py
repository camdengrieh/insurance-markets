import sys, json, time
sys.path.insert(0, '.')
import lib
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
cands = ["https://base.gateway.tenderly.co", "https://base-pokt.nodies.app", "https://endpoints.omniatech.io/v1/base/mainnet/public",
         "https://base.rpc.subquery.network/public", "https://base.lava.build", "https://base.meowrpc.com"]
for url in cands:
    print("==", url)
    j = lib.rpc(url, "eth_blockNumber")
    if "result" not in j:
        print("  blockNumber fail", json.dumps(j.get("error") or j.get("_raw") or j)[:160], "http", j.get("_http")); continue
    latest = int(j["result"], 16)
    time.sleep(1)
    span = 500_000
    j = lib.rpc(url, "eth_getLogs", [{"fromBlock": hex(latest - span), "toBlock": hex(latest), "address": MAILBOX, "topics": [T]}])
    if "result" in j:
        print("  span", span, "logs", len(j["result"]))
    else:
        print("  span", span, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:240], "http", j.get("_http"))
