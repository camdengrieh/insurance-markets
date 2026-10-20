"""Pick a handful of on-chain orders (distinct makers, one 0x00-prefixed) and write them to raw/pick.json,
then look up each maker's registered ECDSA-validator owner from OwnerRegistered logs (public chain data)."""
import json, glob, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"  # keccak OwnerRegistered(address,address)
seen = {}
for f in sorted(glob.glob("raw/op_txs_p*.json")):
    for t in json.load(open(f))["items"]:
        di = t.get("decoded_input") or {}
        if not di.get("parameters"): continue
        P = {p["name"]: p["value"] for p in di["parameters"]}
        for role, v in [("taker", P["takerOrder"])] + [("maker", m) for m in P["makerOrders"]]:
            sig = v[13]
            kind = "0x01" if (len(sig) == 2 + 2 * 86 and sig[2:4] == "01") else ("0x00" if (len(sig) == 2 + 2 * 66 and sig[2:4] == "00") else "other")
            key = (v[1], kind)
            if key in seen or kind == "other": continue
            seen[key] = dict(role=role, tx=t["hash"], order=v, kind=kind)
picked = [x for k, x in seen.items()]
# limit: all 0x00 + up to 8 of 0x01
z = [x for x in picked if x["kind"] == "0x00"]
o = [x for x in picked if x["kind"] == "0x01"][:8]
picked = z + o
for x in picked:
    acct = x["order"][1]
    url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic1=0x%s&topic0_1_opr=and"
           % (VAL, T, acct[2:].lower().rjust(64, "0")))
    b = fetch.get(url)
    d = json.loads(b) if b else {"result": []}
    owners = ["0x" + r["topics"][2][-40:] for r in (d.get("result") or []) if len(r.get("topics") or []) > 2 and r["topics"][2]]
    x["owners"] = owners
json.dump(picked, open("raw/pick.json", "w"))
print("picked", len(picked), "kinds", [x["kind"] for x in picked], "owners found", [len(x["owners"]) for x in picked])
