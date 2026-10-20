import json, sys, collections
sys.path.insert(0, ".")
import xohttp
dec = [r for r in json.load(open("out/decoded.json")) if not r.get("decodeError")]
N = int(sys.argv[1])
rows = []
step = max(1, len(dec) // N)
for r in dec[::step][:N]:
    acct, owner = r["sender"], r["owner"]
    c1, a = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % acct)
    c2, b = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % owner)
    c3, d = xohttp.get("https://api-mainnet.xo.market/api/users/portfolio?user=%s" % acct)
    rows.append(dict(acct=acct[:8] + ".." + acct[-4:], via_account_smart_account=(a.get("smart_account") if isinstance(a, dict) else None) is not None,
                     via_owner_smart_account=(b.get("smart_account") if isinstance(b, dict) else None) is not None,
                     dataapi_portfolio_status=c3, deploy_paymaster=r["paymaster"][:8]))
print(collections.Counter((x["via_account_smart_account"], x["via_owner_smart_account"], x["dataapi_portfolio_status"]) for x in rows))
for x in rows: print(x)
json.dump(rows, open("out/registry_vs_deployed.json", "w"), indent=1)
print(xohttp.used())
