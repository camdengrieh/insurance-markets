import json, sys
sys.path.insert(0, ".")
import xohttp
w = list(json.load(open("out/creator_wallets.json")).keys())[0]
code, j = xohttp.get("https://explorer-mainnet.xo.market/api?module=proxy&action=eth_getCode&address=%s&tag=latest" % w)
print(code, j)
