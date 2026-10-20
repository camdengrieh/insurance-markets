import json, sys
sys.path.insert(0, ".")
import xohttp
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T0 = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d"
frm, to = sys.argv[1], sys.argv[2]
tag = sys.argv[3]
url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=%s&toBlock=%s"
       "&address=%s&topic0=%s" % (frm, to, EP, T0))
code, j = xohttp.get(url)
res = j.get("result") if isinstance(j, dict) else None
print(code, len(res) if res else res, (j.get("message") if isinstance(j, dict) else None))
if res:
    print("first block", int(res[0]["blockNumber"],16), "last block", int(res[-1]["blockNumber"],16))
json.dump(j, open("out/ad_bulk_%s.json" % tag, "w"))
