import json, sys, collections
sys.path.insert(0, ".")
import xohttp
accts = ["0xC4531B7f421F1cC6Efd83e5F426Bfb39Ff4F7930"]
ws = list(json.load(open("out/creator_wallets.json")).keys())
accts += [w for w in ws[1:3]]
for a in accts:
    c, t = xohttp.get("https://explorer-mainnet.xo.market/api/v2/addresses/%s/token-transfers?type=ERC-20" % a)
    items = t.get("items") or []
    print(a[:8] + ".." + a[-4:], c, len(items), "next" if t.get("next_page_params") else "")
    cnt = collections.Counter()
    for it in items:
        frm = (it.get("from") or {}).get("hash"); to = (it.get("to") or {}).get("hash")
        direction = "IN" if to and to.lower() == a.lower() else "OUT"
        cnt[(direction, it.get("type"), (it.get("token") or {}).get("symbol"), (frm if direction == "IN" else to or "")[:10], it.get("method"))] += 1
    for k, v in cnt.most_common(8): print("  ", v, k)
