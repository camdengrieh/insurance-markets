import json, os, sys
sys.path.insert(0, ".")
import xohttp
sel = json.load(open("out/sample_sel.json"))
for s in sel:
    fn = "out/tx_%s.json" % s["tx"]
    if os.path.exists(fn): continue
    code, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/transactions/" + s["tx"])
    if code != 200 or not isinstance(j, dict) or "raw_input" not in j:
        print("FAIL", s["tx"], code); continue
    # keep only what the decoder needs plus a few facts (drop big fields)
    keep = {k: j.get(k) for k in ("hash","raw_input","block_number","timestamp","status","method","gas_used")}
    keep["to"] = (j.get("to") or {}).get("hash"); keep["from"] = (j.get("from") or {}).get("hash")
    json.dump(keep, open(fn, "w"))
print("done", xohttp.used())
