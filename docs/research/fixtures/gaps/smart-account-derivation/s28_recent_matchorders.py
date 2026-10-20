import json, sys
sys.path.insert(0, ".")
import xohttp
c, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/addresses/0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307/transactions?filter=to")
items = j.get("items") or []
print(c, len(items))
n = 0
for it in items:
    if it.get("method") == "matchOrders" and it.get("raw_input"):
        keep = {k: it.get(k) for k in ("hash", "raw_input", "block_number", "timestamp", "status", "method")}
        keep["to"] = (it.get("to") or {}).get("hash")
        json.dump(keep, open("out/mo_%s.json" % it["hash"], "w")); n += 1
print("saved matchOrders txs:", n)
