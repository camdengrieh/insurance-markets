import json, collections
j = json.load(open("out/ad_bulk_r1.json"))
rows = j["result"]
fac = collections.Counter(); pm = collections.Counter(); senders=set(); txs=collections.Counter()
for r in rows:
    d = r["data"][2:]
    f = "0x"+d[24:64]; p = "0x"+d[88:128]
    fac[f]+=1; pm[p]+=1
    senders.add(r["topics"][2][-40:]); txs[r["transactionHash"]]+=1
print("rows", len(rows), "distinct senders", len(senders), "distinct txs", len(txs))
print("factories", fac)
print("paymasters", pm)
print("txs with >1 deployment", sum(1 for v in txs.values() if v>1))
import datetime
ts = [int(r["timeStamp"],16) for r in rows]
print(datetime.datetime.utcfromtimestamp(min(ts)), datetime.datetime.utcfromtimestamp(max(ts)))
