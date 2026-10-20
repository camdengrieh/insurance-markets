import sys, json, time
sys.path.insert(0, '.')
import lib
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
for url in ("https://base-rpc.publicnode.com", "https://base.drpc.org"):
    latest = int(lib.rpc(url, "eth_blockNumber")["result"], 16)
    for back_days in (1, 20, 100):
        end = latest - back_days * 43200
        time.sleep(1)
        j = lib.rpc(url, "eth_getLogs", [{"fromBlock": hex(end - 9999), "toBlock": hex(end), "address": MAILBOX, "topics": [T]}])
        if "result" in j:
            print(url, "back_days", back_days, "logs", len(j["result"]))
        else:
            print(url, "back_days", back_days, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:200], j.get("_http"))
