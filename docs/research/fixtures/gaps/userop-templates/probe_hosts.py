"""Keyless read-only JSON-RPC probe of XO's bundler and RPC hosts. Stops on 401/403 (helper marks the host blocked)."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x

HOSTS = {"bundler": "https://mainnet-bundler.xo.market/", "rpc": "https://rpc-mainnet-2.xo.market"}
which = sys.argv[1] if len(sys.argv) > 1 else "all"
for name, url in HOSTS.items():
    if which not in ("all", name):
        continue
    for method in ["eth_chainId", "eth_supportedEntryPoints", "web3_clientVersion"]:
        try:
            st, body = x.rpc(url, method, [])
        except Exception as e:
            print(name, method, "STOPPED:", e); break
        print(name, method, "HTTP", st, json.dumps(body)[:300])
        if st in (401, 403):
            print(name, "-> requires key; stopping on this host"); break
print(x._counter())
