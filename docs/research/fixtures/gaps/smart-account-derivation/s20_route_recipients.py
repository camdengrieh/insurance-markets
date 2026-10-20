import json, sys
sys.path.insert(0, ".")
import xohttp
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
T0 = sys.argv[1]
frm = sys.argv[2]
url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=%s&toBlock=latest&address=%s&topic0=%s" % (frm, ROUTE, T0))
code, j = xohttp.get(url)
res = j.get("result") or []
print(code, j.get("message"), len(res))
json.dump(j, open("out/route_recv.json", "w"))
if res:
    print(res[0]["topics"], res[0]["data"][:80])
