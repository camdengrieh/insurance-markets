import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
IMPL = "0xdc4b86B0f3Abfc461a9A03a94B347D6F5DA8D052"
st, j = lib.get_json(H + "/api/v2/smart-contracts/" + IMPL)
print(st)
for k in ("name", "is_verified", "is_fully_verified", "compiler_version", "optimization_enabled", "file_path", "license_type", "verified_at"):
    print(k, "=", j.get(k))
print("additional sources:", [s.get("file_path") for s in j.get("additional_sources", [])])
json.dump(j, open("xo_impl_contract.json", "w"))
for e in j["abi"]:
    if e["type"] in ("function", "event", "constructor", "error"):
        ins = ",".join(("indexed " if i.get("indexed") else "") + i["type"] + " " + i.get("name", "") for i in e.get("inputs", []))
        outs = ",".join(o["type"] for o in e.get("outputs", []))
        print("%-9s %s(%s) %s %s" % (e["type"], e.get("name", ""), ins, e.get("stateMutability", ""), ("-> " + outs) if outs else ""))
