import sys, json
sys.path.insert(0, '.')
import lib
W = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"
c = lib.rpc("https://base.drpc.org", "eth_getCode", [W, "latest"]).get("result", "0x")
print("Base wrapper code bytes", (len(c) - 2) // 2, "codehash 0x" + lib.keccak256(bytes.fromhex(c[2:])).hex() if len(c) > 2 else "")
for slot in ("0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",):
    print("impl slot", lib.rpc("https://base.drpc.org", "eth_getStorageAt", [W, slot, "latest"]).get("result"))
st, t = lib.http("https://sourcify.dev/server/v2/contract/8453/" + W)
print("sourcify", st, t[:300])
st, t = lib.http("https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=0x3a022aa7")
print("4byte", st, t[:400])
# same address on XO?
cx = lib.rpc("https://rpc-mainnet-2.xo.market", "eth_getCode", [W, "latest"]).get("result", "0x")
print("XO code at same address bytes", (len(cx) - 2) // 2, ("codehash 0x" + lib.keccak256(bytes.fromhex(cx[2:])).hex()) if len(cx) > 2 else "")
print("same code on both chains:", cx == c)
