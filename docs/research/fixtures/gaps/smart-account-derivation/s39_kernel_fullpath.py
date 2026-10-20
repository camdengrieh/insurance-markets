import json, sys
sys.path.insert(0, ".")
import rpc
d = json.load(open("out/kernel_fullpath_cases.json"))
calls = []
for c in d["cases"]:
    p = [{"to": c["to"], "data": c["data"]}, "latest"]
    if c["override"]: p.append(c["override"])
    calls.append(("eth_call", p))
code, j = rpc.call("https://mainnet.base.org", calls)
print(code)
res = []
for c, r in zip(d["cases"], j):
    out = r.get("result") if "result" in r else "ERR " + json.dumps(r.get("error"))[:160]
    print("%-70s -> %s" % (c["label"], out)); res.append(dict(label=c["label"], result=out))
json.dump(res, open("out/kernel_fullpath_results.json", "w"), indent=1)
