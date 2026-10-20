import json, sys
sys.path.insert(0, ".")
import xohttp
w = list(json.load(open("out/creator_wallets.json")).keys())[0]
code, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/addresses/" + w)
print(code)
print(json.dumps(j, indent=1)[:3000])
json.dump(j, open("out/first_addr.json","w"))
