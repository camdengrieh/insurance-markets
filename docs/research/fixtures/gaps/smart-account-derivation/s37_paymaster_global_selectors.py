import json, sys
sys.path.insert(0, ".")
import xohttp
PM = "0x2353b23d8f329fd3cec0d21652f14208248a439d"
T = "0xa79dae41d7287677c7e22d922b33d900330fdfabcf809d0e8a0bd1b7a6733096"
c, j = xohttp.get("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s" % (PM, T))
res = j.get("result") or []
state = {}
for r in sorted(res, key=lambda r: (int(r["blockNumber"], 16), int(r["logIndex"], 16))):
    sel = r["topics"][1][:10]
    state[sel] = bool(int(r["data"], 16))
print(c, len(res), "events;", sum(1 for v in state.values() if v), "currently allowed global selectors")
json.dump(sorted(s for s, v in state.items() if v), open("out/pm_global_selectors.json", "w"))
