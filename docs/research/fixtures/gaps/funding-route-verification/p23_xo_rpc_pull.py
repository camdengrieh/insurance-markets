"""Pull all XO-side Mailbox ProcessId / DispatchId logs via the XO RPC (eth_getLogs), 2M-block spans."""
import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://rpc-mainnet-2.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
latest = int(lib.rpc(RPC, "eth_blockNumber")["result"], 16)
START = 2_500_000
SPAN = 2_000_000
def pull(name, t0):
    out, lo = [], START
    while lo <= latest:
        hi = min(lo + SPAN - 1, latest)
        j = lib.rpc(RPC, "eth_getLogs", [{"fromBlock": hex(lo), "toBlock": hex(hi), "address": MB, "topics": [t0]}])
        if "result" not in j:
            print(name, lo, hi, "ERROR", json.dumps(j.get("error") or j.get("_raw"))[:300]); return None
        print(name, lo, hi, len(j["result"]))
        out.extend(j["result"]); lo = hi + 1
    seen, uniq = set(), []
    for r in out:
        k = (r["transactionHash"], r["logIndex"])
        if k not in seen: seen.add(k); uniq.append(r)
    json.dump(uniq, open("data/%s_rpc.json" % name, "w"))
    return uniq
print("latest", latest)
p = pull("xo_processid", lib.topic0("ProcessId(bytes32)"))
d = pull("xo_dispatchid", lib.topic0("DispatchId(bytes32)"))
print("processid unique", len(p) if p else None, "dispatchid unique", len(d) if d else None)
