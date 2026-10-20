import json, sys
sys.path.insert(0, ".")
import rpc
d = json.load(open("out/vbyte_cases.json"))
code, j = rpc.call("https://mainnet.base.org", [("eth_call", [{"from": c["from"], "to": c["to"], "data": c["data"]}, "latest", c["override"]]) for c in d["cases"]])
for c, r in zip(d["cases"], j):
    print("%-26s -> %s" % (c["label"], r.get("result") if "result" in r else "ERR " + json.dumps(r.get("error"))[:140]))
