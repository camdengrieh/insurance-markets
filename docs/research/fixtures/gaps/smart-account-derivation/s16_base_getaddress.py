import json, sys
sys.path.insert(0, ".")
import rpc
items = json.load(open("out/getaddress_items.json"))
calls = [("eth_call", [it["call"], "latest"]) for it in items]
# also: code at the Anvil0 counterfactual on Base (informational)
anv = [it for it in items if it["label"].startswith("anvil0")][0]
calls.append(("eth_getCode", [anv["local"], "latest"]))
code, j = rpc.call("https://mainnet.base.org", calls)
print(code)
out = []
for it, r in zip(items, j):
    onchain = "0x" + r["result"][-40:] if r.get("result") else None
    ok = onchain and onchain.lower() == it["local"].lower()
    ok_acct = (onchain.lower() == it["account"].lower()) if (onchain and it["account"]) else None
    print(it["label"], "owner", it["owner"][:8]+".."+it["owner"][-4:], "baseFactory.getAddress==localCompute:", ok, "==observedXOaccount:", ok_acct)
    out.append(dict(label=it["label"], owner=it["owner"], local=it["local"], base_getAddress=onchain, observed_xo_account=it["account"]))
print("code at anvil0 counterfactual on Base:", (len(j[-1]["result"])-2)//2, "bytes")
json.dump(out, open("out/base_getaddress_results.json","w"), indent=1)
