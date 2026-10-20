import json, sys, collections
sys.path.insert(0, ".")
import rpc
dec = [r for r in json.load(open("out/decoded.json")) if not r.get("decodeError")]
owners = [r["owner"] for r in dec]
res = {}
for name, url in (("base", "https://mainnet.base.org"), ("ethereum", "https://ethereum-rpc.publicnode.com")):
    calls = []
    for o in owners:
        calls.append(("eth_getTransactionCount", [o, "latest"]))
    code, j = rpc.call(url, calls)
    if not isinstance(j, list):
        print(name, code, str(j)[:200]); continue
    res[name] = {o: (int(r["result"], 16) if "result" in r else None) for o, r in zip(owners, j)}
    nz = sum(1 for v in res[name].values() if v)
    print(name, code, "owners with nonce>0:", nz, "of", len(owners), "max nonce", max(v or 0 for v in res[name].values()))
rows = []
for r in dec:
    o = r["owner"]
    rows.append(dict(account_short=r["sender"][:8] + ".." + r["sender"][-4:], owner_short=o[:8] + ".." + o[-4:], base_nonce=res.get("base", {}).get(o), eth_nonce=res.get("ethereum", {}).get(o)))
json.dump(rows, open("out/owner_activity.json", "w"), indent=1)
cnt = collections.Counter(((r["base_nonce"] or 0) > 0 or (r["eth_nonce"] or 0) > 0) for r in rows)
print("any activity on Base/Ethereum:", cnt)
