"""Pull Base-side Mailbox + router logs in 1000-block chunks from the public Tenderly gateway.
Windows: A = most recent 60 chunks, B = 75 chunks starting 2026-08-14 00:00 UTC. Saves incrementally."""
import sys, json, time
sys.path.insert(0, '.')
import lib
URL = "https://base.gateway.tenderly.co"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
TOPICS = [[lib.topic0("DispatchId(bytes32)"), lib.topic0("ProcessId(bytes32)"), lib.topic0("Dispatch(address,uint32,bytes32,bytes)"),
           lib.topic0("Process(uint32,bytes32,address)"), lib.topic0("SentTransferRemote(uint32,bytes32,uint256)"),
           lib.topic0("ReceivedTransferRemote(uint32,bytes32,uint256)")]]
def pull(name, start, nchunks):
    out, errs = [], []
    for i in range(nchunks):
        lo = start + 1000 * i
        j = lib.rpc(URL, "eth_getLogs", [{"fromBlock": hex(lo), "toBlock": hex(lo + 999), "address": [MB, ROUTER], "topics": TOPICS}])
        if "result" in j:
            out.extend(j["result"])
        else:
            errs.append((lo, json.dumps(j.get("error") or j.get("_raw"))[:200]))
        if i % 10 == 9:
            json.dump({"start": start, "n": nchunks, "done": i + 1, "logs": out, "errs": errs}, open("data/base_%s.json" % name, "w"))
    json.dump({"start": start, "n": nchunks, "done": nchunks, "logs": out, "errs": errs}, open("data/base_%s.json" % name, "w"))
    print(name, "start", start, "chunks", nchunks, "logs", len(out), "errs", len(errs), errs[:3])
latest = int(lib.rpc(URL, "eth_blockNumber")["result"], 16)
print("latest", latest)
A_start = latest - 60000 + 1
B_start = (1786665600 - 1686789347) // 2
pull("winA", A_start, 60)
pull("winB", B_start, 75)
