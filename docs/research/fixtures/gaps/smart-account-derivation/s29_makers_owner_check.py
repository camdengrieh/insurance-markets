import json, sys
sys.path.insert(0, ".")
import xohttp
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T_OWN = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
rec = json.load(open("out/makers_recovered.json"))
N = int(sys.argv[1])
out = []
for maker, r in list(rec.items())[:N]:
    url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic0_1_opr=and&topic1=%s"
           % (VAL, T_OWN, "0x" + "0" * 24 + maker[2:].lower()))
    c, j = xohttp.get(url)
    owners = ["0x" + x["topics"][2][-40:] for x in (j.get("result") or [])]
    m_raw = r["raw"].lower() in owners
    m_191 = r["eip191"].lower() in owners
    out.append(dict(maker=maker[:8] + ".." + maker[-4:], registered_owner_events=len(owners), raw_matches_registered_owner=m_raw, eip191_matches_registered_owner=m_191))
    print(out[-1])
json.dump(out, open("out/makers_owner_check.json", "w"), indent=1)
import collections
print(collections.Counter((o["raw_matches_registered_owner"], o["eip191_matches_registered_owner"]) for o in out))
