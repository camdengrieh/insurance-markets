"""Pull XO-side Mailbox ProcessId / DispatchId logs (with timestamps) for the two Base windows, via the explorer's getLogs (<=1000 rows per call)."""
import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
ranges = {"A": (12548701, 13000000), "B": (9195705, 9366879)}
tops = {"processid": lib.topic0("ProcessId(bytes32)"), "dispatchid": lib.topic0("DispatchId(bytes32)")}
for w, (lo, hi) in ranges.items():
    for tn, t0 in tops.items():
        st, j = lib.bs_logs(H, MB, t0, lo, hi, offset=1000)
        rows = j.get("result", []) if isinstance(j, dict) else []
        json.dump(rows, open("data/xo_%s_%s.json" % (w, tn), "w"))
        ts = [int(r["timeStamp"], 16) for r in rows]
        print(w, tn, "http", st, "rows", len(rows), "capped" if len(rows) >= 1000 else "", (min(ts), max(ts)) if ts else None)
