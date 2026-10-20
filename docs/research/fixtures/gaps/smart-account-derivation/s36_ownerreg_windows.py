import json, sys
sys.path.insert(0, ".")
import xohttp
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T_OWN = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
for tag, frm, to in (("r0", 0, 12000000), ("m1", 2000000, 2999999), ("m2", 5000000, 5999999), ("m3", 8000000, 8999999), ("m4", 10500000, 11499999)):
    url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=%d&toBlock=%d&address=%s&topic0=%s" % (frm, to, VAL, T_OWN))
    c, j = xohttp.get(url)
    res = j.get("result") or []
    pairs = [("0x" + r["topics"][1][-40:], "0x" + r["topics"][2][-40:], int(r["blockNumber"], 16)) for r in res]
    json.dump(pairs, open("out/ownerreg_%s.json" % tag, "w"))
    print(tag, c, len(pairs), "events;", len(set(p[1] for p in pairs)), "distinct owners")
