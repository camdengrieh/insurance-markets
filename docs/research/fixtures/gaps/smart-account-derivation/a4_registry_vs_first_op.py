# Relate the orderbook registry flag (s34) to the class of the account's first (deploying) UserOp (decode_deploy output).
import json, collections
dec = {r["sender"][:8] + ".." + r["sender"][-4:]: r for r in json.load(open("out/decoded.json")) if not r.get("decodeError")}
tbl = collections.defaultdict(list)
for x in json.load(open("out/registry_vs_deployed.json")):
    d = dec[x["acct"]]; cl = d["call"]
    tbl[x["via_account_smart_account"]].append((x["acct"], d["paymaster"][:8], cl.get("execMode"), [(i["target"][:8], i["sel"]) for i in cl.get("inner", [])]))
for k, v in tbl.items():
    print("smart_account non-null:", k)
    for row in v: print("   ", row)
