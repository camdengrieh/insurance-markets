import json, sys
sys.path.insert(0, ".")
import rpc, xohttp
# eth_supportedEntryPoints is on the permitted read list but not in the helper allowlist; add it explicitly.
rpc.ALLOWED.add("eth_supportedEntryPoints")
code, j = rpc.call("https://mainnet-bundler.xo.market/", [("eth_supportedEntryPoints", []), ("eth_chainId", [])])
print(code, json.dumps(j)[:500])
print(xohttp._load())
