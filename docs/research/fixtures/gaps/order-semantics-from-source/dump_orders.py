import json, glob
out=[]
for f in sorted(glob.glob("raw/op_txs_p*.json")):
    for t in json.load(open(f))["items"]:
        di=t.get("decoded_input") or {}
        if not di.get("parameters"): continue
        P={p["name"]:p["value"] for p in di["parameters"]}
        for role,v in [("taker",P["takerOrder"])]+[("maker",m) for m in P["makerOrders"]]:
            out.append({"role":role,"tx":t["hash"],"order":v})
json.dump(out, open("raw/all_orders.json","w"))
print(len(out))
