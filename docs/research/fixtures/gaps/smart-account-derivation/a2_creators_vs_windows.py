# Join the Data API creator wallets (s02) with the AccountDeployed senders of the pulled windows (s09).
import json, collections
cre = set(json.load(open("out/creator_wallets.json")).keys())
dep = {}
for tag in ("r0", "m1", "m2", "m3", "m4", "r1"):
    for r in json.load(open("out/ad_bulk_%s.json" % tag))["result"] or []:
        dep["0x" + r["topics"][2][-40:]] = (tag, "0x" + r["data"][2:][24:64])
hit = [c for c in cre if c in dep]
print("deployment rows:", len(dep), "| creator wallets:", len(cre), "| found as deployed senders:", len(hit))
print(collections.Counter(dep[c][0] for c in hit), collections.Counter(dep[c][1] for c in hit))
