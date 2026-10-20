import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
a = json.load(open("data/burst_analysis.json"))
miss = a["missing_ids"]
res = []
for i in miss[:3] + [miss[10], miss[-1]]:
    r = lib.eth_call(XO, MB, lib.selector("delivered(bytes32)") + i[2:])
    res.append((i[:14], r))
    print(i, r)
# control: a delivered message from the same window
ctrl = [m for m in a["msgs"] if m["id"] not in set(miss)][0]
print("control", ctrl["nonce"], lib.eth_call(XO, MB, lib.selector("delivered(bytes32)") + ctrl["id"][2:]))
