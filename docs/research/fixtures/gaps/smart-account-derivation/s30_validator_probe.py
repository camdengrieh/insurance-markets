import json, sys
sys.path.insert(0, ".")
import rpc
d = json.load(open("out/validator_probe_cases.json"))
# one HTTP request per case batch (batch of eth_call with state-override third param); read-only
calls = [("eth_call", [{"from": c["from"], "to": c["to"], "data": c["data"]}, "latest", c["override"]]) for c in d["cases"]]
code, j = rpc.call("https://mainnet.base.org", calls)
print(code)
res = []
for c, r in zip(d["cases"], j):
    out = r.get("result") if "result" in r else ("ERR " + json.dumps(r.get("error"))[:140])
    print("%-62s -> %s" % (c["label"], out))
    res.append(dict(label=c["label"], result=out))
json.dump(res, open("out/validator_probe_results.json", "w"), indent=1)
