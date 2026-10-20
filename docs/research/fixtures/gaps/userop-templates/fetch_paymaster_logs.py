"""PolicyPaymaster configuration history from Blockscout getLogs (GET): selectors, whitelists, limits, pause, unlimited."""
import sys, json, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x

B = "https://explorer-mainnet.xo.market"
PM = "0x2353b23d8f329fd3cec0d21652f14208248a439d"
def k(sig): return subprocess.run(["cast", "keccak", sig], capture_output=True, text=True).stdout.strip()
EV = {
  "GlobalSelectorAllowed": k("GlobalSelectorAllowed(bytes4,bool)"),
  "SelectorAllowed": k("SelectorAllowed(address,bytes4,bool)"),
  "ContractWhitelisted": k("ContractWhitelisted(address,bool)"),
  "UnlimitedAddressSet": k("UnlimitedAddressSet(address,bool)"),
  "DailyTxLimitUpdated": k("DailyTxLimitUpdated(uint256,uint256)"),
  "Paused": k("Paused(address)"),
  "Unpaused": k("Unpaused(address)"),
  "OwnershipTransferred": k("OwnershipTransferred(address,address)"),
}
out = {}
for name, t0 in EV.items():
    q = "%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s" % (B, PM, t0)
    try:
        r = x.get_json(q)
    except Exception as e:
        print(name, "ERR", e); continue
    res = r.get("result")
    res = res if isinstance(res, list) else []
    out[name] = [{"block": int(l["blockNumber"], 16), "tx": l["transactionHash"], "topics": l["topics"], "data": l["data"]} for l in res]
    print(name, len(res))
Path(Path(__file__).resolve().parent / "paymaster_logs.json").write_text(json.dumps(out))
