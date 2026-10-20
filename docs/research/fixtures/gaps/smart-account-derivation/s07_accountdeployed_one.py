import json, sys
sys.path.insert(0, ".")
import xohttp
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T0 = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d"
w = list(json.load(open("out/creator_wallets.json")).keys())[0]
t2 = "0x" + "0"*24 + w[2:]
url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest"
       "&address=%s&topic0=%s&topic0_2_opr=and&topic2=%s" % (EP, T0, t2))
code, j = xohttp.get(url)
print(code)
print(json.dumps(j, indent=1)[:2500])
json.dump(j, open("out/ad_first.json","w"))
