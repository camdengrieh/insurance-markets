import json, sys, collections
sys.path.insert(0, ".")
import xohttp
rec = json.load(open("out/makers_recovered.json"))
rows = []
for m in rec:
    c1, a = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % m)
    c3, d = xohttp.get("https://api-mainnet.xo.market/api/users/portfolio?user=%s" % m)
    rows.append(dict(maker=m[:8] + ".." + m[-4:], orderbook_smart_account=(a.get("smart_account") is not None) if isinstance(a, dict) else None,
                     balance_micro=a.get("balance") if isinstance(a, dict) else None, dataapi_status=c3))
print(collections.Counter((r["orderbook_smart_account"], r["dataapi_status"]) for r in rows))
for r in rows: print(r)
json.dump(rows, open("out/makers_registry.json", "w"), indent=1)
