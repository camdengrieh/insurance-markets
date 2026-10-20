"""Count EntryPoint AccountDeployed events by factory and paymaster in a recent window (GET getLogs only)."""
import sys, json, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x
B = "https://explorer-mainnet.xo.market"
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d"
HEAD = int(sys.argv[1]); W = int(sys.argv[2])
q = "%s/api?module=logs&action=getLogs&fromBlock=%d&toBlock=%d&address=%s&topic0=%s" % (B, HEAD - W, HEAD, EP, T)
r = x.get_json(q)["result"]
c = collections.Counter()
for l in r:
    fac = "0x" + l["data"][2 + 24:2 + 64]
    pm = "0x" + l["data"][2 + 64 + 24:2 + 128]
    c[(fac, pm)] += 1
print("AccountDeployed events:", len(r), "blocks", int(r[0]["blockNumber"], 16), "-", int(r[-1]["blockNumber"], 16))
for (fac, pm), n in c.most_common():
    print(" factory", fac, "paymaster", pm, n)
