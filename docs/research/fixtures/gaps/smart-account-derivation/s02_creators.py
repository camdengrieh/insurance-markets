import json, sys
sys.path.insert(0, ".")
import xohttp
allw = {}
for p in (1,2,3):
    if p == 1:
        j = json.load(open("out/markets_t4_p1.json"))
    else:
        code, j = xohttp.get("https://api-mainnet.xo.market/api/markets?marketType=4&take=50&page=%d" % p)
        json.dump(j, open("out/markets_t4_p%d.json" % p, "w"))
    for m in j["data"]:
        c = m.get("creator") or {}
        w = c.get("walletPublicKey")
        if w:
            allw.setdefault(w.lower(), 0)
            allw[w.lower()] += 1
print(len(allw), "distinct creator wallets from", sum(allw.values()), "rows")
json.dump(allw, open("out/creator_wallets.json", "w"), indent=1)
print(xohttp.used())
