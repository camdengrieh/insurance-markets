"""Pull full XO-side bridge logs through the explorer's etherscan-style getLogs, page by page."""
import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
sets = {
    "xo_processid": (MB, lib.topic0("ProcessId(bytes32)")),
    "xo_dispatchid": (MB, lib.topic0("DispatchId(bytes32)")),
    "xo_received": (ROUTE, lib.topic0("ReceivedTransferRemote(uint32,bytes32,uint256)")),
    "xo_sent": (ROUTE, lib.topic0("SentTransferRemote(uint32,bytes32,uint256)")),
}
for name, (addr, t0) in sets.items():
    rows, page = [], 1
    while True:
        st, j = lib.bs_logs(H, addr, t0, 0, 99999999, page=page, offset=1000)
        if st != 200 or not isinstance(j, dict) or not isinstance(j.get("result"), list):
            print(name, "page", page, "stop:", st, str(j)[:200]); break
        rows.extend(j["result"])
        if len(j["result"]) < 1000: break
        page += 1
        if page > 30: break
    seen, uniq = set(), []
    for r in rows:
        k = (r["transactionHash"], r["logIndex"])
        if k not in seen: seen.add(k); uniq.append(r)
    json.dump(uniq, open("data/%s.json" % name, "w"))
    bn = [int(r["blockNumber"], 16) for r in uniq]
    print(name, "rows", len(rows), "unique", len(uniq), "monotonic", bn == sorted(bn), "first_ts", int(uniq[0]["timeStamp"], 16) if uniq else None, "last_ts", int(uniq[-1]["timeStamp"], 16) if uniq else None)
