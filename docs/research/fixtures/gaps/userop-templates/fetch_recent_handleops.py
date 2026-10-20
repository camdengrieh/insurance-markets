"""Fetch N pages (50 each) of the newest EntryPoint-bound transactions from Blockscout REST (GET) -> recent_handleops.json (hash, block, from, status, gas_used, raw_input)."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x
B = "https://explorer-mainnet.xo.market"
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
pages = int(sys.argv[1]) if len(sys.argv) > 1 else 2
url = "%s/api/v2/addresses/%s/transactions?filter=to" % (B, EP)
rows = []
for i in range(pages):
    r = x.get_json(url)
    for it in r["items"]:
        rows.append({"hash": it["hash"], "block": it["block_number"], "from": it["from"]["hash"] if isinstance(it["from"], dict) else it["from"], "status": it["status"], "result": it["result"], "gas_used": it["gas_used"], "gas_price": it["gas_price"], "method": it["method"], "raw_input": it["raw_input"]})
    np = r.get("next_page_params")
    if not np: break
    url = "%s/api/v2/addresses/%s/transactions?filter=to&%s" % (B, EP, "&".join("%s=%s" % (k, v) for k, v in np.items()))
Path(Path(__file__).resolve().parent / "recent_handleops.json").write_text(json.dumps(rows))
print(len(rows), "txs; blocks", rows[-1]["block"], "-", rows[0]["block"])
