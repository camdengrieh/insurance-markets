import json, sys
sys.path.insert(0, ".")
import xohttp
j = json.load(open("out/route_recv.json"))["result"]
rcpt = "0x" + j[0]["topics"][2][-40:]
c, t = xohttp.get("https://explorer-mainnet.xo.market/api/v2/addresses/%s/token-transfers" % rcpt)
print(c)
for it in (t.get("items") or [])[:10]:
    print(it.get("timestamp"), it.get("type"), "from", (it.get("from") or {}).get("hash"), "to", (it.get("to") or {}).get("hash"),
          "token", (it.get("token") or {}).get("symbol"), "val", (it.get("total") or {}).get("value"), "tx", it.get("transaction_hash")[:12] if it.get("transaction_hash") else None, "method", it.get("method"))
