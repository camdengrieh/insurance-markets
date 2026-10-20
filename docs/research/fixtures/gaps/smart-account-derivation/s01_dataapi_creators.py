import json, sys
sys.path.insert(0, ".")
import xohttp
code, j = xohttp.get("https://api-mainnet.xo.market/api/markets?marketType=4&take=50&page=1")
print(code, type(j))
json.dump(j, open("out/markets_t4_p1.json","w"))
items = j.get("data") or j.get("items") or []
print(len(items), list(j.keys()) if isinstance(j, dict) else None)
if items:
    print(json.dumps(items[0], indent=1)[:2500])
