import sys, json, time
sys.path.insert(0, '.')
import lib
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
cands = ["https://mainnet.base.org", "https://base.drpc.org", "https://1rpc.io/base", "https://base-mainnet.public.blastapi.io"]
for url in cands:
    print("==", url)
    j = lib.rpc(url, "eth_blockNumber")
    if "result" not in j:
        print("  blockNumber fail", json.dumps(j.get("error") or j.get("_raw") or j)[:200], "http", j.get("_http")); continue
    latest = int(j["result"], 16)
    for span in (10_000, 100_000, 1_000_000):
        time.sleep(2)
        j = lib.rpc(url, "eth_getLogs", [{"fromBlock": hex(latest - span), "toBlock": hex(latest), "address": MAILBOX, "topics": [T]}])
        if "result" in j:
            print("  span", span, "logs", len(j["result"]))
        else:
            print("  span", span, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:240], "http", j.get("_http"))
            break
