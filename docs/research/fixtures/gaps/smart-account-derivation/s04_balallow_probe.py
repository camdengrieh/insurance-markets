import json, sys
sys.path.insert(0, ".")
import xohttp
ws = list(json.load(open("out/creator_wallets.json")).keys())
for w in ws[:3]:
    code, j = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % w)
    print(w[:8]+".."+w[-4:], code, j)
