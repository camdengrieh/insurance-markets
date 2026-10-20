import json, sys
sys.path.insert(0, ".")
import xohttp
w = list(json.load(open("out/creator_wallets.json")).keys())[0]
base = "https://explorer-mainnet.xo.market"
for path in ["/api/v2/addresses/%s/transactions" % w,
             "/api/v2/proxy/account-abstraction/accounts/%s" % w,
             "/api/v2/proxy/account-abstraction/factories?page_size=10",
             "/api/v2/config/backend"]:
    code, j = xohttp.get(base + path)
    s = json.dumps(j)[:1500] if not isinstance(j, str) else j[:600]
    print(path, code, s)
    print()
