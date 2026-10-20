import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://mainnet.base.org"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
print("chainId", lib.rpc(RPC, "eth_chainId"))
print("block", lib.rpc(RPC, "eth_blockNumber"))
c = lib.rpc(RPC, "eth_getCode", [ROUTER, "latest"])
code = c.get("result", "")
print("router code len bytes", (len(code) - 2) // 2, code[:80])
print("code keccak", "0x" + lib.keccak256(bytes.fromhex(code[2:])).hex())
