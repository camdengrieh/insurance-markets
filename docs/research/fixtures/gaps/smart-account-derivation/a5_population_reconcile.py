# Reconcile AccountDeployed senders (s09) with OwnerRegistered kernels (s36); summarise windows.
import json, datetime, collections
ad = {}
for t in ("r0", "m1", "m2", "m3", "m4", "r1"):
    for r in json.load(open("out/ad_bulk_%s.json" % t))["result"] or []:
        ad["0x" + r["topics"][2][-40:]] = (t, int(r["blockNumber"], 16), "0x" + r["data"][2:][24:64])
orr = {}
allp = []
for t in ("r0", "m1", "m2", "m3", "m4", "r1"):
    for k, o, b in json.load(open("out/ownerreg_%s.json" % t)): orr[k] = (t, b); allp.append((k, o))
canon = {k for k, v in ad.items() if v[2] == "0xaac5d4240af87249b3f71bc8e4a2cae074a3e419"}
print("AD rows", len(ad), "canonical", len(canon), "| OR kernels", len(orr), "| distinct owners", len(set(o for _, o in allp)), "| owner==kernel", sum(1 for k, o in allp if k == o))
print("canonical AD not in OR:", len(canon - set(orr)), "| OR not in AD:", len(set(orr) - set(ad)))
for t in ("r0", "m1", "m2", "m3", "m4", "r1"):
    rows = json.load(open("out/ad_bulk_%s.json" % t))["result"] or []
    ts = [int(r["timeStamp"], 16) for r in rows]
    fac = collections.Counter("0x" + r["data"][2:][24:64] for r in rows); pm = collections.Counter("0x" + r["data"][2:][88:128] for r in rows)
    print(t, len(rows), datetime.datetime.fromtimestamp(min(ts), datetime.UTC).date(), datetime.datetime.fromtimestamp(max(ts), datetime.UTC).date(), dict(fac), dict(pm))
