import sys, json, time
sys.path.insert(0, '.')
import lib
url = "https://mainnet.base.org"
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
T = lib.topic0("DispatchId(bytes32)")
latest = int(lib.rpc(url, "eth_blockNumber")["result"], 16)
# Direct single attempts (no auto-retry loop burning the cap): call http once via a raw urllib path
import urllib.request
def once(payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"User-Agent": lib.UA, "Content-Type": "application/json"})
    cnt = lib._load(); cnt["mainnet.base.org"] = cnt.get("mainnet.base.org", 0) + 1; lib._save(cnt)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read().decode()[:300]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:300]
for span in (100, 2000):
    time.sleep(3)
    print("getLogs span", span, once({"jsonrpc": "2.0", "id": 1, "method": "eth_getLogs", "params": [{"fromBlock": hex(latest - span), "toBlock": hex(latest), "address": MAILBOX, "topics": [T]}]}))
time.sleep(3)
print("eth_call nonce() 2 days back", once({"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": MAILBOX, "data": lib.selector("nonce()")}, hex(latest - 2 * 43200)]}))
