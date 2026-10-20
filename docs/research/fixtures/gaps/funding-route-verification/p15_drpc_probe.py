import sys, json, time
sys.path.insert(0, '.')
import lib
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
url = "https://base.drpc.org"
latest = int(lib.rpc(url, "eth_blockNumber")["result"], 16)
end = latest - 20 * 43200
for span in (9000, 5000, 2000, 1000):
    time.sleep(1)
    j = lib.rpc(url, "eth_getLogs", [{"fromBlock": hex(end - span + 1), "toBlock": hex(end), "address": MAILBOX, "topics": [T]}])
    if "result" in j:
        print("span", span, "logs", len(j["result"])); break
    print("span", span, "error", json.dumps(j.get("error") or j.get("_raw") or j)[:200], j.get("_http"))
