import json, sys
sys.path.insert(0, ".")
import rpc
code, j = rpc.call("https://mainnet-bundler.xo.market/", [("eth_supportedEntryPoints", [])], single=True)
print(code, json.dumps(j)[:500])
