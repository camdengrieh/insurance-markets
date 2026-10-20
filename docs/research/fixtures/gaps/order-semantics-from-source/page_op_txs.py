import json, sys, urllib.parse, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch
BASE="https://explorer-mainnet.xo.market/api/v2/addresses/0x81c589076D5Ee1072fab579e8156e35a8b84e294/transactions"
npages=int(sys.argv[1])
d=json.load(open("raw/op_txs_p1.json"))
for i in range(2, npages+1):
    nxt=d.get("next_page_params")
    if not nxt: break
    url=BASE+"?"+urllib.parse.urlencode(nxt)
    out=f"raw/op_txs_p{i}.json"
    b=fetch.get(url,out)
    if b is None: break
    d=json.loads(b)
    print("page",i,len(d["items"]))
