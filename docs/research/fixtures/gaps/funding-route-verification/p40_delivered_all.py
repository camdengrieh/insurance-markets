import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
a = json.load(open("data/burst_analysis.json"))
miss = a["missing_ids"]
done = {0, 1, 2, 10, len(miss) - 1}   # already checked in p39
byid = {m["id"]: m for m in a["msgs"]}
res = {}
for k, i in enumerate(miss):
    if k in done:
        res[i] = True; continue
    r = lib.eth_call(XO, MB, lib.selector("delivered(bytes32)") + i[2:])
    res[i] = (r == "0x" + "0" * 63 + "1")
print("checked", len(res), "delivered true:", sum(res.values()), "false:", [byid[i]["nonce"] for i, v in res.items() if not v])
json.dump(res, open("data/burst_delivered.json", "w"))
