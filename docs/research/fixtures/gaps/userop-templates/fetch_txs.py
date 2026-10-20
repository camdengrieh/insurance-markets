"""Fetch Blockscout etherscan-style gettxinfo (input + logs, GET) for tx hashes into ./txs/<hash>.json."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x

B = "https://explorer-mainnet.xo.market"
OUT = Path(__file__).resolve().parent / "txs"
OUT.mkdir(exist_ok=True)
for h in sys.argv[1:]:
    p = OUT / (h.lower() + ".json")
    if p.exists():
        continue
    r = x.get_json(B + "/api?module=transaction&action=gettxinfo&txhash=" + h)
    res = r["result"]
    if res.get("next_page_params"):
        print("WARNING logs paginated for", h, res["next_page_params"])
    p.write_text(json.dumps(res))
    print(h, "to", res["to"], "success", res["success"], "block", res["blockNumber"], "logs", len(res["logs"]), "inputlen", len(res["input"]))
