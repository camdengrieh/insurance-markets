import json, sys
sys.path.insert(0, ".")
import xohttp
a = "0xC4531B7f421F1cC6Efd83e5F426Bfb39Ff4F7930"
c, t = xohttp.get("https://explorer-mainnet.xo.market/api/v2/addresses/%s/token-transfers?type=ERC-20" % a)
txs = []
for it in t.get("items") or []:
    if it.get("method") == "matchOrders" and it["transaction_hash"] not in txs:
        txs.append(it["transaction_hash"])
print(txs[:4])
for h in txs[:2]:
    c, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/transactions/" + h)
    keep = {k: j.get(k) for k in ("hash", "raw_input", "block_number", "timestamp", "status", "method")}
    keep["to"] = (j.get("to") or {}).get("hash")
    json.dump(keep, open("out/mo_%s.json" % h, "w"))
    print(h, c, keep["method"], keep["to"], len(keep["raw_input"]))
